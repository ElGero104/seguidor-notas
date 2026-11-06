
export const SUPABASE_URL = "https://iqkkxtiuvkaecncdutpt.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxa2t4dGl1dmthZWNuY2R1dHB0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzODg2MTMsImV4cCI6MjEwODk2NDYxM30.cpXdGxbz0ZwjsWGc0hB5__UzLb8S3cuPP5yVtL0i35o";
export const sb = () =>
  (typeof (globalThis as any).supabase !== "undefined" ? (globalThis as any).supabase : (window as any).supabase).createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );
let supabaseClient: any = null;
export const getSb = () => (supabaseClient ??= sb());

import { Materia, Nota, Clase, Evento, Recurso, Tarea, Archivo, Config } from "./types";
import { COLORS } from "./tema";

// ==================== CAPA DE BASE DE DATOS (MiniDB) ====================
/**
 * Caché en memoria: la fuente única de verdad es Supabase (pullCloud/syncCloud).
 * localStorage ya no se usa para datos; solo queda la sesión de Auth y el
 * contador de sesiones Pomodoro.
 */
export const CONFIG_DEFAULT: Config = { dark: false, tema_auto: true, nota_minima: 3.0, nota_ok: 4.0, archivados: [], activo: "", semestres: [], fechasSemestre: {} };

export const DB_SCHEMA = {
  materias: [] as Materia[],
  notas: [] as Nota[],
  clases: [] as Clase[],
  eventos: [] as Evento[],
  recursos: [] as Recurso[],
  tareas: [] as Tarea[],
  archivos: [] as Archivo[],
  config: [CONFIG_DEFAULT],
};

type Row = { id: string; [k: string]: any };

let MEM_CACHE: typeof DB_SCHEMA = { ...DB_SCHEMA, config: [{ ...CONFIG_DEFAULT }] };

export const MiniDB = {
  load(): typeof DB_SCHEMA {
    return MEM_CACHE;
  },

  setCache(db: typeof DB_SCHEMA) {
    MEM_CACHE = db;
  },

  persist(db: typeof DB_SCHEMA) {
    // Copia nueva para que React detecte el cambio (setData compara por referencia)
    MEM_CACHE = JSON.parse(JSON.stringify(db));
    syncCloud(db);
  },

  insert<T extends Row>(table: keyof typeof DB_SCHEMA, row: T): T {
    const db = MiniDB.load();
    (db[table] as T[]).push(row);
    MiniDB.persist(db);
    return row;
  },

  find<T extends Row>(table: keyof typeof DB_SCHEMA, filter?: (r: T) => boolean): T[] {
    const rows = MiniDB.load()[table] as T[];
    return filter ? rows.filter(filter) : rows.slice();
  },

  update<T extends Row>(table: keyof typeof DB_SCHEMA, id: string, patch: Partial<T>): void {
    const db = MiniDB.load();
    const rows = db[table] as T[];
    const i = rows.findIndex((r) => r.id === id);
    if (i !== -1) rows[i] = { ...rows[i], ...patch };
    MiniDB.persist(db);
  },

  remove(table: keyof typeof DB_SCHEMA, id: string): void {
    MiniDB.removeWhere(table, (r: Row) => r.id === id);
  },

  removeWhere(table: keyof typeof DB_SCHEMA, filter: (r: Row) => boolean): void {
    const db = MiniDB.load();
    db[table] = (db[table] as Row[]).filter((r) => !filter(r));
    MiniDB.persist(db);
  },

  saveConfig(patch: Partial<Config>): void {
    const db = MiniDB.load();
    db.config[0] = { ...db.config[0], ...patch };
    MiniDB.persist(db);
    syncConfigCloud(db.config[0]);
  },
};

// ==================== SINCRONIZACIÓN CON SUPABASE ====================
// La app funciona offline con localStorage; con sesión iniciada, cada
// escritura también se refleja en la nube (upsert por tabla) y al entrar
// se descargan los datos del usuario desde Supabase.
const CLOUD_TABLES: Record<string, string> = {
  materias: "materias",
  notas: "notas",
  clases: "clases",
  eventos: "eventos",
  recursos: "recursos",
  tareas: "tareas",
  archivos: "archivos",
};

