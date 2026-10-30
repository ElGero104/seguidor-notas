
// Importación de React y sus hooks para manejar estado (useState) y ciclos de vida (useEffect)
import React, { useState, useEffect } from "react";

// ==================== TIPOS DE DATOS ====================

// Una materia: identificada por id único, con datos académicos y color visual
type Materia = {
  id: string;
  nombre: string;
  profesor: string;
  creditos: number;
  color: string;
  semestre: string; // carpeta de agrupación, ej: "2026-2"
};

// Una nota/evaluación. valor === null significa PENDIENTE (aún sin calificar):
// no cuenta como 0 en los promedios, solo su peso queda "por evaluar".
type Nota = {
  id: string;
  materiaId: string;
  nombre: string;
  valor: number | null; // calificación 0-5, o null si está pendiente
  porcentaje: number; // peso en la nota final (ej: 30 = 30%)
  fecha?: string; // fecha de entrega opcional "YYYY-MM-DD"
};

// Una clase dentro del horario semanal
type Clase = {
  id: string;
  materiaId: string;
  dia: number; // 0 = Lunes
  inicio: string;
  fin: string;
  salon: string;
};

// Configuración global (tabla singleton, fila 0)
type Config = {
  dark: boolean; // tema oscuro
  nota_minima: number; // para "ganar" la materia (ej: 3.0)
  nota_ok: number; // rango de color ámbar->verde (ej: 4.0)
  archivados: string[]; // semestres archivados
  activo: string; // semestre activo (el único que se muestra)
  semestres: string[]; // lista de semestres registrados
};

// Paleta de colores cíclica por materia
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
// Días del horario semanal
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
// Meses del calendario
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ==================== CAPA DE BASE DE DATOS (MiniDB) ====================
/**
 * Motor embebido tipo ORM: la DB es un objeto { tabla: filas[] } en localStorage.
 * En load() se fusiona la config guardada con los valores por defecto,
 * para que los campos nuevos (nota_minima, archivados, etc.) siempre existan.
 */
const DB_KEY = "seguidor-notas-db";

const CONFIG_DEFAULT: Config = { dark: false, nota_minima: 3.0, nota_ok: 4.0, archivados: [], activo: "", semestres: [] };

const DB_SCHEMA = {
  materias: [] as Materia[],
  notas: [] as Nota[],
  clases: [] as Clase[],
  config: [CONFIG_DEFAULT],
};

type Row = { id: string; [k: string]: any };

const MiniDB = {
  load(): typeof DB_SCHEMA {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        // Merge de la config: defaults + campos guardados (compatibilidad hacia atrás)
        const cfg = { ...CONFIG_DEFAULT, ...(p.config?.[0] || {}) };
        // Migración: derivar la lista de semestres de las materias existentes
        // y elegir el último como activo (compatibilidad con datos antiguos)
        if (!cfg.semestres || cfg.semestres.length === 0) {
          cfg.semestres = [...new Set((p.materias || []).map((m: any) => m.semestre || "Sin semestre"))];
        }
        if (!cfg.activo || !cfg.semestres.includes(cfg.activo)) {
          cfg.activo = cfg.semestres.slice().sort()[cfg.semestres.length - 1] || "";
        }
        return { ...DB_SCHEMA, ...p, config: [cfg] };
      }
    } catch {}
    return { ...DB_SCHEMA, config: [{ ...CONFIG_DEFAULT }] };
  },

  persist(db: typeof DB_SCHEMA) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
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
  },
};

// Generador de ids pseudoaleatorios
const uid = () => Math.random().toString(36).slice(2, 10);

// ==================== CÁLCULOS ACADÉMICOS ====================

/** Promedio ponderado de una materia, SOLO sobre las notas ya calificadas. */
function promedio(notas: Nota[], materiaId: string) {
  const ns = notas.filter((n) => n.materiaId === materiaId && n.valor !== null);
  const totalPeso = ns.reduce((s, n) => s + n.porcentaje, 0);
  if (!ns.length || totalPeso === 0) return null;
  return ns.reduce((s, n) => s + (n.valor as number) * n.porcentaje, 0) / totalPeso;
}

/** Promedio ponderado por créditos de un semestre (materias con notas). */
function promedioSemestre(data: any, sem: string) {
  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === sem);
  let suma = 0, peso = 0;
  mats.forEach((m) => {
    const p = promedio(data.notas, m.id);
    if (p !== null) { suma += p * m.creditos; peso += m.creditos; }
  });
  return peso ? suma / peso : null;
}

/**
 * Cálculo central de mínimos (usado por Notas y Simulador):
 *   acumulado = Σ(valor × peso) de las calificadas  -> puntos ganados /100
 *   restante  = 100 − peso calificado              -> % pendiente
 *   requerida = (objetivo×100 − acumulado)/restante -> nota mínima en lo pendiente
 *   maximo    = (acumulado + 5×restante)/100        -> mejor nota final posible
 */
function calculo(notas: Nota[], objetivo: number) {
  const ev = notas.filter((n) => n.valor !== null);
  const acumulado = ev.reduce((s, n) => s + (n.valor as number) * n.porcentaje, 0);
  const pesoEval = ev.reduce((s, n) => s + n.porcentaje, 0);
  const restante = Math.max(0, 100 - pesoEval);
  const requerida = restante > 0 ? (objetivo * 100 - acumulado) / restante : null;
  const maximo = restante > 0 ? (acumulado + 5 * restante) / 100 : acumulado / 100;
  return { acumulado, pesoEval, restante, requerida, maximo };
}

