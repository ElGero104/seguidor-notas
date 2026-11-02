import { useState, useEffect } from "react";
// Tab horarios.tsx
// ==================== PESTAÑA HORARIOS ====================

import { MiniDB, uid } from "../db";
import { Materia, Clase, Recurso } from "../types";
import { DIAS, cardBase, inputBase, Btn } from "../tema.tsx";
import { setUndo } from "../undo.tsx";
/** Extrae el meeting id y password de un link de Zoom. */
export function zoomParts(url: string) {
  const m = url.match(/zoom\.us\/(?:j|my)\/(\d+)(?:[?&]pwd=([A-Za-z0-9]+))?/i);
  if (!m) return null;
  return { id: m[1], pwd: m[2] || "" };
}

/** Abre Zoom: primero intenta la app instalada (zoommtg://), si no, la web. */
export function abrirZoom(url: string) {
  const p = zoomParts(url);
  const link = p
    ? `zoommtg://zoom.us/join?confno=${p.id}${p.pwd ? "&pwd=" + p.pwd : ""}`
    : url;
  const w = window.open(link, "_blank");
  if (!w || w.closed) window.location.href = url;
}

/** Horario semanal: alta de clases y cuadrícula por día. */
export default function TabHorarios({ data, refresh, t }: any) {
  const [f, setF] = useState({ materiaId: "", dia: 0, inicio: "07:00", fin: "09:00", salon: "" });

  const add = () => {
    if (!f.materiaId) return;
    MiniDB.insert<Clase>("clases", { id: uid(), ...f } as Clase);
    refresh();
  };
  const del = (id: string) => { setUndo("🗑️ Clase eliminada"); MiniDB.remove("clases", id); refresh(); };
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
                  const zoom = (data.recursos as Recurso[]).find((r) =>
                    r.materiaId === c.materiaId && r.url && /zoom\.us\//i.test(r.url));
                  return (
                    <div key={c.id} className={"rounded-lg border p-2 text-xs shadow-sm group " + t.groupCard}
                      style={{ borderLeft: `4px solid ${color}` }}>
                      <div className={"font-semibold " + t.text}>{nombre(c.materiaId)}</div>
                      <div className={t.sub}>{c.inicio} – {c.fin}{c.salon ? ` · ${c.salon}` : ""}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {zoom && (
                          <button onClick={() => abrirZoom(zoom.url)}
                            className="text-indigo-500 hover:text-indigo-400 font-semibold"
                            title={`Abrir en la app de Zoom: ${zoom.titulo}`}>
                            🎥 Unirse
                          </button>
                        )}
                        <button className="text-red-400 opacity-0 group-hover:opacity-100 transition"
                          onClick={() => del(c.id)}>Eliminar</button>
                      </div>
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