export function cloudRow(table: string, row: Row, userId: string) {
  const base: any = { id: row.id, user_id: userId };
  if (table === "materias") Object.assign(base, { nombre: row.nombre, profesor: row.profesor, creditos: row.creditos, color: row.color, semestre_nombre: row.semestre });
  if (table === "notas") Object.assign(base, { materia_id: row.materiaId, nombre: row.nombre, puntaje: row.valor, puntaje_maximo: 5, porcentaje: row.porcentaje, fecha: row.fecha ?? null });
  if (table === "clases") Object.assign(base, { materia_id: row.materiaId, dia: row.dia, inicio: row.inicio, fin: row.fin, salon: row.salon });
  if (table === "eventos") Object.assign(base, { titulo: row.titulo, fecha: row.fecha, hora: row.hora ?? null, lugar: row.lugar ?? null });
  if (table === "recursos") Object.assign(base, { materia_id: row.materiaId, titulo: row.titulo, url: row.url ?? "", tipo: row.tipo ?? "link" });
  if (table === "tareas") Object.assign(base, { materia_id: row.materiaId, titulo: row.titulo, descripcion: row.descripcion ?? null, fecha: row.fecha ?? null, completada: row.completada ?? false, creada: row.creada ?? new Date().toISOString() });
  if (table === "archivos") Object.assign(base, { materia_id: row.materiaId, nombre: row.nombre, extension: row.extension, storage_path: row.storagePath, tamano: row.tamano ?? 0, subido: row.subido ?? new Date().toISOString() });
  return base;
}

export async function syncCloud(db: typeof DB_SCHEMA) {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return;
    for (const [local, remote] of Object.entries(CLOUD_TABLES)) {
      const rows = (db as any)[local] as Row[];
      const payload = rows.map((r) => cloudRow(local, r, uidUser));
      if (payload.length) await getSb().from(remote).upsert(payload);
      const idsLocales = new Set(rows.map((r) => r.id));
      const remotos = (await getSb().from(remote).select("id").eq("user_id", uidUser)).data || [];
      const aBorrar = remotos.filter((r: any) => !idsLocales.has(r.id)).map((r: any) => r.id);
      if (aBorrar.length) await getSb().from(remote).delete().in("id", aBorrar);
    }
  } catch {}
}

export async function syncConfigCloud(cfg: Config) {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return;
    await getSb().from("config_usuario").upsert({
      user_id: uidUser,
      dark: cfg.dark,
      tema_auto: cfg.tema_auto ?? true,
      nota_minima: cfg.nota_minima,
      nota_ok: cfg.nota_ok,
      archivados: cfg.archivados,
      activo: cfg.activo,
      semestres: cfg.semestres,
      fechas_semestre: cfg.fechasSemestre || {},
    });
    const idsSem = [];
    for (const nombre of cfg.semestres) {
      const id = semestreId(uidUser, nombre);
      idsSem.push(id);
      await getSb().from("semestres").upsert({
        id,
        user_id: uidUser,
        nombre,
        activo: nombre === cfg.activo,
      });
    }
    const semsRemotos = (await getSb().from("semestres").select("id").eq("user_id", uidUser)).data || [];
    const semsABorrar = semsRemotos.filter((s: any) => !idsSem.includes(s.id)).map((s: any) => s.id);
    if (semsABorrar.length) await getSb().from("semestres").delete().in("id", semsABorrar);
  } catch {}
}

export function semestreId(userId: string, nombre: string) {
  let h = 2166136261 >>> 0;
  const s = userId + "|" + nombre;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  return `00000000-0000-4000-8000-${hex}${hex.slice(0, 4)}`;
}