/** Días hasta una fecha "YYYY-MM-DD" (negativo = venció). null si no hay fecha. */
function diasHasta(fecha?: string): number | null {
  if (!fecha) return null;
  const f = new Date(fecha + "T00:00:00");
  if (isNaN(f.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}

// ==================== TEMA (DARK MODE) ====================
/** Tokens de clases Tailwind según el tema: la app pasa `t` a todos los componentes. */
function tokens(dark: boolean) {
  return {
    page: dark ? "bg-slate-900" : "bg-slate-100",
    card: dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200",
    text: dark ? "text-slate-100" : "text-slate-800",
    sub: dark ? "text-slate-400" : "text-slate-500",
    faint: dark ? "text-slate-500" : "text-slate-400",
    input: dark
      ? "bg-slate-900 border-slate-600 text-slate-100 placeholder-slate-500"
      : "bg-white border-slate-300 text-slate-800 placeholder-slate-400",
    softBtn: dark ? "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30" : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100",
    nav: dark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200",
    navIn: dark ? "text-slate-300 hover:bg-slate-700" : "text-slate-600 hover:bg-slate-100",
    group: dark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200",
    groupCard: dark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-100",
    ok: dark ? "text-emerald-400" : "text-emerald-600",
    okBg: dark ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-700",
    badBg: dark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-700",
    warnBg: dark ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700",
    grad: dark ? "from-indigo-500 to-violet-500" : "from-indigo-600 to-violet-600",
    h2: dark ? "text-slate-200 border-indigo-500/40" : "text-slate-700 border-indigo-200",
    ring: dark ? "ring-2 ring-indigo-500" : "ring-2 ring-indigo-400",
    hero: dark ? "from-indigo-600 via-violet-600 to-fuchsia-600" : "from-indigo-500 via-violet-500 to-fuchsia-500",
    heroCard: "bg-white/15 backdrop-blur border border-white/20",
    navMob: dark ? "bg-slate-900/95 border-slate-700" : "bg-white/95 border-slate-200",
  };
}

/** Color por estado según rangos de la config: <mínima rojo, <ok ámbar, >=ok verde. */
function estadoTxt(v: number, cfg: Config, t: any) {
  if (v < cfg.nota_minima) return "text-red-500 font-semibold";
  if (v < cfg.nota_ok) return "text-amber-500 font-semibold";
  return t.ok + " font-semibold";
}
function estadoBg(v: number, cfg: Config, t: any) {
  if (v < cfg.nota_minima) return t.badBg;
  if (v < cfg.nota_ok) return t.warnBg;
  return t.okBg;
}

// Clases base compartidas
const cardBase = "rounded-2xl border shadow-md p-5 transition hover:shadow-lg";
const inputBase = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
const labelBase = "block text-xs font-semibold mb-1 uppercase tracking-wide";

/** Botón con variantes primary / soft (adaptada al tema) / danger. */
function Btn({ children, onClick, tone = "primary", t, className = "" }: any) {
  const tones = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    soft: t.softBtn,
    danger: t ? "text-red-500 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50",
  };
  return (
    <button onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

/** Badge de fecha de entrega con urgencia por color. */
function FechaBadge({ fecha, t }: any) {
  const d = diasHasta(fecha);
  if (d === null) return null;
  if (d < 0) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.badBg}`}>🔴 venció hace {-d} d</span>;
  if (d === 0) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.warnBg}`}>⏰ ¡vence hoy!</span>;
  if (d <= 7) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.warnBg}`}>📌 en ${d} d</span>;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.okBg}`}>📅 ${d} d</span>;
}

/**
 * Animación de entrada (fade + deslizamiento) implementada con CSS puro:
 * portátil al canvas y a la web standalone, sin dependencias externas.
 * Cambiar `k` (ej. la pestaña activa) reinicia la animación.
 */
function Fade({ children, k }: any) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    const id = setTimeout(() => setOn(true), 10); // re-dispara la transición
    return () => clearTimeout(id);
  }, [k]);
  return (
    <div style={{
      opacity: on ? 1 : 0,
      transform: on ? "none" : "translateY(10px)",
      transition: "opacity 0.25s ease, transform 0.25s ease",
    }}>
      {children}
    </div>
  );
}

// ==================== HOOK DE ESTADO CONECTADO A LA DB ====================

function useDB() {
  const [data, setData] = useState(() => MiniDB.load());
  const refresh = () => setData(MiniDB.load());
  useEffect(() => { refresh(); }, []);
  return { data, refresh };
}

// ==================== EXPORTAR CSV/EXCEL ====================
/**
 * Exporta todas las materias con sus notas a CSV (separador ";" + BOM UTF-8
 * para que Excel lo abra con acentos correctos) y dispara la descarga.
 */
function exportarCSV(data: any) {
  const rows: string[][] = [["Materia", "Semestre", "Nota", "Valor (0-5)", "Peso (%)", "Fecha entrega", "Estado"]];
  (data.materias as Materia[]).forEach((m) => {
    MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id).forEach((n) => {
      rows.push([
        m.nombre, m.semestre, n.nombre,
        n.valor !== null ? String(n.valor) : "",
        String(n.porcentaje), n.fecha ?? "",
        n.valor !== null ? "Calificada" : "Pendiente",
      ]);
    });
  });
  if (rows.length === 1) { alert("⚠️ No hay notas que exportar."); return; }
  // Escapar comillas y unir con ";" (formato que Excel reconoce en es-CO)
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seguidor-notas.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== PESTAÑA MATERIAS ====================

/**
 * Vista de materias del SEMESTRE ACTIVO (se elige en el encabezado):
 * crear materias dentro de ese semestre, búsqueda, archivar/restaurar,
 * próximas entregas, notas y exportación CSV.
 */
