
// Importación de React y sus hooks para manejar estado (useState) y ciclos de vida (useEffect)
import React, { useState, useEffect } from "react";

// ==================== TIPOS DE DATOS ====================
// Cada tipo describe la estructura de un registro (fila) de la base de datos.

// Una materia: identificada por id único, con datos académicos y color visual
type Materia = {
  id: string;
  nombre: string;
  profesor: string;
  creditos: number;
  color: string; // color asignado automáticamente, usado en tarjetas y horario
  semestre: string; // categoría/carpeta de agrupación, ej: "2026-2"
};

// Una nota/evaluación que pertenece a una materia
type Nota = {
  id: string;
  materiaId: string; // clave foránea: vincula la nota con su materia
  nombre: string;
  valor: number; // calificación en escala 0 - 5
  porcentaje: number; // peso de esta evaluación en la nota final (ej: 30 = 30%)
  fecha?: string; // fecha de entrega opcional en formato "YYYY-MM-DD"
};

// Una clase dentro del horario semanal
type Clase = {
  id: string;
  materiaId: string;
  dia: number; // índice del día: 0 = Lunes ... 5 = Sábado
  inicio: string; // hora de inicio en formato "07:00"
  fin: string; // hora de fin en formato "09:00"
  salon: string;
};

// Configuración global de la app (tabla singleton, una sola fila)
type Config = {
  dark: boolean; // tema oscuro activado
  umbral: number; // las notas por debajo de este valor se resaltan en rojo
};

// Paleta de colores: cada materia nueva toma el siguiente color de forma cíclica
const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
// Días visibles en el horario; el índice corresponde a Clase.dia
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// ==================== CAPA DE BASE DE DATOS (MiniDB) ====================
/**
 * Motor de base de datos embebido inspirado en un ORM simple.
 * La "base de datos" es un objeto { tabla: filas[] } serializado en localStorage.
 * La UI nunca toca arreglos crudos: solo habla con esta API CRUD.
 */
const DB_KEY = "seguidor-notas-db";

// Esquema por defecto: cada tabla se inicializa vacía, config arranca en la fila 0
const DB_SCHEMA = {
  materias: [] as Materia[],
  notas: [] as Nota[],
  clases: [] as Clase[],
  config: [{ dark: false, umbral: 3.0 }], // singleton: siempre fila 0
};

type Row = { id: string; [k: string]: any };

const MiniDB = {
  /** Carga la DB completa; si no existe, se crea con el esquema por defecto. */
  load(): typeof DB_SCHEMA {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return { ...DB_SCHEMA, ...JSON.parse(raw) };
    } catch {}
    return { ...DB_SCHEMA, config: [{ ...DB_SCHEMA.config[0] }] };
  },

  /** Persiste la DB completa tras cada mutación. */
  persist(db: typeof DB_SCHEMA) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  /** INSERT: agrega una fila a la tabla y la devuelve. */
  insert<T extends Row>(table: keyof typeof DB_SCHEMA, row: T): T {
    const db = MiniDB.load();
    (db[table] as T[]).push(row);
    MiniDB.persist(db);
    return row;
  },

  /** SELECT (con WHERE opcional): filtra la tabla con un predicado. */
  find<T extends Row>(table: keyof typeof DB_SCHEMA, filter?: (r: T) => boolean): T[] {
    const rows = MiniDB.load()[table] as T[];
    return filter ? rows.filter(filter) : rows.slice();
  },

  /** UPDATE parcial por clave primaria. */
  update<T extends Row>(table: keyof typeof DB_SCHEMA, id: string, patch: Partial<T>): void {
    const db = MiniDB.load();
    const rows = db[table] as T[];
    const i = rows.findIndex((r) => r.id === id);
    if (i !== -1) rows[i] = { ...rows[i], ...patch };
    MiniDB.persist(db);
  },

  /** DELETE por id. */
  remove(table: keyof typeof DB_SCHEMA, id: string): void {
    MiniDB.removeWhere(table, (r: Row) => r.id === id);
  },

  /** DELETE con condición: usado para borrado en cascada. */
  removeWhere(table: keyof typeof DB_SCHEMA, filter: (r: Row) => boolean): void {
    const db = MiniDB.load();
    db[table] = (db[table] as Row[]).filter((r) => !filter(r));
    MiniDB.persist(db);
  },

  /** Lee la fila 0 de la tabla singleton config. */
  getConfig(): Config {
    return MiniDB.load().config[0];
  },

  /** UPDATE de la config: fusiona el patch sobre la fila 0. */
  saveConfig(patch: Partial<Config>): void {
    const db = MiniDB.load();
    db.config[0] = { ...db.config[0], ...patch };
    MiniDB.persist(db);
  },
};

