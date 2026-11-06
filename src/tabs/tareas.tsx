import { useState } from "react";
// Tab tareas.tsx
// ==================== PESTAÑA TAREAS (TO-DO POR MATERIA) ====================

import { MiniDB, uid } from "../db";
import { Materia, Tarea, Config } from "../types";
import { diasHasta } from "../calculos";
import { cardBase, inputBase, labelBase, Btn, FechaBadge, Fade } from "../tema";
import { setUndo } from "../undo";

/**
 * Lista de tareas pendientes por materia del semestre activo.
 * Cada tarea tiene título, descripción opcional, fecha límite y estado.
 * Se destaca la sección "Hoy": tareas vencidas o con fecha de hoy.
 */
export default function TabTareas({ data, refresh, t }: any) {
  const cfg: Config = data.config[0];
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "hoy" | string>("todas");
  const [mostrarCompletadas, setMostrarCompletadas] = useState(false);

  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo);
  const idsAct = new Set(mats.map((m) => m.id));
  const tareas = (data.tareas as Tarea[]).filter((t) => idsAct.has(t.materiaId));
  const nombreMateria = (id: string) => mats.find((m) => m.id === id)?.nombre ?? "—";

  const agregar = () => {
    if (!titulo.trim() || !materiaId) return;
    MiniDB.insert<Tarea>("tareas", {
      id: uid(),
      materiaId,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      fecha: fecha || undefined,
      completada: false,
      creada: new Date().toISOString(),
    });
    setTitulo(""); setDescripcion(""); setFecha("");
    refresh();
  };

  const toggleCompletada = (t: Tarea) => {
    MiniDB.update<Tarea>("tareas", t.id, { completada: !t.completada });
    refresh();
  };

  const eliminar = (id: string) => {
    setUndo("🗑️ Tarea eliminada");
    MiniDB.remove("tareas", id);
    refresh();
  };

  const editarFecha = (id: string, nuevaFecha: string) => {
    MiniDB.update<Tarea>("tareas", id, { fecha: nuevaFecha || undefined });
    refresh();
  };

  // Filtrado
  const pendientes = tareas.filter((t) => !t.completada);
  const completadas = tareas.filter((t) => t.completada);
  const hoy = new Date().toISOString().slice(0, 10);

  let visibles: Tarea[];
  if (filtro === "hoy") {
    visibles = pendientes.filter((t) => {
      if (!t.fecha) return false;
      const d = diasHasta(t.fecha);
      return d !== null && d <= 0; // vencidas o de hoy
    });
  } else if (filtro === "todas") {
    visibles = pendientes;
  } else {
    visibles = pendientes.filter((t) => t.materiaId === filtro);
  }

  const vencidas = pendientes.filter((t) => t.fecha && (diasHasta(t.fecha) ?? 99) < 0);
  const deHoy = pendientes.filter((t) => t.fecha && diasHasta(t.fecha) === 0);

  return (
    <div className="space-y-5">
      {/* --- Formulario de nueva tarea --- */}
      <Fade k="form">
        <div className={cardBase + " " + t.card}>
          <h2 className={"font-bold mb-3 " + t.text}>✅ Nueva tarea</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelBase + " " + t.faint}>Materia *</label>
              <select className={inputBase + " " + t.input} value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
                <option value="">Selecciona materia…</option>
                {mats.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={labelBase + " " + t.faint}>Fecha límite (opcional)</label>
              <input type="date" className={inputBase + " " + t.input} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelBase + " " + t.faint}>Título *</label>
              <input className={inputBase + " " + t.input} placeholder="Ej: Leer capítulo 3, preparar exposición…"
                value={titulo} onChange={(e) => setTitulo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && agregar()} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelBase + " " + t.faint}>Descripción</label>
              <textarea className={inputBase + " " + t.input + " resize-none"} rows={2}
                placeholder="Detalles opcionales…" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <Btn t={t} onClick={agregar} disabled={!titulo.trim() || !materiaId}>＋ Agregar tarea</Btn>
          </div>
        </div>
      </Fade>

      {/* --- Resumen rápido --- */}
      {tareas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className={cardBase + " " + t.card + " text-center py-4"}>
            <div className={"text-2xl font-extrabold " + t.text}>{pendientes.length}</div>
            <div className={"text-xs " + t.faint}>Pendientes</div>
          </div>
          <div className={cardBase + " " + t.card + " text-center py-4"}>
            <div className={"text-2xl font-extrabold " + (deHoy.length ? "text-amber-500" : t.text)}>{deHoy.length}</div>
            <div className={"text-xs " + t.faint}>Hoy</div>
          </div>
          <div className={cardBase + " " + t.card + " text-center py-4"}>
            <div className={"text-2xl font-extrabold " + (vencidas.length ? "text-red-500" : t.text)}>{vencidas.length}</div>
            <div className={"text-xs " + t.faint}>Vencidas</div>
          </div>
        </div>
      )}

      {/* --- Filtros --- */}
      {tareas.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className={"text-xs font-bold " + t.faint}>Ver:</span>
          {(["todas", "hoy", ...mats.map((m) => m.id)] as const).map((f) => {
            const label = f === "todas" ? "📋 Todas" : f === "hoy" ? "⏰ Hoy" : `📚 ${nombreMateria(f)}`;
            const activo = filtro === f;
            return (
              <button key={f} onClick={() => setFiltro(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activo ? "bg-indigo-600 text-white shadow" : t.group + " hover:opacity-80"
                }`}>
                {label}
              </button>
            );
          })}
          <label className={"ml-auto flex items-center gap-1.5 text-xs cursor-pointer " + t.sub}>
            <input type="checkbox" checked={mostrarCompletadas} onChange={(e) => setMostrarCompletadas(e.target.checked)} />
            Mostrar completadas ({completadas.length})
          </label>
        </div>
      )}

      {/* --- Lista de tareas --- */}
      {visibles.length === 0 && !mostrarCompletadas && (
        <Fade k="vacio">
          <div className={"rounded-3xl border-2 border-dashed p-10 text-center " + t.card}>
            <div className="text-4xl mb-2">🎉</div>
            <p className={"text-sm " + t.sub}>
              {filtro === "hoy" ? "No hay tareas para hoy. ¡Todo al día!" : "Sin tareas pendientes en esta vista."}
            </p>
          </div>
        </Fade>
      )}

      <div className="space-y-2">
        {visibles.map((ta) => {
          const m = mats.find((x) => x.id === ta.materiaId);
          const d = ta.fecha ? diasHasta(ta.fecha) : null;
          const vencida = d !== null && d < 0;
          const esHoy = d === 0;
          return (
            <Fade k={ta.id}>
              <div className={cardBase + " " + t.card + " !p-4 flex items-start gap-3"}
                style={{ borderLeft: `4px solid ${m?.color ?? "#6366f1"}` }}>
                <button onClick={() => toggleCompletada(ta)}
                  className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                    ta.completada ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-indigo-400"
                  }`}>
                  {ta.completada && "✓"}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${ta.completada ? "line-through opacity-50 " + t.sub : t.text}`}>
                    {ta.titulo}
                  </div>
                  {ta.descripcion && (
                    <div className={`text-xs mt-0.5 ${t.sub}`}>{ta.descripcion}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={"text-[10px] px-2 py-0.5 rounded-full font-bold " + t.group}>
                      {m?.nombre ?? "—"}
                    </span>
                    {ta.fecha && (
                      <>
                        <input type="date" value={ta.fecha} onChange={(e) => editarFecha(ta.id, e.target.value)}
                          className={"text-[10px] bg-transparent border rounded px-1.5 py-0.5 " + t.input} />
                        {vencida && <span className={"text-[10px] font-bold " + t.badBg + " px-2 py-0.5 rounded-full"}>🔴 venció hace {-d!} d</span>}
                        {esHoy && <span className={"text-[10px] font-bold " + t.warnBg + " px-2 py-0.5 rounded-full"}>⏰ hoy</span>}
                        {d !== null && d > 0 && <span className={"text-[10px] font-bold " + t.okBg + " px-2 py-0.5 rounded-full"}>📅 en {d} d</span>}
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => eliminar(ta.id)} className="text-red-400 hover:text-red-500 text-xs flex-shrink-0" title="Eliminar">✕</button>
              </div>
            </Fade>
          );
        })}
      </div>

      {/* --- Completadas --- */}
      {mostrarCompletadas && completadas.length > 0 && (
        <div className="space-y-2">
          <h3 className={"text-sm font-bold " + t.faint}>✔ Completadas</h3>
          {completadas.map((ta) => {
            const m = mats.find((x) => x.id === ta.materiaId);
            return (
              <div key={ta.id} className={cardBase + " " + t.card + " !p-4 flex items-center gap-3 opacity-60"}
                style={{ borderLeft: `4px solid ${m?.color ?? "#6366f1"}` }}>
                <button onClick={() => toggleCompletada(ta)}
                  className="w-6 h-6 rounded-lg border-2 bg-emerald-500 border-emerald-500 text-white flex items-center justify-center flex-shrink-0">✓</button>
                <div className="flex-1 min-w-0">
                  <div className={"font-semibold line-through " + t.sub}>{ta.titulo}</div>
                  <span className={"text-[10px] " + t.faint}>{m?.nombre}</span>
                </div>
                <button onClick={() => eliminar(ta.id)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