function TabMaterias({ data, refresh, t }: any) {
  const [form, setForm] = useState({ nombre: "", profesor: "", creditos: 3 });
  const [q, setQ] = useState("");
  const cfg: Config = data.config[0];
  const activo = cfg.activo;
  const arch: string[] = cfg.archivados || [];

  // Las materias nuevas nacen dentro del semestre activo
  const agregar = () => {
    if (!activo) { alert("⚠️ Primero crea un semestre: elige ➕ Añadir semestre… en el encabezado."); return; }
    if (!form.nombre.trim()) return;
    MiniDB.insert<Materia>("materias", {
      id: uid(),
      nombre: form.nombre.trim(),
      profesor: form.profesor.trim(),
      creditos: Number(form.creditos) || 0,
      color: COLORS[MiniDB.find<Materia>("materias").length % COLORS.length],
      semestre: activo,
    });
    setForm({ nombre: "", profesor: "", creditos: 3 });
    refresh();
  };

  // DELETE en cascada: materia + notas + clases
  const eliminar = (id: string) => {
    MiniDB.remove("materias", id);
    MiniDB.removeWhere("notas", (n) => n.materiaId === id);
    MiniDB.removeWhere("clases", (c) => c.materiaId === id);
    refresh();
  };

  // Archivar / restaurar el semestre activo
  const toggleArchivo = () => {
    MiniDB.saveConfig({ archivados: arch.includes(activo) ? arch.filter((x) => x !== activo) : [...arch, activo] });
    refresh();
  };

  // Filtro de búsqueda (nombre y profesor)
  const coincide = (m: Materia) =>
    !q.trim() || (m.nombre + " " + m.profesor).toLowerCase().includes(q.trim().toLowerCase());

  // Materias del semestre activo
  const todos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo).filter(coincide);
  const psem = promedioSemestre(data, activo);
  const archivado = arch.includes(activo);

  // Sin semestres aún: guiar al selector del encabezado
  if (!activo) {
    return (
      <div className={"rounded-3xl border-2 border-dashed p-10 text-center " + t.card}>
        <div className="text-5xl mb-3">📂</div>
        <h2 className={"text-xl font-bold " + t.text}>Aún no hay semestres</h2>
        <p className={"text-sm mt-2 " + t.sub}>
          Crea tu primer semestre con la opción "➕ Añadir semestre…" del encabezado. Luego añade materias aquí.
        </p>
      </div>
    );
  }

  // Próximas entregas: 5 notas con fecha más cercana (solo del semestre activo)
  const idsActivos = new Set((data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo).map((m) => m.id));
  const proximas = (data.notas as Nota[])
    .filter((n) => n.fecha && idsActivos.has(n.materiaId))
    .sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* --- Encabezado del semestre activo --- */}
      <div className={"flex flex-wrap items-center justify-between gap-2 border-b-2 pb-1 " + t.h2}>
        <h2 className="text-lg font-bold">
          {archivado ? "🗄️" : "📂"} {activo}
          <span className={"text-sm font-normal " + t.sub}> · {todos.length} materia{todos.length === 1 ? "" : "s"}</span>
        </h2>
        <div className="flex items-center gap-2">
          {psem !== null && (
            <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(psem, cfg, t)}>
              Prom. semestre: {psem.toFixed(2)}
            </span>
          )}
          <button onClick={toggleArchivo} className={t.faint + " hover:text-indigo-400 text-sm"}
            title={archivado ? "Restaurar semestre" : "Archivar semestre"}>
            {archivado ? "📂 Restaurar" : "🗄️ Archivar semestre"}
          </button>
        </div>
      </div>

      {archivado && (
        <div className={"rounded-xl px-4 py-2 text-sm " + t.warnBg}>
          🗄️ Semestre archivado (solo consulta). Pulsa "Restaurar" para volver a trabajarlo.
        </div>
      )}

      {/* --- Crear materia (dentro del semestre activo) + exportar CSV --- */}
      <div className={cardBase + " " + t.card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={"font-bold " + t.text}>➕ Crear materia en {activo}</h2>
          <Btn t={t} tone="soft" onClick={() => exportarCSV(data)}>⬇️ Exportar CSV/Excel</Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <span className={labelBase + " " + t.sub}>Nombre</span>
            <input className={inputBase + " " + t.input} value={form.nombre}
              placeholder="Ej: Análisis y Diseño de Sistemas I"
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div>
            <span className={labelBase + " " + t.sub}>Profesor</span>
            <input className={inputBase + " " + t.input} value={form.profesor} placeholder="Opcional"
              onChange={(e) => setForm({ ...form, profesor: e.target.value })} />
          </div>
          <div>
            <span className={labelBase + " " + t.sub}>Créditos</span>
            <div className="flex gap-2">
              <input className={inputBase + " " + t.input} type="number" min={0} value={form.creditos}
                onChange={(e) => setForm({ ...form, creditos: e.target.value })} />
              <Btn t={t} onClick={agregar}>Añadir</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* --- Búsqueda --- */}
      <div className={cardBase + " " + t.card}>
        <input className={inputBase + " " + t.input} placeholder="🔍 Buscar materia o profesor…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* --- Próximas entregas --- */}
      {proximas.length > 0 && (
        <Fade k="prox">
          <div className={cardBase + " " + t.card}>
            <h2 className={"font-bold mb-3 " + t.text}>⏳ Próximas entregas</h2>
            <div className="space-y-1.5">
              {proximas.map((n) => {
                const m = (data.materias as Materia[]).find((x) => x.id === n.materiaId);
                return (
                  <div key={n.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                    <span className="font-medium" style={{ color: m?.color }}>{m?.nombre ?? "—"}</span>
                    <span>· {n.nombre} · {n.fecha}</span>
                    <FechaBadge fecha={n.fecha} t={t} />
                  </div>
                );
              })}
            </div>
          </div>
        </Fade>
      )}

      {/* --- Materias del semestre activo --- */}
      {todos.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          Todavía no hay materias en este semestre. Crea la primera arriba. 👆
        </div>
      )}
      {todos.map((m: Materia) => {
        const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
        const p = promedio(data.notas, m.id);
        const c = calculo(ns, cfg.nota_minima);
        return (
          <Fade key={m.id} k={m.id}>
            <div className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={"font-bold " + t.text}>{m.nombre}</div>
                  <div className={"text-sm " + t.sub}>
                    {m.profesor || "Sin profesor"} · {m.creditos} créditos · {c.pesoEval}% calificado · {c.restante}% pendiente
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p !== null && (
                    <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(p, cfg, t)}>
                      {p.toFixed(2)}
                    </span>
                  )}
                  <Btn t={t} tone="danger" onClick={() => eliminar(m.id)}>✕</Btn>
                </div>
              </div>

              {/* Aviso: mínimo para ganar la materia (solo si hay pendientes) */}
              {c.restante > 0 && (
                <div className={"mt-2 text-xs " + t.sub}>
                  {c.requerida !== null && c.requerida <= 0 ? (
                    <span className={t.ok + " font-semibold"}>✅ Materia asegurada (≥ {cfg.nota_minima})</span>
                  ) : c.requerida !== null && c.requerida > 5 ? (
                    <span className="text-red-500 font-semibold">🔴 Ya no es posible ganarla (máx. {c.maximo.toFixed(2)})</span>
                  ) : (
                    <span>🎯 Para ganar necesitas <strong>{c.requerida!.toFixed(2)}</strong> en el {c.restante}% pendiente · máximo posible: {c.maximo.toFixed(2)}</span>
                  )}
                </div>
              )}

              {/* Lista de notas */}
              <div className="mt-3 space-y-2">
                {ns.length === 0 && <div className={"text-sm " + t.faint}>Sin notas registradas</div>}
                {ns.map((n: Nota) => (
                  <div key={n.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                    <span className="flex-1">
                      {n.nombre} <span className={t.faint}>({n.porcentaje}%)</span>{" "}
                      <FechaBadge fecha={n.fecha} t={t} />
                    </span>
                    {n.valor === null ? (
                      <span className={"text-xs italic " + t.faint}>pendiente</span>
                    ) : (
                      <span className={estadoTxt(n.valor, cfg, t)}>{n.valor.toFixed(1)}</span>
                    )}
                    <button className={t.faint + " hover:text-red-500"}
                      onClick={() => { MiniDB.remove("notas", n.id); refresh(); }}>✕</button>
                  </div>
                ))}
              </div>
              <FormNota materiaId={m.id} refresh={refresh} t={t} />
            </div>
          </Fade>
        );
      })}
    </div>
  );
}