// Generador de ids pseudoaleatorios (clave primaria de cada fila)
const uid = () => Math.random().toString(36).slice(2, 10);

// ==================== CÁLCULOS ACADÉMICOS ====================

/**
 * Promedio ponderado de una materia:
 * suma(valor * peso) / suma(pesos). Devuelve null si no hay notas
 * (evita dividir por cero).
 */
function promedio(notas: Nota[], materiaId: string) {
  const ns = notas.filter((n) => n.materiaId === materiaId);
  const totalPeso = ns.reduce((s, n) => s + n.porcentaje, 0);
  if (!ns.length || totalPeso === 0) return null;
  return ns.reduce((s, n) => s + n.valor * n.porcentaje, 0) / totalPeso;
}

/**
 * Promedio ponderado por créditos de todas las materias de un semestre
 * (como el promedio académico real). Las materias sin notas se excluyen.
 */
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
 * Días que faltan hasta una fecha "YYYY-MM-DD" (negativo = ya venció).
 * Devuelve null si no hay fecha válida.
 */
function diasHasta(fecha?: string): number | null {
  if (!fecha) return null;
  const f = new Date(fecha + "T00:00:00");
  if (isNaN(f.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / 86400000);
}

// ==================== TEMA (DARK MODE) ====================
/**
 * Genera las clases Tailwind según el tema. En vez de la variante `dark:`
 * (que requiere configurar Tailwind), usamos tokens intercambiables:
 * la app pasa `t` a todos los componentes y el cambio es instantáneo.
 */
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
  };
}

// Clases base compartidas (independientes del tema)
const cardBase = "rounded-2xl border shadow-sm p-5";
const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
const labelBase = "block text-xs font-semibold mb-1 uppercase tracking-wide";

/**
 * Botón genérico con variantes: primary (acción principal),
 * soft (secundaria) y danger (destructiva). El tono soft se adapta al tema.
 */
function Btn({ children, onClick, tone = "primary", t, className = "" }: any) {
  const tones = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    soft: t.softBtn,
    danger: t ? "text-red-500 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50",
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Badge de fecha de entrega: rojo si venció, ámbar si vence pronto,
 * verde si falta más de una semana. Devuelve null si no hay fecha.
 */
function FechaBadge({ fecha, t }: any) {
  const d = diasHasta(fecha);
  if (d === null) return null;
  if (d < 0) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.badBg}`}>🔴 venció hace {-d} d</span>;
  if (d === 0) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.warnBg}`}>⏰ ¡vence hoy!</span>;
  if (d <= 7) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.warnBg}`}>📌 en ${d} d</span>;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.okBg}`}>📅 {d} d</span>;
}

// ==================== HOOK DE ESTADO CONECTADO A LA DB ====================

/**
 * Sincroniza el estado de React con MiniDB: carga inicial (SELECT *)
 * y refresh() tras cada mutación para reflejar la DB en la vista.
 */
function useDB() {
  const [data, setData] = useState(() => MiniDB.load());
  const refresh = () => setData(MiniDB.load());
  useEffect(() => {
    refresh();
  }, []);
  return { data, refresh };
}

// ==================== PESTAÑA MATERIAS ====================

/**
 * Vista principal: crear materias, búsqueda, carpetas de semestre
 * (plegables con promedio del semestre), notas y fechas de entrega.
 */
