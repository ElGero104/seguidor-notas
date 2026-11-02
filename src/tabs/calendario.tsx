// Tab calendario.tsx
// ==================== PESTAÑA CALENDARIO ====================

import { useState } from "react";
import { MiniDB } from "../db";
import { Materia, Nota, Clase, Evento, Recurso, Config } from "../types";
import { diasHasta, diasMes } from "../calculos";
import { DIAS, MESES, cardBase, Btn, FechaBadge, Fade } from "../tema";
import { setUndo } from "../undo";
import { exportarICS, importarICS } from "../exportar";
import { abrirZoom } from "./horarios";
/**
 * Calendario mensual de entregas: grilla de 7 columnas con navegación
 * de mes/año y los eventos (notas con fecha) resaltados por urgencia.
 */
export default function TabCalendario({ data, t }: any) {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [diaSel, setDiaSel] = useState<number | null>(null);
  const [vista, setVista] = useState<"entregas" | "clases">("entregas");

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

  // Eventos importados de un calendario externo (Google Calendar vía .ics)
  const evsPorDia: Record<number, Evento[]> = {};
  (data.eventos as Evento[] || []).forEach((ev) => {
    if (ev.fecha && ev.fecha.startsWith(`${anio}-${pad(mes + 1)}`)) {
      const d = parseInt(ev.fecha.slice(8, 10), 10);
      (evsPorDia[d] = evsPorDia[d] || []).push(ev);
    }
  });

  // Clases recurrentes del semestre activo dentro de su rango de fechas:
  // una clase con dia=0 (Lunes) aparece todos los lunes entre inicio y fin.
  const cfg: Config = data.config[0];
  const rango = (cfg.fechasSemestre || {})[cfg.activo] || { inicio: "", fin: "" };
  const clasesPorDia: Record<number, Clase[]> = {};
  (data.clases as Clase[]).forEach((c) => {
    if (!idsAct.has(c.materiaId)) return;
    for (let d = 1; d <= diasMes(anio, mes); d++) {
      const f = fechaDe(d);
      if (rango.inicio && f < rango.inicio) continue;
      if (rango.fin && f > rango.fin) continue;
      const diaSem = (new Date(anio, mes, d).getDay() + 6) % 7; // 0 = Lunes
      if (diaSem === c.dia) (clasesPorDia[d] = clasesPorDia[d] || []).push(c);
    }
  });

  // Offset para que la semana empiece en lunes
  const primerDiaSemana = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const diasDelMes = diasMes(anio, mes);
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
      {/* Selector de vista: Entregas o Clases (mismo diseño, mismo rango de semestre) */}
      <div className={"flex gap-1.5 p-1.5 rounded-2xl border w-fit " + t.nav}>
        {([["entregas", "📌 Entregas"], ["clases", "🕒 Clases"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setVista(id)}
            className={"px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 " +
              (vista === id
                ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30"
                : t.navIn)}>
            {label}
          </button>
        ))}
      </div>

      {/* Navegación de mes */}
      <div className={cardBase + " " + t.card + " flex items-center justify-between gap-2"}>
        <Btn t={t} tone="soft" onClick={() => mover(-1)}>← Anterior</Btn>
        <h2 className={"text-base sm:text-xl font-bold text-center " + t.text}>{MESES[mes]} {anio}</h2>
        <Btn t={t} tone="soft" onClick={() => mover(1)}>Siguiente →</Btn>
      </div>

      {/* Integración con Google Calendar (.ics) */}
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-1 " + t.text}>📅 Google Calendar</h2>
        <p className={"text-xs mb-3 " + t.sub}>
          📤 exporta tus entregas como archivo .ics (impórtalo en Google Calendar y tu celular te avisa de cada una) ·
          📥 importa tu calendario de Google (Configuración → Importar y exportar → Exportar) para verlo aquí junto a tus entregas.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <Btn t={t} tone="soft" onClick={() => exportarICS(data)}>📤 Entregas → .ics</Btn>
          <label className={"cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition " + t.softBtn}>
            📥 Importar calendario (.ics)
            <input type="file" accept=".ics,text/calendar" className="hidden"
              onChange={(e) => {
                const f = (e.target as HTMLInputElement).files?.[0];
                e.target.value = "";
                if (f) importarICS(f);
              }} />
          </label>
          {((data.eventos as Evento[]) || []).length > 0 && (
            <Btn t={t} tone="danger" onClick={() => {
              setUndo("📅 Eventos importados eliminados");
              MiniDB.removeWhere("eventos", () => true);
              window.dispatchEvent(new Event("db-undo"));
            }}>🗑️ Quitar importados ({(data.eventos as Evento[]).length})</Btn>
          )}
        </div>
      </div>

      {/* Encabezado de días de la semana */}
      <div className={"grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs uppercase font-bold " + t.faint}>
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
      </div>

      {/* Grilla del mes ANCHA: celdas más anchas que altas (aspect 16/10) */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {celdas.map((d, i) => {
          if (d === null) return <div key={"v" + i} />;
          const evs = porDia[d] || [];
          const dd = diasHasta(fechaDe(d));
          return (
            <div key={d} onClick={() => setDiaSel(d)}
              className={"min-h-16 sm:min-h-0 sm:aspect-[16/9] rounded-lg sm:rounded-xl border p-1 sm:p-2 text-[11px] sm:text-sm cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden " + t.group + (esHoy(d) ? " " + t.ring : "")}>
              <div className={"font-extrabold text-xs sm:text-base mb-0.5 sm:mb-1 " + (esHoy(d) ? "text-indigo-500" : t.sub)}>{d}</div>
              <div className="space-y-1">
                {vista === "entregas" && evs.map((n) => {
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
                      {m?.nombre.slice(0, 12) ?? "—"}
                    </div>
                  );
                })}
                {vista === "entregas" && (evsPorDia[d] || []).map((ev) => (
                  <div key={ev.id} title={ev.titulo + (ev.hora ? " · " + ev.hora : "") + (ev.lugar ? " · " + ev.lugar : "")}
                    className="truncate rounded px-1 py-0.5"
                    style={{ background: "rgba(99,102,241,0.25)", borderLeft: "2px solid #6366f1" }}>
                    {ev.titulo.slice(0, 14)}
                  </div>
                ))}
                {vista === "clases" && (clasesPorDia[d] || []).map((c) => {
                  const m = (data.materias as Materia[]).find((x) => x.id === c.materiaId);
                  const zoom = (data.recursos as Recurso[]).find((r) =>
                    r.materiaId === c.materiaId && r.url && /zoom\.us\//i.test(r.url));
                  return (
                    <div key={c.id} title={`${m?.nombre ?? ""} · ${c.inicio}–${c.fin}${c.salon ? " · " + c.salon : ""}`}
                      className="truncate rounded px-1 py-0.5 flex items-center gap-1"
                      style={{ background: (m?.color ?? "#64748b") + "22", borderLeft: `2px solid ${m?.color ?? "#64748b"}` }}>
                      <span className="truncate">🕒 {m?.nombre.slice(0, 10) ?? "—"} {c.inicio}</span>
                      {zoom && (
                        <button onClick={(e) => { e.stopPropagation(); abrirZoom(zoom.url); }} title={`Abrir Zoom en la app: ${zoom.titulo}`}
                          className="ml-auto text-indigo-500 hover:text-indigo-300 font-bold">🎥</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className={"text-xs text-center " + t.faint}>
        {vista === "entregas"
          ? "Vista Entregas: coloreadas por materia (rojo = vencida, ámbar = vence en ≤3 días) y en azul los eventos importados. Toca un día para ver el detalle."
          : "Vista Clases: solo aparecen dentro del rango de fechas del semestre activo. Toca un día para ver sus clases y unirse por Zoom."}
      </p>

      {/* Detalle del día seleccionado: clases completas con botón de unirse */}
      {diaSel !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDiaSel(null)}>
          <div className={cardBase + " " + t.card + " w-full max-w-md max-h-[80vh] overflow-auto"} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={"text-lg font-bold " + t.text}>
                🗓️ {fechaDe(diaSel)} ({DIAS[(new Date(anio, mes, diaSel).getDay() + 6) % 7]})
              </h2>
              <button onClick={() => setDiaSel(null)} className={"text-xl " + t.faint}>✕</button>
            </div>
            {vista === "clases" && (clasesPorDia[diaSel] || []).length === 0 && (
              <p className={"text-sm " + t.faint}>Sin clases este día (dentro del semestre activo).</p>
            )}
            {vista === "clases" && (
            <div className="space-y-2">
              {(clasesPorDia[diaSel] || [])
                .sort((a, b) => a.inicio.localeCompare(b.inicio))
                .map((c) => {
                  const m = (data.materias as Materia[]).find((x) => x.id === c.materiaId);
                  const zoom = (data.recursos as Recurso[]).find((r) =>
                    r.materiaId === c.materiaId && r.url && /zoom\.us\//i.test(r.url));
                  return (
                    <div key={c.id} className={"rounded-xl border p-3 " + t.groupCard}
                      style={{ borderLeft: `4px solid ${m?.color ?? "#64748b"}` }}>
                      <div className={"font-bold " + t.text}>{m?.nombre ?? "—"}</div>
                      <div className={"text-sm " + t.sub}>
                        🕒 {c.inicio} – {c.fin}{c.salon ? ` · 🚪 ${c.salon}` : ""}
                      </div>
                      {zoom ? (
                        <Btn t={t} className="mt-2 w-full" onClick={() => abrirZoom(zoom.url)}>
                          🎥 Unirse a Zoom ({zoom.titulo})
                        </Btn>
                      ) : (
                        <div className={"text-xs mt-2 " + t.faint}>Sin enlace de Zoom para esta materia (añádelo en Recursos).</div>
                      )}
                    </div>
                  );
                })}
            </div>
            )}
            {vista === "entregas" && (porDia[diaSel] || []).length > 0 && (
              <div className="mt-4">
                <h3 className={"font-bold text-sm mb-1 " + t.text}>📌 Entregas</h3>
                <div className="space-y-1">
                  {(porDia[diaSel] || []).map((n) => {
                    const m = (data.materias as Materia[]).find((x) => x.id === n.materiaId);
                    return (
                      <div key={n.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                        <span className="font-medium" style={{ color: m?.color }}>{m?.nombre ?? "—"}</span>
                        <span>· {n.nombre}</span>
                        <span className="ml-auto"><FechaBadge fecha={n.fecha} t={t} /></span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