/** Alta de notas: valor vacío = PENDIENTE (null), no cuenta como 0. */
function FormNota({ materiaId, refresh, t }: any) {
  const [f, setF] = useState({ nombre: "", valor: "", porcentaje: "", fecha: "" });
  const add = () => {
    const pct = parseFloat(f.porcentaje);
    if (!f.nombre.trim() || isNaN(pct) || pct <= 0) return;
    const valor = f.valor === "" ? null : parseFloat(f.valor); // "" -> pendiente
    if (valor !== null && (isNaN(valor) || valor < 0 || valor > 5)) return;
    MiniDB.insert<Nota>("notas", {
      id: uid(), materiaId, nombre: f.nombre.trim(), valor, porcentaje: pct,
      fecha: f.fecha || undefined,
    });
    setF({ nombre: "", valor: "", porcentaje: "", fecha: "" });
    refresh();
  };
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t pt-3" style={{ borderColor: "rgba(148,163,184,0.2)" }}>
      <input className={inputBase + " " + t.input} placeholder="Nota (ej: Parcial 1)" value={f.nombre}
        onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <input className={inputBase + " " + t.input} type="number" min={0} max={5} step={0.1} placeholder="Valor (vacío = pendiente)" value={f.valor}
        onChange={(e) => setF({ ...f, valor: e.target.value })} />
      <input className={inputBase + " " + t.input} type="number" min={0} placeholder="% peso" value={f.porcentaje}
        onChange={(e) => setF({ ...f, porcentaje: e.target.value })} />
      <input className={inputBase + " " + t.input} type="date" title="Fecha de entrega (opcional)" value={f.fecha}
        onChange={(e) => setF({ ...f, fecha: e.target.value })} />
      <Btn t={t} tone="soft" onClick={add}>+ Nota</Btn>
    </div>
  );
}

// ==================== PESTAÑA NOTAS (ESTRUCTURA DE EVALUACIÓN) ====================

/**
 * Estructura de evaluación por materia. Las notas generadas nacen PENDIENTES
 * (valor null); cada fila pendiente muestra el mínimo requerido para ganar.
 */