function TabMaterias({ data, refresh, t }: any) {
  const [form, setForm] = useState({ nombre: "", profesor: "", creditos: 3, semestre: "2026-2" });
  const [q, setQ] = useState(""); // texto de búsqueda
  const [abierto, setAbierto] = useState<Record<string, boolean>>({}); // carpetas plegables

  // INSERT INTO materias (con semestre como carpeta de agrupación)
  const agregar = () => {
    if (!form.nombre.trim()) return;
    MiniDB.insert<Materia>("materias", {
      id: uid(),
      nombre: form.nombre.trim(),
      profesor: form.profesor.trim(),
      creditos: Number(form.creditos) || 0,
      color: COLORS[MiniDB.find<Materia>("materias").length % COLORS.length],
      semestre: form.semestre.trim() || "Sin semestre",
    });
    setForm({ nombre: "", profesor: "", creditos: 3, semestre: form.semestre.trim() });
    refresh();
  };

  // DELETE en cascada: materia + notas + clases por clave foránea
  const eliminar = (id: string) => {
    MiniDB.remove("materias", id);
    MiniDB.removeWhere("notas", (n) => n.materiaId === id);
    MiniDB.removeWhere("clases", (c) => c.materiaId === id);
    refresh();
  };

  // Filtro de búsqueda: coincide contra nombre, profesor y semestre
  const coincide = (m: Materia) =>
    !q.trim() ||
    (m.nombre + " " + m.profesor + " " + (m.semestre || "")).toLowerCase().includes(q.trim().toLowerCase());

  // Semestres visibles tras filtrar (como carpetas ordenadas)
  const sems = [...new Set((data.materias as Materia[]).filter(coincide).map((m) => m.semestre || "Sin semestre"))].sort();

  // Próximas entregas: notas con fecha de TODO el semestre, ordenadas por vencimiento
  const proximas = (data.notas as Nota[])
    .filter((n) => n.fecha && diasHasta(n.fecha) !== null)
    .sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* --- Formulario de creación --- */}
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-3 " + t.text}>➕ Crear materia</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
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
            <input className={inputBase + " " + t.input} type="number" min={0} value={form.creditos}
              onChange={(e) => setForm({ ...form, creditos: e.target.value })} />
          </div>
          <div>
            <span className={labelBase + " " + t.sub}>Semestre</span>
            <div className="flex gap-2">
              <input className={inputBase + " " + t.input} placeholder="2026-2" value={form.semestre}
                onChange={(e) => setForm({ ...form, semestre: e.target.value })} />
              <Btn t={t} onClick={agregar}>Añadir</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* --- Búsqueda de materias --- */}
      <div className={cardBase + " " + t.card}>
        <input className={inputBase + " " + t.input} placeholder="🔍 Buscar materia, profesor o semestre…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* --- Próximas entregas (fechas de vencimiento más cercanas) --- */}
      {proximas.length > 0 && (
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
      )}

      {/* --- Carpetas de semestre (plegables, con promedio del semestre) --- */}
      {sems.map((sem) => {
        const abierta = abierto[sem] !== false; // por defecto: abierta
        const mats = (data.materias as Materia[]).filter((m) => coincide(m) && (m.semestre || "Sin semestre") === sem);
        const psem = promedioSemestre(data, sem);
        return (
          <div key={sem} className="space-y-3">
            {/* Encabezado-carpeta: clic para plegar/desplegar */}
            <button
              onClick={() => setAbierto({ ...abierto, [sem]: !abierta })}
              className={"w-full flex items-center justify-between gap-3 text-left text-lg font-bold pb-1 border-b-2 " + t.h2}
            >
              <span>{abierta ? "📂" : "📁"} {sem} <span className={"text-sm font-normal " + t.sub}>({mats.length} materia{mats.length === 1 ? "" : "s"})</span></span>
              {psem !== null && (
                <span className={"px-3 py-1 rounded-full text-sm font-bold " + (psem >= data.config[0].umbral ? t.okBg : t.badBg)}>
                  Prom. semestre: {psem.toFixed(2)}
                </span>
              )}
            </button>

            {/* Contenido de la carpeta: tarjetas de materia */}
            {abierta && mats.map((m: Materia) => {
              const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
              const p = promedio(data.notas, m.id);
              const pesado = ns.reduce((s: number, n: Nota) => s + n.porcentaje, 0);
              return (
                <div key={m.id} className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className={"font-bold " + t.text}>{m.nombre}</div>
                      <div className={"text-sm " + t.sub}>
                        {m.profesor || "Sin profesor"} · {m.creditos} créditos · {pesado}% evaluado
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p !== null && (
                        <span className={"px-3 py-1 rounded-full text-sm font-bold " + (p >= data.config[0].umbral ? t.okBg : t.badBg)}>
                          {p.toFixed(2)}
                        </span>
                      )}
                      <Btn t={t} tone="danger" onClick={() => eliminar(m.id)}>✕</Btn>
                    </div>
                  </div>

                  {/* Lista de notas con badge de fecha de entrega */}
                  <div className="mt-3 space-y-2">
                    {ns.length === 0 && <div className={"text-sm " + t.faint}>Sin notas registradas</div>}
                    {ns.map((n: Nota) => (
                      <div key={n.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                        <span className="flex-1">
                          {n.nombre} <span className={t.faint}>({n.porcentaje}%)</span>{" "}
                          <FechaBadge fecha={n.fecha} t={t} />
                        </span>
                        <span className={"font-semibold " + (n.valor >= data.config[0].umbral ? t.ok : "text-red-500")}>
                          {n.valor.toFixed(1)}
                        </span>
                        <button className={t.faint + " hover:text-red-500"}
                          onClick={() => { MiniDB.remove("notas", n.id); refresh(); }}>✕</button>
                      </div>
                    ))}
                  </div>
                  <FormNota materiaId={m.id} refresh={refresh} t={t} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Alta de notas desde la pestaña Materias: nombre, valor (0-5), peso,
 * y fecha de entrega opcional (se guarda como string YYYY-MM-DD o vacío).
 */
function FormNota({ materiaId, refresh, t }: any) {
  const [f, setF] = useState({ nombre: "", valor: "", porcentaje: "", fecha: "" });
  const add = () => {
    const valor = parseFloat(f.valor), pct = parseFloat(f.porcentaje);
    if (!f.nombre.trim() || isNaN(valor) || valor < 0 || valor > 5 || isNaN(pct) || pct <= 0) return;
    MiniDB.insert<Nota>("notas", {
      id: uid(), materiaId, nombre: f.nombre.trim(), valor, porcentaje: pct,
      fecha: f.fecha || undefined, // sin fecha -> no se guarda el campo
    });
    setF({ nombre: "", valor: "", porcentaje: "", fecha: "" });
    refresh();
  };
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t pt-3" style={{ borderColor: "rgba(148,163,184,0.2)" }}>
      <input className={inputBase + " " + t.input} placeholder="Nota (ej: Parcial 1)" value={f.nombre}
        onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <input className={inputBase + " " + t.input} type="number" min={0} max={5} step={0.1} placeholder="Valor 0-5" value={f.valor}
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
 * Estructura de evaluación por materia: generar N notas con pesos iguales,
 * editar inline nombre / peso / valor / fecha de entrega, con promedios.
 */
function TabNotas({ data, refresh, t }: any) {
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  /** Genera N notas con pesos iguales (la última absorbe el redondeo para sumar 100). */
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
        id: uid(), materiaId: m.id, nombre: `Nota ${i}`, valor: 0, porcentaje: pct,
      });
    }
    refresh();
  };

  /** UPDATE inline de un campo de la nota directamente en la DB. */
  const editarNota = (id: string, campo: "nombre" | "porcentaje" | "valor" | "fecha", valor: string) => {
    const patch: any = {};
    if (campo === "nombre") patch.nombre = valor;
    if (campo === "porcentaje") patch.porcentaje = parseFloat(valor) || 0;
    if (campo === "valor") patch.valor = parseFloat(valor) || 0;
    if (campo === "fecha") patch.fecha = valor || undefined;
    MiniDB.update<Nota>("notas", id, patch);
    refresh();
  };

  const sems = [...new Set((data.materias as Materia[]).map((m) => m.semestre || "Sin semestre"))].sort();

  return (
    <div className="space-y-5">
      {data.materias.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          Primero crea materias en la pestaña Materias para configurar sus notas.
        </div>
      )}

      {sems.map((sem) => {
        const psem = promedioSemestre(data, sem);
        return (
          <div key={sem} className="space-y-4">
            <div className={"flex items-center justify-between border-b-2 pb-1 " + t.h2}>
              <h2 className="text-lg font-bold">📁 {sem}</h2>
              {psem !== null && (
                <span className={"px-3 py-1 rounded-full text-sm font-bold " + (psem >= data.config[0].umbral ? t.okBg : t.badBg)}>
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
                return (
                  <div key={m.id} className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
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
                          <span className={"px-3 py-1 rounded-full text-sm font-bold " + (p >= data.config[0].umbral ? t.okBg : t.badBg)}>
                            {p.toFixed(2)}
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            className={inputBase + " w-20 " + t.input}
                            type="number" min={1} max={20} placeholder="Nº"
                            value={cantidades[m.id] ?? ""}
                            onChange={(e) => setCantidades({ ...cantidades, [m.id]: e.target.value })}
                          />
                          <Btn t={t} tone="soft" onClick={() => generar(m)}>Generar estructura</Btn>
                        </div>
                      </div>
                    </div>

                    {/* Filas editables: nombre | peso | valor | fecha | borrar */}
                    <div className="space-y-2">
                      {ns.length === 0 && (
                        <div className={"text-sm " + t.faint}>
                          Sin estructura. Indica la cantidad de notas y pulsa "Generar estructura".
                        </div>
                      )}
                      {ns.length > 0 && (
                        <div className={"grid grid-cols-[1fr_80px_80px_140px_32px] gap-2 text-[10px] uppercase font-semibold " + t.faint}>
                          <span>Nota</span><span>Peso %</span><span>Valor 0-5</span><span>Entrega</span><span />
                        </div>
                      )}
                      {ns.map((n: Nota) => (
                        <div key={n.id} className="grid grid-cols-[1fr_80px_80px_140px_32px] gap-2 items-center">
                          <input className={inputBase + " " + t.input} value={n.nombre}
                            onChange={(e) => editarNota(n.id, "nombre", e.target.value)} />
                          <input className={inputBase + " " + t.input} type="number" min={0} value={n.porcentaje}
                            onChange={(e) => editarNota(n.id, "porcentaje", e.target.value)} />
                          <input className={inputBase + " " + t.input} type="number" min={0} max={5} step={0.1} value={n.valor}
                            onChange={(e) => editarNota(n.id, "valor", e.target.value)} />
                          <input className={inputBase + " " + t.input} type="date" value={n.fecha ?? ""}
                            onChange={(e) => editarNota(n.id, "fecha", e.target.value)} />
                          <button className={t.faint + " hover:text-red-500 justify-self-center"}
                            onClick={() => { MiniDB.remove("notas", n.id); refresh(); }}>✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
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
 * Simulador: "¿qué necesito en lo que falta para alcanzar mi objetivo?"
 *
 * Cálculo por materia:
 *   acumulado  = Σ (valor × peso)          -> puntos ya ganados (sobre 100)
 *   restante   = 100 − Σ pesos              -> % aún por evaluar
 *   requerida  = (objetivo×100 − acumulado) / restante
 * Si requerida > 5, el objetivo es inalcanzable y se muestra el máximo posible.
 */
function TabSimulador({ data, refresh, t }: any) {
  // Nota objetivo por materia (estado local, default 3.0)
  const [objetivos, setObjetivos] = useState<Record<string, string>>({});

  const sems = [...new Set((data.materias as Materia[]).map((m) => m.semestre || "Sin semestre"))].sort();

  return (
    <div className="space-y-5">
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-2 " + t.text}>🎯 Simulador de notas</h2>
        <p className={"text-sm " + t.sub}>
          Define tu <strong>nota objetivo</strong> en cada materia y el simulador calcula qué
          promedio necesitas en el porcentaje restante por evaluar. También te dice si el objetivo
          ya está asegurado o es matemáticamente imposible.
        </p>
      </div>

      {data.materias.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          Crea materias primero en la pestaña Materias.
        </div>
      )}

      {sems.map((sem) => (
        <div key={sem} className="space-y-4">
          <h2 className={"text-lg font-bold border-b-2 pb-1 " + t.h2}>📁 {sem}</h2>
          {(data.materias as Materia[])
            .filter((m) => (m.semestre || "Sin semestre") === sem)
            .map((m: Materia) => {
              const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
              const acumulado = ns.reduce((s, n) => s + n.valor * n.porcentaje, 0); // puntos ganados
              const peso = ns.reduce((s, n) => s + n.porcentaje, 0); // % evaluado
              const restante = Math.max(0, 100 - peso); // % por evaluar
              const p = promedio(ns, m.id);
              const objetivo = parseFloat(objetivos[m.id] || "3.0") || 3.0;

              // Nota requerida en el % restante para alcanzar el objetivo
              const requerida = restante > 0 ? (objetivo * 100 - acumulado) / restante : null;
              // Mejor promedio final posible (todo lo restante con 5.0)
              const maximo = restante > 0 ? (acumulado + 5 * restante) / 100 : p ?? 0;

              return (
                <div key={m.id} className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className={"font-bold " + t.text}>{m.nombre}</div>
                      <div className={"text-sm " + t.sub}>
                        {peso}% evaluado · {restante}% restante · actual: {p !== null ? p.toFixed(2) : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={"text-xs " + t.sub}>Objetivo</span>
                      <input
                        className={inputBase + " w-16 " + t.input}
                        type="number" min={0} max={5} step={0.1}
                        value={objetivos[m.id] ?? "3.0"}
                        onChange={(e) => setObjetivos({ ...objetivos, [m.id]: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Resultado del cálculo */}
                  <div className="mt-3">
                    {restante === 0 ? (
                      <div className={"text-sm font-semibold " + (p !== null && p >= objetivo ? t.ok : "text-red-500")}>
                        {p !== null && p >= objetivo
                          ? `✅ Semestre cerrado: ${p!.toFixed(2)} ≥ ${objetivo.toFixed(1)} ¡objetivo cumplido!`
                          : `🔒 Ya está todo evaluado (${p?.toFixed(2) ?? "—"}). Objetivo ${objetivo.toFixed(1)} no alcanzado.`}
                      </div>
                    ) : requerida !== null && requerida <= 0 ? (
                      <div className={"text-sm font-semibold " + t.ok}>
                        ✅ ¡Objetivo ya asegurado! Con solo 0.0 en el {restante}% restante mantienes {objetivo.toFixed(1)}.
                      </div>
                    ) : requerida !== null && requerida > 5 ? (
                      <div className="text-sm font-semibold text-red-500">
                        🔴 Imposible con lo restante: necesitarías {requerida.toFixed(2)} en el {restante}% que falta (máximo 5.0).
                        El mejor promedio alcanzable es {maximo.toFixed(2)}.
                      </div>
                    ) : requerida !== null ? (
                      <div className="text-sm font-semibold text-indigo-400">
                        📊 Necesitas <span className="text-lg font-extrabold">{requerida.toFixed(2)}</span> de promedio
                        en el {restante}% restante para llegar a {objetivo.toFixed(1)}.
                      </div>
                    ) : null}
                    {/* Barra de progreso de lo evaluado */}
                    <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.25)" }}>
                      <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, peso)}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}

// ==================== PESTAÑA HORARIOS ====================

/** Horario semanal: alta de clases (INSERT INTO clases) y cuadrícula por día. */
function TabHorarios({ data, refresh, t }: any) {
  const [f, setF] = useState({ materiaId: "", dia: 0, inicio: "07:00", fin: "09:00", salon: "" });

  const add = () => {
    if (!f.materiaId) return;
    MiniDB.insert<Clase>("clases", { id: uid(), ...f } as Clase);
    refresh();
  };
  const del = (id: string) => { MiniDB.remove("clases", id); refresh(); };
  const nombre = (id: string) => (data.materias as Materia[]).find((m) => m.id === id)?.nombre ?? "—";

  return (
    <div className="space-y-5">
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-3 " + t.text}>🕒 Agregar clase al horario</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <select className={inputBase + " sm:col-span-2 " + t.input} value={f.materiaId}
            onChange={(e) => setF({ ...f, materiaId: e.target.value })}>
            <option value="">Selecciona materia…</option>
            {(data.materias as Materia[]).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
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
        {(data.materias as Materia[]).length === 0 && (
          <p className="text-sm text-amber-500 mt-2">Primero crea una materia en la pestaña Materias.</p>
        )}
      </div>

      {/* Cuadrícula: una columna por día, clases ordenadas por hora */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DIAS.map((d, i) => {
          const cs = (data.clases as Clase[]).filter((c) => c.dia === i)
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

// ==================== APP PRINCIPAL ====================

/**
 * Componente raíz: tema (tokens), pestaña activa y renderizado condicional.
 * El tema oscuro se guarda en la config de la DB y se aplica al instante.
 */
export default function App() {
  const { data, refresh } = useDB();
  const [tab, setTab] = useState<"materias" | "notas" | "simulador" | "horarios">("materias");

  const cfg = data.config[0]; // fila singleton de config
  const t = tokens(!!cfg.dark); // clases del tema activo

  const toggleDark = () => {
    MiniDB.saveConfig({ dark: !cfg.dark });
    refresh();
  };

  const tabs = [
    { id: "materias", label: "📚 Materias" },
    { id: "notas", label: "📝 Notas" },
    { id: "simulador", label: "🎯 Simulador" },
    { id: "horarios", label: "🗓️ Horarios" },
  ] as const;

  return (
    <div className={"min-h-screen " + t.page + " transition-colors"}>
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        {/* Encabezado con título y botón de tema oscuro */}
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className={"text-2xl sm:text-3xl font-extrabold " + t.text}>🎓 Seguidor de Notas</h1>
            <p className={"text-sm " + t.sub}>Materias por semestre, notas ponderadas, simulador y horarios.</p>
          </div>
          {/* Toggle de tema: alterna dark en la config (persistente) */}
          <button
            onClick={toggleDark}
            className={"text-2xl rounded-xl px-3 py-2 border shadow-sm " + t.card}
            title={cfg.dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
          >
            {cfg.dark ? "☀️" : "🌙"}
          </button>
        </header>

        {/* Navegación de pestañas */}
        <nav className={"flex gap-2 mb-6 rounded-xl p-1.5 border shadow-sm w-fit mx-auto sm:mx-0 " + t.nav}>
          {tabs.map((x) => (
            <button key={x.id}
              onClick={() => setTab(x.id)}
              className={"px-4 py-2 rounded-lg text-sm font-semibold transition " +
                (tab === x.id ? "bg-indigo-600 text-white shadow" : t.navIn)}
            >
              {x.label}
            </button>
          ))}
        </nav>

        {tab === "materias" && <TabMaterias data={data} refresh={refresh} t={t} />}
        {tab === "notas" && <TabNotas data={data} refresh={refresh} t={t} />}
        {tab === "simulador" && <TabSimulador data={data} refresh={refresh} t={t} />}
        {tab === "horarios" && <TabHorarios data={data} refresh={refresh} t={t} />}

        <footer className={"mt-8 text-center text-xs " + t.faint}>
          🗄️ Tus datos se guardan en la base de datos local de este navegador.
        </footer>
      </div>
    </div>
  );
}