export async function pullCloud() {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return;
    const db = MiniDB.load();
    // Solo columnas necesarias (menos payload) y en paralelo
    const get = async (remote: string, cols: string) =>
      (await getSb().from(remote).select(cols).eq("user_id", uidUser)).data || [];
    const [mats, notas, clases, eventos, recursos, tareas, archivos, sems, cfgRow] = await Promise.all([
      get("materias", "id,nombre,profesor,creditos,color,semestre_nombre"),
      get("notas", "id,materia_id,nombre,puntaje,porcentaje,fecha"),
      get("clases", "id,materia_id,dia,inicio,fin,salon"),
      get("eventos", "id,titulo,fecha,hora,lugar"),
      get("recursos", "id,materia_id,titulo,url,tipo"),
      get("tareas", "id,materia_id,titulo,descripcion,fecha,completada,creada"),
      get("archivos", "id,materia_id,nombre,extension,storage_path,tamano,subido"),
      get("semestres", "nombre,activo"),
      get("config_usuario", "dark,tema_auto,nota_minima,nota_ok,archivados,activo,semestres,fechas_semestre"),
    ]);
    if (sems.length) {
      const nombres = sems.map((s: any) => s.nombre);
      const activo = (sems.find((s: any) => s.activo) || {}).nombre || nombres.slice().sort().pop() || "";
      db.config[0] = { ...db.config[0], semestres: nombres, activo };
    }
    if (cfgRow[0]) {
      db.config[0] = {
        ...db.config[0],
        dark: cfgRow[0].dark,
        tema_auto: cfgRow[0].tema_auto ?? true,
        nota_minima: cfgRow[0].nota_minima,
        nota_ok: cfgRow[0].nota_ok,
        archivados: cfgRow[0].archivados || [],
        activo: cfgRow[0].activo || db.config[0].activo,
        semestres: cfgRow[0].semestres?.length ? cfgRow[0].semestres : db.config[0].semestres,
        fechasSemestre: cfgRow[0].fechas_semestre || {},
      };
    }
    (db.materias as Materia[]) = mats.map((m: any) => ({ id: m.id, nombre: m.nombre, profesor: m.profesor ?? "", creditos: m.creditos ?? 0, color: m.color ?? COLORS[0], semestre: m.semestre_nombre ?? "Sin semestre" }));
    (db.notas as Nota[]) = notas.map((n: any) => ({ id: n.id, materiaId: n.materia_id, nombre: n.nombre, valor: n.puntaje, porcentaje: n.porcentaje ?? 0, fecha: n.fecha ?? undefined }));
    (db.clases as Clase[]) = clases.map((c: any) => ({ id: c.id, materiaId: c.materia_id, dia: c.dia, inicio: c.inicio, fin: c.fin, salon: c.salon ?? "" }));
    (db.eventos as Evento[]) = eventos.map((e: any) => ({ id: e.id, titulo: e.titulo, fecha: e.fecha, hora: e.hora ?? undefined, lugar: e.lugar ?? undefined }));
    (db.recursos as Recurso[]) = recursos.map((r: any) => ({ id: r.id, materiaId: r.materia_id, titulo: r.titulo, url: r.url ?? "", tipo: r.tipo ?? "link" }));
    (db.tareas as Tarea[]) = tareas.map((t: any) => ({ id: t.id, materiaId: t.materia_id, titulo: t.titulo, descripcion: t.descripcion ?? undefined, fecha: t.fecha ?? undefined, completada: t.completada ?? false, creada: t.creada ?? new Date().toISOString() }));
    (db.archivos as Archivo[]) = archivos.map((a: any) => ({ id: a.id, materiaId: a.materia_id, nombre: a.nombre, extension: a.extension ?? "", storagePath: a.storage_path ?? "", tamano: a.tamano ?? 0, subido: a.subido ?? new Date().toISOString() }));
    MiniDB.setCache(db);
    // Reconstruir eventos AVISO:* desde las notas con avisos extra
    try {
      const sb = getSb();
      for (const n of db.notas as Nota[]) {
        if (n.fecha && (n.avisos || []).length) {
          const prev = (await sb.from("eventos").select("id,titulo").eq("user_id", uidUser).ilike("titulo", `AVISO:${n.id}:%`)).data || [];
          if (prev.length) await sb.from("eventos").delete().in("id", prev.map((p: any) => p.id));
          for (const a of n.avisos || []) {
            const delta = a === "-3d" ? 3 : 0;
            const f = new Date(n.fecha + "T12:00:00");
            f.setDate(f.getDate() - delta);
            await sb.from("eventos").insert({ id: uid(), user_id: uidUser, titulo: `AVISO:${n.id}:${a}`, fecha: f.toISOString().slice(0, 10), hora: "08:00" });
          }
        }
      }
    } catch {}
  } catch {}
}

// Generador de ids (UUID v4, compatible con las columnas uuid de Supabase)
export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }));

import { useState, useEffect } from "react";

// ==================== HOOK DE ESTADO CONECTADO A LA DB ====================