function TabNotas({ data, refresh, t }: any) {
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const cfg: Config = data.config[0];

  /** Genera N notas con pesos iguales (la última absorbe el redondeo). */
  const generar = (m: Materia) => {
    const n = parseInt(cantidades[m.id] || "", 10);
    if (!n || n < 1 || n > 20) {
      alert("⚠️ Ingresa una cantidad de notas entre 1 y 20.");
      return;
    }
    const actuales = MiniDB.find<Nota>("notas", (x) => x.materiaId === m.id);
    if (actuales.length > 0 && !confirm(`¿Reemplazar las ${actuales.length} notas actuales de ${m.nombre}?`)) return;
    MiniDB.removeWhere("notas", (x) => x.materiaId === m.id);
    const peso = Math.floor((100 / n) * 10) / 10;
    for (let i = 1; i <= n; i++) {
      const pct = i === n ? +(100 - peso * (n - 1)).toFixed(1) : peso;
      MiniDB.insert<Nota>("notas", {
        id: uid(), materiaId: m.id, nombre: `Nota ${i}`, valor: null, porcentaje: pct, // nacen pendientes
      });
    }
    refresh();
  };

  /** UPDATE inline: nombre / peso / valor / fecha (vacío -> pendiente). */
  const editarNota = (id: string, campo: "nombre" | "porcentaje" | "valor" | "fecha", valor: string) => {
    const patch: any = {};
    if (campo === "nombre") patch.nombre = valor;
    if (campo === "porcentaje") patch.porcentaje = parseFloat(valor) || 0;
    if (campo === "valor") patch.valor = valor === "" ? null : parseFloat(valor) || 0;
    if (campo === "fecha") patch.fecha = valor || undefined;
    MiniDB.update<Nota>("notas", id, patch);
    refresh();
  };

  const activo = cfg.activo;
  const matsActivos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo);
  const sems = matsActivos.length ? [activo] : [];

  return (
    <div className="space-y-5">
      {matsActivos.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          No hay materias en el semestre activo ({activo || "sin semestre"}). Crea materias en la pestaña Materias.
        </div>
      )}

      {sems.map((sem) => {
        const psem = promedioSemestre(data, sem);
        return (
          <div key={sem} className="space-y-4">
            <div className={"flex items-center justify-between border-b-2 pb-1 " + t.h2}>
              <h2 className="text-lg font-bold">📁 {sem}</h2>
              {psem !== null && (
                <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(psem, cfg, t)}>
                  Prom. semestre: {psem.toFixed(2)}
                </span>
              )}
            </div>
            {(data.materias as Materia[])
              .filter((m) => (m.semestre || "Sin semestre") === sem)
              .map((m: Materia) => {
                const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
                const p = promedio(ns, m.id);
                const sumaPeso = ns.reduce((s, n) => s + n.porcentaje, 0);
                // Cálculo del mínimo para ganar la materia (respondido en la UI)
                const c = calculo(ns, cfg.nota_minima);
                const minPorNota = c.requerida; // mínimo uniforme en cada pendiente

                return (
                  <Fade key={m.id} k={m.id}>
                    <div className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                          <div className={"font-bold " + t.text}>{m.nombre}</div>
                          <div className={"text-sm " + t.sub}>
                            {ns.length} nota{ns.length === 1 ? "" : "s"} · pesos: {sumaPeso}%
                            {ns.length > 0 && sumaPeso !== 100 && (
                              <span className="text-amber-500 font-semibold"> ⚠️ deben sumar 100%</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {p !== null && (
                            <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(p, cfg, t)}>
                              {p.toFixed(2)}
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <input className={inputBase + " w-20 " + t.input} type="number" min={1} max={20}
                              placeholder="Nº" value={cantidades[m.id] ?? ""}
                              onChange={(e) => setCantidades({ ...cantidades, [m.id]: e.target.value })} />
                            <Btn t={t} tone="soft" onClick={() => generar(m)}>Generar estructura</Btn>
                          </div>
                        </div>
                      </div>

                      {/* Aviso central: mínimo requerido en las pendientes para ganar */}
                      {c.restante > 0 && (
                        <div className={"text-xs mb-2 " + t.sub}>
                          {c.requerida !== null && c.requerida <= 0 ? (
                            <span className={t.ok + " font-semibold"}>✅ Ya ganaste la materia (≥ {cfg.nota_minima})</span>
                          ) : c.requerida !== null && c.requerida > 5 ? (
                            <span className="text-red-500 font-semibold">🔴 Imposible ganarla: máximo alcanzable {c.maximo.toFixed(2)}</span>
                          ) : (
                            <span>🎯 Para ganar necesitas <strong>{c.requerida!.toFixed(2)}</strong> en cada nota pendiente (el {c.restante}% restante)</span>
                          )}
                        </div>
                      )}

                      {/* Filas editables con mínimo por nota pendiente */}
                      <div className="space-y-2">
                        {ns.length === 0 && (
                          <div className={"text-sm " + t.faint}>
                            Sin estructura. Indica la cantidad de notas y pulsa "Generar estructura".
                          </div>
                        )}
                        {ns.length > 0 && (
                          <div className={"grid grid-cols-[1fr_80px_80px_130px_32px] gap-2 text-[10px] uppercase font-semibold " + t.faint}>
                            <span>Nota</span><span>Peso %</span><span>Valor 0-5</span><span>Entrega</span><span />
                          </div>
                        )}
                        {ns.map((n: Nota) => (
                          <div key={n.id} className="grid grid-cols-[1fr_80px_80px_130px_32px] gap-2 items-center">
                            <input className={inputBase + " " + t.input} value={n.nombre}
                              onChange={(e) => editarNota(n.id, "nombre", e.target.value)} />
                            <input className={inputBase + " " + t.input} type="number" min={0} value={n.porcentaje}
                              onChange={(e) => editarNota(n.id, "porcentaje", e.target.value)} />
                            {/* Vacío = pendiente; el badge muestra el mínimo requerido */}
                            <div className="relative">
                              <input className={inputBase + " " + t.input} type="number" min={0} max={5} step={0.1}
                                placeholder="—" value={n.valor ?? ""} title="Vacío = pendiente"
                                onChange={(e) => editarNota(n.id, "valor", e.target.value)} />
                              {n.valor === null && minPorNota !== null && minPorNota > 0 && minPorNota <= 5 && (
                                <span className={"absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none " + (minPorNota > cfg.nota_ok ? "text-amber-500" : t.ok)}>
                                  mín {minPorNota.toFixed(1)}
                                </span>
                              )}
                            </div>
                            <input className={inputBase + " " + t.input} type="date" value={n.fecha ?? ""}
                              onChange={(e) => editarNota(n.id, "fecha", e.target.value)} />
                            <button className={t.faint + " hover:text-red-500 justify-self-center"}
                              onClick={() => { MiniDB.remove("notas", n.id); refresh(); }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Fade>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}

// ==================== PESTAÑA SIMULADOR ====================

/**
 * Simulador con objetivo configurable + panel "peso restante vs. riesgo":
 * prioriza materias por el margen entre su máximo alcanzable y la nota mínima.
 */
function TabSimulador({ data, refresh, t }: any) {
  const [objetivos, setObjetivos] = useState<Record<string, string>>({});
  const cfg: Config = data.config[0];

  const activo = cfg.activo;
  const matsActivos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo);
  const sems = matsActivos.length ? [activo] : [];

  // Análisis de riesgo por materia (solo el semestre activo): margen = máximo alcanzable − nota mínima
  const riesgos = matsActivos.map((m) => {
    const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
    const c = calculo(ns, cfg.nota_minima);
    const margen = c.maximo - cfg.nota_minima;
    const nivel = margen < 0 ? "crítico" : margen < 0.5 ? "riesgo" : "holgado";
    return { m, c, margen, nivel };
  });

  // Prioridad: menor margen primero (donde concentrarse)
  const prioridades = riesgos.filter((r) => r.c.restante > 0).sort((a, b) => a.margen - b.margen).slice(0, 3);

  return (
    <div className="space-y-5">
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-2 " + t.text}>🎯 Simulador de notas</h2>
        <p className={"text-sm " + t.sub}>
          Define tu <strong>nota objetivo</strong> por materia: se calcula qué necesitas en el % restante.
          Debajo, el panel de <strong>peso restante vs. riesgo</strong> te dice dónde concentrarte.
        </p>
      </div>

      {/* --- Panel: dónde concentrarse (peso restante vs. riesgo) --- */}
      {prioridades.length > 0 && (
        <div className={cardBase + " " + t.card}>
          <h2 className={"font-bold mb-3 " + t.text}>🧭 Dónde concentrarte</h2>
          <div className="space-y-2">
            {prioridades.map((r, i) => (
              <div key={r.m.id} className={"flex items-center gap-3 text-sm " + t.sub}>
                <span className="text-lg">{["🥇", "🥈", "🥉"][i]}</span>
                <span className="font-medium" style={{ color: r.m.color }}>{r.m.nombre}</span>
                {r.nivel === "crítico" ? (
                  <span className={"font-semibold " + "text-red-500"}>🔴 margen {r.margen.toFixed(2)} — en peligro de perderla</span>
                ) : r.nivel === "riesgo" ? (
                  <span className="text-amber-500 font-semibold">🟠 margen {r.margen.toFixed(2)} — hay que cuidarla</span>
                ) : (
                  <span className={t.ok + " font-semibold"}>🟢 margen {r.margen.toFixed(2)} — holgada</span>
                )}
                <span className={t.faint}>· {r.c.restante}% por evaluar</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {matsActivos.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          No hay materias en el semestre activo ({activo || "sin semestre"}). Crea materias en la pestaña Materias.
        </div>
      )}

      {sems.map((sem) => (
        <div key={sem} className="space-y-4">
          <h2 className={"text-lg font-bold border-b-2 pb-1 " + t.h2}>📁 {sem}</h2>
          {(data.materias as Materia[])
            .filter((m) => (m.semestre || "Sin semestre") === sem)
            .map((m: Materia) => {
              const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
              const objetivo = parseFloat(objetivos[m.id] || String(cfg.nota_minima)) || cfg.nota_minima;
              const c = calculo(ns, objetivo);
              const p = promedio(ns, m.id);

              return (
                <Fade key={m.id} k={m.id}>
                  <div className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className={"font-bold " + t.text}>{m.nombre}</div>
                        <div className={"text-sm " + t.sub}>
                          {c.pesoEval}% calificado · {c.restante}% pendiente · actual: {p !== null ? p.toFixed(2) : "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={"text-xs " + t.sub}>Objetivo</span>
                        <input className={inputBase + " w-16 " + t.input} type="number" min={0} max={5} step={0.1}
                          value={objetivos[m.id] ?? cfg.nota_minima.toFixed(1)}
                          onChange={(e) => setObjetivos({ ...objetivos, [m.id]: e.target.value })} />
                      </div>
                    </div>

                    <div className="mt-3">
                      {c.restante === 0 ? (
                        <div className={"text-sm font-semibold " + (p !== null && p >= objetivo ? t.ok : "text-red-500")}>
                          {p !== null && p >= objetivo
                            ? `✅ Todo evaluado: ${p.toFixed(2)} ≥ ${objetivo.toFixed(1)} ¡objetivo cumplido!`
                            : `🔒 Todo evaluado (${p?.toFixed(2) ?? "—"}). Objetivo ${objetivo.toFixed(1)} no alcanzado.`}
                        </div>
                      ) : c.requerida !== null && c.requerida <= 0 ? (
                        <div className={"text-sm font-semibold " + t.ok}>
                          ✅ ¡Objetivo ya asegurado! Incluso con 0 en el {c.restante}% restante mantienes {objetivo.toFixed(1)}.
                        </div>
                      ) : c.requerida !== null && c.requerida > 5 ? (
                        <div className="text-sm font-semibold text-red-500">
                          🔴 Imposible: necesitarías {c.requerida.toFixed(2)} en el {c.restante}% restante (máx. 5.0).
                          Mejor nota posible: {c.maximo.toFixed(2)}.
                        </div>
                      ) : c.requerida !== null ? (
                        <div className="text-sm font-semibold text-indigo-400">
                          📊 Necesitas <span className="text-lg font-extrabold">{c.requerida.toFixed(2)}</span> de promedio
                          en el {c.restante}% restante para llegar a {objetivo.toFixed(1)} · máximo posible: {c.maximo.toFixed(2)}
                        </div>
                      ) : null}
                      {/* Barra de progreso de lo calificado */}
                      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.25)" }}>
                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, c.pesoEval)}%` }} />
                      </div>
                    </div>
                  </div>
                </Fade>
              );
            })}
        </div>
      ))}
    </div>
  );
}

// ==================== PESTAÑA HORARIOS ====================

/** Horario semanal: alta de clases y cuadrícula por día. */
function TabHorarios({ data, refresh, t }: any) {
  const [f, setF] = useState({ materiaId: "", dia: 0, inicio: "07:00", fin: "09:00", salon: "" });

  const add = () => {
    if (!f.materiaId) return;
    MiniDB.insert<Clase>("clases", { id: uid(), ...f } as Clase);
    refresh();
  };
  const del = (id: string) => { MiniDB.remove("clases", id); refresh(); };
  const nombre = (id: string) => (data.materias as Materia[]).find((m) => m.id === id)?.nombre ?? "—";
  // Solo materias y clases del semestre activo
  const activos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === data.config[0].activo);
  const idsAct = new Set(activos.map((m) => m.id));

  return (
    <div className="space-y-5">
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-3 " + t.text}>🕒 Agregar clase al horario</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <select className={inputBase + " sm:col-span-2 " + t.input} value={f.materiaId}
            onChange={(e) => setF({ ...f, materiaId: e.target.value })}>
            <option value="">Selecciona materia…</option>
            {activos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
          <select className={inputBase + " " + t.input} value={f.dia}
            onChange={(e) => setF({ ...f, dia: Number(e.target.value) })}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <input className={inputBase + " " + t.input} type="time" value={f.inicio}
            onChange={(e) => setF({ ...f, inicio: e.target.value })} />
          <input className={inputBase + " " + t.input} type="time" value={f.fin}
            onChange={(e) => setF({ ...f, fin: e.target.value })} />
          <div className="flex gap-2">
            <input className={inputBase + " " + t.input} placeholder="Salón" value={f.salon}
              onChange={(e) => setF({ ...f, salon: e.target.value })} />
            <Btn t={t} onClick={add}>Añadir</Btn>
          </div>
        </div>
        {activos.length === 0 && (
          <p className="text-sm text-amber-500 mt-2">No hay materias en el semestre activo. Crea una en la pestaña Materias.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DIAS.map((d, i) => {
          const cs = (data.clases as Clase[]).filter((c) => c.dia === i && idsAct.has(c.materiaId))
            .sort((a, b) => a.inicio.localeCompare(b.inicio));
          return (
            <div key={d} className={"rounded-2xl border p-4 min-h-24 " + t.group}>
              <h3 className={"font-bold text-sm uppercase tracking-wide mb-2 " + t.sub}>{d}</h3>
              {cs.length === 0 && <div className={"text-xs " + t.faint}>Sin clases</div>}
              <div className="space-y-2">
                {cs.map((c) => {
                  const color = (data.materias as Materia[]).find((m) => m.id === c.materiaId)?.color ?? "#64748b";
                  return (
                    <div key={c.id} className={"rounded-lg border p-2 text-xs shadow-sm group " + t.groupCard}
                      style={{ borderLeft: `4px solid ${color}` }}>
                      <div className={"font-semibold " + t.text}>{nombre(c.materiaId)}</div>
                      <div className={t.sub}>{c.inicio} – {c.fin}{c.salon ? ` · ${c.salon}` : ""}</div>
                      <button className="text-red-400 opacity-0 group-hover:opacity-100 transition"
                        onClick={() => del(c.id)}>Eliminar</button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== PESTAÑA CALENDARIO ====================

/**
 * Calendario mensual de entregas: grilla de 7 columnas con navegación
 * de mes/año y los eventos (notas con fecha) resaltados por urgencia.
 */
function TabCalendario({ data, t }: any) {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());

  const pad = (n: number) => String(n).padStart(2, "0");
  const fechaDe = (d: number) => `${anio}-${pad(mes + 1)}-${pad(d)}`;

  // Notas con fecha que caen en el mes visible, agrupadas por día
  // Solo entregas de materias del semestre activo
  const idsAct = new Set(
    (data.materias as Materia[])
      .filter((m) => (m.semestre || "Sin semestre") === data.config[0].activo)
      .map((m) => m.id)
  );
  const porDia: Record<number, Nota[]> = {};
  (data.notas as Nota[]).forEach((n) => {
    if (n.fecha && idsAct.has(n.materiaId) && n.fecha.startsWith(`${anio}-${pad(mes + 1)}`)) {
      const d = parseInt(n.fecha.slice(8, 10), 10);
      (porDia[d] = porDia[d] || []).push(n);
    }
  });

  // Offset para que la semana empiece en lunes
  const primerDiaSemana = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasDelMes; d++) celdas.push(d);

  const mover = (delta: number) => {
    let m = mes + delta, a = anio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m);
    setAnio(a);
  };

  const esHoy = (d: number) =>
    hoy.getFullYear() === anio && hoy.getMonth() === mes && hoy.getDate() === d;

  return (
    <div className="space-y-5">
      {/* Navegación de mes */}
      <div className={cardBase + " " + t.card + " flex items-center justify-between"}>
        <Btn t={t} tone="soft" onClick={() => mover(-1)}>← Anterior</Btn>
        <h2 className={"text-lg font-bold " + t.text}>{MESES[mes]} {anio}</h2>
        <Btn t={t} tone="soft" onClick={() => mover(1)}>Siguiente →</Btn>
      </div>

      {/* Encabezado de días de la semana */}
      <div className={"grid grid-cols-7 gap-1 text-center text-[10px] uppercase font-semibold " + t.faint}>
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
      </div>

      {/* Grilla del mes: cada celda muestra sus entregas con color por urgencia */}
      <div className="grid grid-cols-7 gap-1">
        {celdas.map((d, i) => {
          if (d === null) return <div key={"v" + i} />;
          const evs = porDia[d] || [];
          const dd = diasHasta(fechaDe(d));
          return (
            <div key={d}
              className={"min-h-20 rounded-lg border p-1 text-xs " + t.group + (esHoy(d) ? " " + t.ring : "")}>
              <div className={"font-bold mb-1 " + (esHoy(d) ? "text-indigo-500" : t.sub)}>{d}</div>
              <div className="space-y-1">
                {evs.map((n) => {
                  const m = (data.materias as Materia[]).find((x) => x.id === n.materiaId);
                  const overdue = dd !== null && dd < 0;
                  const soon = dd !== null && dd >= 0 && dd <= 3;
                  return (
                    <div key={n.id} title={`${m?.nombre ?? ""} · ${n.nombre}`}
                      className="truncate rounded px-1 py-0.5"
                      style={{
                        background: m?.color + "33",
                        borderLeft: `2px solid ${m?.color ?? "#64748b"}`,
                        color: overdue ? "#ef4444" : soon ? "#f59e0b" : undefined,
                        fontWeight: overdue || soon ? 700 : 400,
                      }}>
                      {m?.nombre.slice(0, 10) ?? "—"}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className={"text-xs text-center " + t.faint}>
        Las celdas muestran las entregas de cada día, coloreadas por materia. Rojo = vencida, ámbar = vence en ≤3 días.
      </p>
    </div>
  );
}

// ==================== PESTAÑA INICIO (DASHBOARD) ====================

/**
 * Dashboard de resumen: promedio general, % del semestre evaluado,
 * próximas entregas y materias que requieren atención — todo de un vistazo.
 */
function TabDashboard({ data, refresh, t, goTab }: any) {
  const cfg: Config = data.config[0];
  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo);

  // Estado vacío: primera visita sin materias
  if (mats.length === 0) {
    return (
      <Fade k="vacio">
        <div className={"rounded-3xl border-2 border-dashed p-10 text-center " + t.card}>
          <div className="text-5xl mb-3">🎓</div>
          <h2 className={"text-xl font-bold " + t.text}>¡Bienvenido a Seguidor de Notas!</h2>
          <p className={"text-sm mt-2 mb-5 " + t.sub}>
            {cfg.activo
              ? `Aún no hay materias en ${cfg.activo}: créalas en la pestaña Materias y aquí verás tu resumen.`
              : "Crea tu primer semestre con la opción ➕ Añadir semestre… del encabezado, y luego añade tus materias."}
          </p>
          <Btn t={t} onClick={() => goTab("materias")}>➕ Empezar</Btn>
        </div>
      </Fade>
    );
  }

  // Promedio general ponderado por créditos
  let suma = 0, peso = 0;
  mats.forEach((m) => {
    const p = promedio(data.notas, m.id);
    if (p !== null) { suma += p * m.creditos; peso += m.creditos; }
  });
  const promGeneral = peso ? suma / peso : null;

  // % del semestre evaluado (promedio del peso calificado por materia)
  const evaluadas = mats
    .map((m) => MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id))
    .filter((ns) => ns.length > 0);
  const pctEval = evaluadas.length
    ? evaluadas.reduce(
        (s, ns) => s + Math.min(100, ns.filter((n) => n.valor !== null).reduce((a, n) => a + n.porcentaje, 0)),
        0
      ) / evaluadas.length
    : null;

  // Riesgo por materia: margen = máximo alcanzable − nota mínima
  const riesgos = mats
    .map((m) => {
      const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
      const c = calculo(ns, cfg.nota_minima);
      return { m, c, margen: c.maximo - cfg.nota_minima };
    })
    .filter((r) => r.c.restante > 0)
    .sort((a, b) => a.margen - b.margen);
  const enRiesgo = riesgos.filter((r) => r.margen < 0.5);

  // Próximas 3 entregas
  const proximas = (data.notas as Nota[])
    .filter((n) => n.fecha && diasHasta(n.fecha) !== null)
    .sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1))
    .slice(0, 3);

  const stat = (label: string, value: string, sub: string, cls = "") => (
    <div className={"rounded-2xl border p-4 " + t.card}>
      <div className={"text-[10px] uppercase font-bold tracking-wide " + t.faint}>{label}</div>
      <div className={"text-2xl font-extrabold mt-1 " + cls}>{value}</div>
      <div className={"text-xs mt-0.5 " + t.sub}>{sub}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* --- Tarjetas de estadísticas --- */}
      <Fade k="stats">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stat("Promedio general", promGeneral !== null ? promGeneral.toFixed(2) : "—",
            promGeneral !== null ? "ponderado por créditos" : "aún sin notas",
            promGeneral !== null ? estadoTxt(promGeneral, cfg, t) : t.text)}
          {stat("Semestre evaluado", pctEval !== null ? pctEval.toFixed(0) + "%" : "—",
            pctEval !== null ? "del peso definido" : "define tus notas", "text-indigo-500")}
          {stat("Materias activas", String(mats.length),
            mats.reduce((s, m) => s + m.creditos, 0) + " créditos", "text-violet-500")}
          {stat("En riesgo", String(enRiesgo.length),
            enRiesgo.length ? "necesitan atención" : "todo bajo control",
            enRiesgo.length ? "text-red-500" : "text-emerald-500")}
        </div>
      </Fade>

      {/* --- Próximas entregas + materias que requieren atención --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Fade k="prox" className="">
          <div className={cardBase + " " + t.card}>
            <h2 className={"font-bold mb-3 " + t.text}>⏳ Próximas entregas</h2>
            {proximas.length === 0 ? (
              <p className={"text-sm " + t.faint}>Sin fechas registradas. Añádelas en la pestaña Notas.</p>
            ) : (
              <div className="space-y-2">
                {proximas.map((n) => {
                  const m = mats.find((x) => x.id === n.materiaId);
                  return (
                    <div key={n.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                      <span className="font-medium" style={{ color: m?.color }}>{m?.nombre ?? "—"}</span>
                      <span className="truncate">· {n.nombre}</span>
                      <span className="ml-auto"><FechaBadge fecha={n.fecha} t={t} /></span>
                    </div>
                  );
                })}
              </div>
            )}
            <Btn t={t} tone="soft" className="mt-3 w-full" onClick={() => goTab("calendario")}>📅 Ver calendario completo</Btn>
          </div>
        </Fade>

        <Fade k="riesgo" className="">
          <div className={cardBase + " " + t.card}>
            <h2 className={"font-bold mb-3 " + t.text}>🚨 Requieren atención</h2>
            {riesgos.length === 0 ? (
              <p className={"text-sm " + t.faint}>Nada pendiente: todo tu peso está calificado. 🎉</p>
            ) : (
              <div className="space-y-2">
                {riesgos.slice(0, 4).map((r) => (
                  <div key={r.m.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                    <span className="font-medium" style={{ color: r.m.color }}>{r.m.nombre}</span>
                    <span className="ml-auto">
                      {r.margen < 0 ? (
                        <span className="text-red-500 font-semibold">🔴 imposible ganarla</span>
                      ) : r.margen < 0.5 ? (
                        <span className="text-amber-500 font-semibold">🟠 margen {r.margen.toFixed(2)}</span>
                      ) : (
                        <span className={t.ok + " font-semibold"}>🟢 margen {r.margen.toFixed(2)}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Btn t={t} tone="soft" className="mt-3 w-full" onClick={() => goTab("simulador")}>🎯 Ver simulador completo</Btn>
          </div>
        </Fade>
      </div>
    </div>
  );
}

// ==================== APP PRINCIPAL ====================

/**
 * Componente raíz: encabezado hero con degradado y estadísticas, pestañas
 * (superior en escritorio, inferior fija en móvil) y animación por pestaña.
 */
export default function App() {
  const { data, refresh } = useDB();
  const [tab, setTab] = useState<"inicio" | "materias" | "notas" | "simulador" | "horarios" | "calendario">("inicio");

  const cfg: Config = data.config[0];
  const t = tokens(!!cfg.dark);

  const toggleDark = () => { MiniDB.saveConfig({ dark: !cfg.dark }); refresh(); };

  const tabs = [
    { id: "inicio", icon: "🏠", label: "Inicio" },
    { id: "materias", icon: "📚", label: "Materias" },
    { id: "notas", icon: "📝", label: "Notas" },
    { id: "simulador", icon: "🎯", label: "Simulador" },
    { id: "horarios", icon: "🗓️", label: "Horarios" },
    { id: "calendario", icon: "📅", label: "Calendario" },
  ] as const;

  // Semestres registrados + selector del semestre activo (único visible)
  const semestres: string[] = cfg.semestres || [];
  const cambiarSemestre = (val: string) => {
    if (val === "__nuevo") {
      const nombre = prompt("📝 Nombre del nuevo semestre (ej: 2027-1):", "");
      if (nombre && nombre.trim()) {
        const n = nombre.trim();
        MiniDB.saveConfig({
          semestres: semestres.includes(n) ? semestres : [...semestres, n],
          activo: n,
        });
        refresh();
      }
      return;
    }
    MiniDB.saveConfig({ activo: val });
    refresh();
  };

  // Estadísticas del encabezado: solo el semestre activo
  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo);
  let suma = 0, peso = 0;
  mats.forEach((m) => {
    const p = promedio(data.notas, m.id);
    if (p !== null) { suma += p * m.creditos; peso += m.creditos; }
  });
  const promGeneral = peso ? suma / peso : null;

  return (
    <div className={"min-h-screen " + t.page + " transition-colors"}>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 pb-24 md:pb-8">
        {/* --- Encabezado hero con degradado --- */}
        <header className={"relative overflow-hidden rounded-3xl mb-6 p-6 sm:p-8 text-white shadow-lg bg-gradient-to-br " + t.hero}>
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 pointer-events-none" />
          <div className="absolute -bottom-16 -left-8 w-48 h-48 rounded-full bg-black/10 pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold">🎓 Seguidor de Notas</h1>
              <p className="text-sm text-white/80">Tu semestre de un vistazo: notas, simulador, horarios y calendario.</p>
            </div>
            <button onClick={toggleDark}
              className="text-2xl rounded-xl px-3 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition"
              title={cfg.dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}>
              {cfg.dark ? "☀️" : "🌙"}
            </button>
          </div>
          <div className="relative grid grid-cols-3 gap-3 mt-6">
            <div className={"rounded-2xl p-3 " + t.heroCard}>
              <div className="text-[10px] uppercase font-bold text-white/70">Promedio</div>
              <div className="text-2xl font-extrabold">{promGeneral !== null ? promGeneral.toFixed(2) : "—"}</div>
            </div>
            <div className={"rounded-2xl p-3 " + t.heroCard}>
              <div className="text-[10px] uppercase font-bold text-white/70">Materias</div>
              <div className="text-2xl font-extrabold">{mats.length}</div>
            </div>
            <div className={"rounded-2xl p-3 " + t.heroCard}>
              <div className="text-[10px] uppercase font-bold text-white/70">Créditos</div>
              <div className="text-2xl font-extrabold">{mats.reduce((s, m) => s + m.creditos, 0)}</div>
            </div>
          </div>
          {/* --- Selector de semestre activo --- */}
          <div className="relative flex flex-wrap items-center gap-2 mt-4">
            <span className="text-[10px] uppercase font-bold text-white/70">Semestre activo</span>
            <select value={cfg.activo} onChange={(e) => cambiarSemestre(e.target.value)}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold bg-white/15 border border-white/25 text-white backdrop-blur focus:outline-none">
              {semestres.length === 0 && <option value="">— sin semestres —</option>}
              {semestres.map((s) => (
                <option key={s} value={s} className="text-slate-800">
                  {s + ((cfg.archivados || []).includes(s) ? " (archivado)" : "")}
                </option>
              ))}
              <option value="__nuevo" className="text-slate-800">➕ Añadir semestre…</option>
            </select>
          </div>
        </header>

        {/* --- Navegación superior (solo escritorio) --- */}
        <nav className={"hidden md:flex flex-wrap gap-2 mb-6 rounded-xl p-1.5 border shadow-sm w-fit mx-auto " + t.nav}>
          {tabs.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={"px-4 py-2 rounded-lg text-sm font-semibold transition " +
                (tab === x.id ? "bg-indigo-600 text-white shadow" : t.navIn)}>
              {x.icon} {x.label}
            </button>
          ))}
        </nav>

        {/* Animación de entrada al cambiar de pestaña */}
        <Fade k={tab}>
          {tab === "inicio" && <TabDashboard data={data} refresh={refresh} t={t} goTab={setTab} />}
          {tab === "materias" && <TabMaterias data={data} refresh={refresh} t={t} />}
          {tab === "notas" && <TabNotas data={data} refresh={refresh} t={t} />}
          {tab === "simulador" && <TabSimulador data={data} refresh={refresh} t={t} />}
          {tab === "horarios" && <TabHorarios data={data} refresh={refresh} t={t} />}
          {tab === "calendario" && <TabCalendario data={data} t={t} />}
        </Fade>

        <footer className={"mt-8 text-center text-xs " + t.faint}>
          🗄️ Tus datos se guardan en la base de datos local de este navegador.
        </footer>
      </div>

      {/* --- Navegación inferior fija (solo móvil) --- */}
      <nav className={"fixed bottom-0 inset-x-0 z-50 md:hidden border-t backdrop-blur " + t.navMob}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid grid-cols-6 max-w-4xl mx-auto">
          {tabs.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={"flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition " +
                (tab === x.id ? "text-indigo-500" : t.sub)}>
              <span className="text-xl leading-none">{x.icon}</span>
              {x.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