export function useDB() {
  const [data, setData] = useState(() => MiniDB.load());
  const refresh = () => setData(MiniDB.load());
  useEffect(() => { refresh(); }, []);
  // Refresco global: al deshacer o restaurar un respaldo, todos los
  // componentes conectados con useDB() recargan desde la caché/DB
  useEffect(() => {
    const h = () => refresh();
    window.addEventListener("db-undo", h);
    return () => { window.removeEventListener("db-undo", h); };
  }, []);
  return { data, refresh };
}

/**
 * Respaldo automático a la nube: guarda el estado completo como JSON en la
 * tabla recursos (tipo "backup") del usuario. Se ejecuta al iniciar sesión y
 * como máximo 1 vez por semana; conserva los últimos 4 respaldos.
 */
export async function respaldoAutoNube() {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return;
    const sb = getSb();
    const last = (await sb.from("recursos").select("titulo").eq("user_id", uidUser).eq("tipo", "backup").order("titulo", { ascending: false }).limit(1)).data?.[0];
    const hoy = new Date().toISOString().slice(0, 10);
    if (last && last.titulo.includes(hoy)) return; // ya hay respaldo de hoy
    const payload = JSON.stringify({ app: "seguidor-notas", version: 1, fecha: new Date().toISOString(), db: JSON.parse(JSON.stringify(MiniDB.load())) });
    await sb.from("recursos").insert({
      id: uid(), user_id: uidUser, materia_id: null as any,
      titulo: "respaldo-auto-" + hoy, url: payload, tipo: "backup",
    });
    // conservar solo los últimos 4
    const todos = (await sb.from("recursos").select("id,titulo").eq("user_id", uidUser).eq("tipo", "backup").order("titulo", { ascending: false })).data || [];
    const viejos = todos.slice(4).map((r: any) => r.id);
    if (viejos.length) await sb.from("recursos").delete().in("id", viejos);
  } catch {}
}

/** Descarga el último respaldo automático de la nube (si existe y es más reciente que el local). */

export async function restaurarAutoNubeSiMasReciente() {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return false;
    const sb = getSb();
    const r = await sb.from("recursos").select("titulo,url").eq("user_id", uidUser).eq("tipo", "backup").order("titulo", { ascending: false }).limit(1);
    const last = r.data?.[0] as any;
    if (!last?.url) return false;
    const p = JSON.parse(last.url);
    const db = p && p.app === "seguidor-notas" && p.db ? p.db : null;
    if (!db || !Array.isArray(db.materias)) return false;
    const cfgR: Config = { ...CONFIG_DEFAULT, ...(db.config?.[0] || {}) };
    const actual = { ...DB_SCHEMA, ...db, config: [cfgR] };
    MiniDB.setCache(JSON.parse(JSON.stringify(actual)));
    return true;
  } catch { return false; }
}

function exportarJSON() {
  const respaldo = {
    app: "seguidor-notas",
    version: 1,
    fecha: new Date().toISOString(),
    db: JSON.parse(JSON.stringify(MiniDB.load())),
  };
  const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seguidor-notas-respaldo-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

function restaurarJSON(archivo: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(String(reader.result));
      // Acepta el respaldo con envoltorio ({app, db, fecha}) o la DB cruda
      const db: any = p && p.app === "seguidor-notas" && p.db ? p.db : p;
      if (!db || !Array.isArray(db.materias) || !Array.isArray(db.notas) ||
          !Array.isArray(db.clases) || !Array.isArray(db.config)) {
        throw new Error("formato inválido");
      }
      const cfgR: Config = { ...CONFIG_DEFAULT, ...(db.config[0] || {}) };
      if (!confirm(
        `♻️ ¿Restaurar este respaldo?\n\n` +
        `Se REEMPLAZARÁN todos los datos actuales de este navegador.\n\n` +
        `El archivo contiene ${db.materias.length} materia(s) en ${(cfgR.semestres || []).length} semestre(s).`
      )) return;
       // también deshacible durante 5 s
      MiniDB.persist({ ...DB_SCHEMA, ...db, config: [cfgR] });
      window.dispatchEvent(new Event("db-undo"));
    } catch {
      alert("❌ El archivo no es un respaldo válido de Seguidor de Notas.");
    }
  };
  reader.readAsText(archivo);
}
