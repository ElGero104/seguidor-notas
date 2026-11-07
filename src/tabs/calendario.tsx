// Tab calendario.tsx
// ==================== PESTAÑA CALENDARIO (MES + SEMANA) ====================

import { useState, useMemo } from "react";
import { MiniDB } from "../db";
import { Materia, Nota, Clase, Evento, Recurso, Config } from "../types";
import { diasHasta, diasMes } from "../calculos";
import { DIAS, MESES, cardBase, Btn, FechaBadge, Fade } from "../tema";
import { setUndo } from "../undo";
import { exportarICS, importarICS } from "../exportar";
import { abrirZoom } from "./horarios";

export default function TabCalendario({ data, t }: any) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [diaSel, setDiaSel] = useState<string | null>(null); // "YYYY-MM-DD"
  const [vista, setVista] = useState<"entregas" | "clases">("clases");
  const [modo, setModo] = useState<"mes" | "semana">("semana");
  // Lunes de la semana mostrada en modo semana (estado propio, no derivado del mes)
  const hoyRef = new Date(); hoyRef.setHours(0, 0, 0, 0);
  const [lunSem, setLunSem] = useState(() => {
    const d = new Date(hoyRef);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  });

  const pad = (n: number) => String(n).padStart(2, "0");
  const fechaStr = (a: number, m: number, d: number) => `${a}-${pad(m + 1)}-${pad(d)}`;

  const cfg: Config = data.config[0];
  const idsAct = new Set(
    (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo).map((m) => m.id)
  );
  const nomMat = (id: string) => (data.materias as Materia[]).find((m) => m.id === id);

  // ---- Datos por fecha (YYYY-MM-DD) ----
  const entregasPorFecha = useMemo(() => {
    const map: Record<string, Nota[]> = {};
    (data.notas as Nota[]).forEach((n) => {
      if (n.fecha && idsAct.has(n.materiaId)) (map[n.fecha] = map[n.fecha] || []).push(n);
    });
    return map;
  }, [data.notas, cfg.activo]);

  const eventosPorFecha = useMemo(() => {
    const map: Record<string, Evento[]> = {};
    ((data.eventos as Evento[]) || []).forEach((ev) => {
      if (ev.fecha) (map[ev.fecha] = map[ev.fecha] || []).push(ev);
    });
    return map;
  }, [data.eventos]);

  const rango = (cfg.fechasSemestre || {})[cfg.activo] || { inicio: "", fin: "" };
  // Clases recurrentes por fecha en un rango amplio (mes ± 6 semanas),
  // un solo loop sin duplicados: cada fecha se visita una vez.
  const clasesPorFecha = useMemo(() => {
    const map: Record<string, Clase[]> = {};
    const centro = new Date(anio, mes, 15);
    const inicio = new Date(centro); inicio.setDate(inicio.getDate() - 42);
    const fin = new Date(centro); fin.setDate(fin.getDate() + 42);
    (data.clases as Clase[]).forEach((c) => {
      if (!idsAct.has(c.materiaId)) return;
      for (let dt = new Date(inicio); dt <= fin; dt.setDate(dt.getDate() + 1)) {
        const f = fechaStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
        if (rango.inicio && f < rango.inicio) continue;
        if (rango.fin && f > rango.fin) continue;
        const diaSem = (dt.getDay() + 6) % 7; // 0 = Lunes
        if (diaSem === c.dia) (map[f] = map[f] || []).push(c);
      }
    });
    return map;
  }, [data.clases, anio, mes, cfg.activo, rango.inicio, rango.fin]);

  // ---- Vista semana: lunes de la semana actual del mes mostrado ----
  const lunesSemana = lunSem;

  const diasSemana: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(lunesSemana);
    d.setDate(d.getDate() + i);
    diasSemana.push(fechaStr(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  // ---- Resumen ----
  const entregasSemana = diasSemana.reduce((s, f) => s + (entregasPorFecha[f]?.length || 0), 0);
  const entregasHoy = entregasPorFecha[fechaStr(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())]?.length || 0;
  const clasesHoy = clasesPorFecha[fechaStr(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())]?.length || 0;

  const mover = (delta: number) => {
    if (modo === "mes") {
      let m = mes + delta, a = anio;
      if (m < 0) { m = 11; a--; }
      if (m > 11) { m = 0; a++; }
      setMes(m); setAnio(a);
    } else {
      const d = new Date(lunSem);
      d.setDate(d.getDate() + delta * 7);
      setLunSem(d);
      setAnio(d.getFullYear()); setMes(d.getMonth()); // mantiene clasesPorFecha en rango
    }
  };

  const esHoy = (f: string) => f === fechaStr(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  // Celdas del mes
  const primerDiaSemana = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const diasDelMes = diasMes(anio, mes);
  const celdas: (number | null)[] = [];
  for (let i = 0; i < primerDiaSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasDelMes; d++) celdas.push(d);

  const tituloVista = modo === "mes" ? `${MESES[mes]} ${anio}` : `Semana del ${lunesSemana.getDate()} ${MESES[lunesSemana.getMonth()]} ${lunesSemana.getFullYear()}`;

  // Color de urgencia de una celda
  const urgenciaCelda = (f: string): "vencida" | "hoy" | "pronto" | null => {
    const evs = entregasPorFecha[f] || [];
    if (!evs.length) return null;
    const dd = diasHasta(f);
    if (dd === null) return null;
    if (dd < 0) return "vencida";
    if (dd === 0) return "hoy";
    if (dd <= 3) return "pronto";
    return null;
  };

  return (
    <div className="space-y-5">
      {/* Selectores: modo (Mes/Semana) + vista (Entregas/Clases) */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className={"flex gap-1 p-1 rounded-xl border " + t.nav}>
          {([["mes", "📅 Mes"], ["semana", "🗓️ Semana"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setModo(id)}
              className={"px-3 py-1.5 rounded-lg text-xs font-bold transition-all " + (modo === id ? "bg-white dark:bg-slate-700 shadow " + t.text : t.navIn)}>
              {label}
            </button>
          ))}
        </div>
        <div className={"flex gap-1 p-1 rounded-xl border " + t.nav}>
          {([["entregas", "📌 Entregas"], ["clases", "🕐 Clases"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setVista(id)}
              className={"px-3 py-1.5 rounded-lg text-xs font-bold transition-all " + (vista === id ? "bg-white dark:bg-slate-700 shadow " + t.text : t.navIn)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen rápido */}
      <div className="grid grid-cols-3 gap-2">
        <div className={cardBase + " " + t.card + " text-center !p-3"}>
          <div className={"text-xl font-extrabold " + (entregasHoy ? "text-amber-500" : t.text)}>{entregasHoy}</div>
          <div className={"text-[10px] uppercase font-bold " + t.faint}>Entregas hoy</div>
        </div>
        <div className={cardBase + " " + t.card + " text-center !p-3"}>
          <div className={"text-xl font-extrabold " + t.text}>{entregasSemana}</div>
          <div className={"text-[10px] uppercase font-bold " + t.faint}>Esta semana</div>
        </div>
        <div className={cardBase + " " + t.card + " text-center !p-3"}>
          <div className={"text-xl font-extrabold " + t.text}>{clasesHoy}</div>
          <div className={"text-[10px] uppercase font-bold " + t.faint}>Clases hoy</div>
        </div>
      </div>

      {/* Navegación */}
      <div className={cardBase + " " + t.card + " flex items-center justify-between gap-2"}>
        <Btn t={t} tone="soft" onClick={() => mover(-1)}>← Anterior</Btn>
        <h2 className={"text-base sm:text-xl font-bold text-center " + t.text}>{tituloVista}</h2>
        <Btn t={t} tone="soft" onClick={() => mover(1)}>Siguiente →</Btn>
      </div>

      {/* Google Calendar */}
      <div className={cardBase + " " + t.card}>
        <h2 className={"font-bold mb-1 " + t.text}>📅 Google Calendar</h2>
        <p className={"text-xs mb-3 " + t.sub}>
          📤 exporta tus entregas como .ics · 📥 importa tu calendario de Google para verlo junto a tus entregas.
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
              setUndo("🗑️ Eventos importados eliminados");
              MiniDB.removeWhere("eventos", () => true);
              window.dispatchEvent(new Event("db-undo"));
            }}>🗑️ Quitar importados ({(data.eventos as Evento[]).length})</Btn>
          )}
        </div>
      </div>

      {/* ============ VISTA MES ============ */}
      {modo === "mes" && (
        <>
          <div className={"grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] sm:text-xs uppercase font-bold " + t.faint}>
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {celdas.map((d, i) => {
              if (d === null) return <div key={"v" + i} />;
              const f = fechaStr(anio, mes, d);
              const urg = vista === "entregas" ? urgenciaCelda(f) : null;
              const evs = vista === "entregas" ? (entregasPorFecha[f] || []) : (clasesPorFecha[f] || []);
              const bgUrg = urg === "vencida" ? "bg-red-500/15 border-red-400/40" : urg === "hoy" ? "bg-amber-400/20 border-amber-400/50" : urg === "pronto" ? "bg-amber-400/10 border-amber-300/30" : "";
              return (
                <div key={d} onClick={() => setDiaSel(f)}
                  className={"min-h-16 sm:min-h-0 sm:aspect-[16/10] rounded-lg sm:rounded-xl border p-1 sm:p-2 text-[11px] sm:text-sm cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 overflow-hidden " + t.group + (esHoy(f) ? " " + t.ring + " !border-2" : "") + (bgUrg ? " " + bgUrg : "")}>
                  <div className={"font-extrabold text-xs sm:text-base mb-0.5 " + (esHoy(f) ? "text-indigo-500" : urg === "vencida" ? "text-red-500" : urg === "hoy" ? "text-amber-500" : t.sub)}>
                    {d}{urg === "hoy" && <span className="ml-1 text-[9px]">●</span>}
                  </div>
                  <div className="space-y-0.5">
                    {vista === "entregas" && evs.map((n: any) => {
                      const m = nomMat(n.materiaId);
                      return (
                        <div key={n.id} title={`${m?.nombre ?? ""} · ${n.nombre}`}
                          className="truncate rounded px-1 py-px text-[10px]"
                          style={{ background: (m?.color ?? "#64748b") + "33", borderLeft: `2px solid ${m?.color ?? "#64748b"}` }}>
                          {(n.nombre || "—").slice(0, 12)}
                        </div>
                      );
                    })}
                    {vista === "entregas" && (eventosPorFecha[f] || []).map((ev) => (
                      <div key={ev.id} title={ev.titulo}
                        className="truncate rounded px-1 py-px text-[10px]"
                        style={{ background: "rgba(99,102,241,0.25)", borderLeft: "2px solid #6366f1" }}>
                        {(ev.titulo || "—").slice(0, 12)}
                      </div>
                    ))}
                    {vista === "clases" && evs.map((c: any) => {
                      const m = nomMat(c.materiaId);
                      return (
                        <div key={c.id} title={`${m?.nombre ?? ""} · ${c.inicio}`}
                          className="truncate rounded px-1 py-px text-[10px]"
                          style={{ background: (m?.color ?? "#64748b") + "22", borderLeft: `2px solid ${m?.color ?? "#64748b"}` }}>
                          🕐 {c.inicio} {(m?.nombre || "—").slice(0, 8)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ============ VISTA SEMANA ============ */}
      {modo === "semana" && (
        <div className="space-y-2">
          {diasSemana.map((f) => {
            const d = new Date(f + "T00:00:00");
            const dow = DIAS[(d.getDay() + 6) % 7];
            const urg = vista === "entregas" ? urgenciaCelda(f) : null;
            const evs = vista === "entregas" ? (entregasPorFecha[f] || []) : (clasesPorFecha[f] || []);
            const bgUrg = urg === "vencida" ? "bg-red-500/10 border-red-400/30" : urg === "hoy" ? "bg-amber-400/15 border-amber-400/40" : "";
            return (
              <div key={f} onClick={() => setDiaSel(f)}
                className={cardBase + " " + t.card + " !p-3 flex gap-3 cursor-pointer hover:-translate-y-0.5 transition-all " + bgUrg + (esHoy(f) ? " " + t.ring : "")}>
                <div className="text-center min-w-[52px]">
                  <div className={"text-[10px] uppercase font-bold " + t.faint}>{(dow || "").slice(0, 3)}</div>
                  <div className={"text-2xl font-extrabold " + (esHoy(f) ? "text-indigo-500" : urg === "vencida" ? "text-red-500" : t.text)}>
                    {d.getDate()}
                  </div>
                  <div className={"text-[10px] " + t.faint}>{(MESES[d.getMonth()] || "").slice(0, 3)}</div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {evs.length === 0 && (eventosPorFecha[f] || []).length === 0 && (
                    <div className={"text-xs " + t.faint}>Sin {vista === "entregas" ? "entregas" : "clases"}</div>
                  )}
                  {vista === "entregas" && evs.map((n: any) => {
                    const m = nomMat(n.materiaId);
                    const dd = diasHasta(f);
                    return (
                      <div key={n.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1"
                        style={{ background: (m?.color ?? "#64748b") + "1a", borderLeft: `3px solid ${m?.color ?? "#64748b"}` }}>
                        <span className="font-semibold truncate" style={{ color: m?.color }}>{m?.nombre ?? "—"}</span>
                        <span className={"truncate " + t.sub}>{n.nombre}</span>
                        <span className="ml-auto flex-shrink-0"><FechaBadge fecha={f} t={t} /></span>
                      </div>
                    );
                  })}
                  {vista === "entregas" && (eventosPorFecha[f] || []).map((ev) => (
                    <div key={ev.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1"
                      style={{ background: "rgba(99,102,241,0.15)", borderLeft: "3px solid #6366f1" }}>
                      <span>📅 {ev.titulo}</span>
                      {ev.hora && <span className={t.faint}>· {ev.hora}</span>}
                    </div>
                  ))}
                  {vista === "clases" && evs.map((c: any) => {
                    const m = nomMat(c.materiaId);
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1"
                        style={{ background: (m?.color ?? "#64748b") + "1a", borderLeft: `3px solid ${m?.color ?? "#64748b"}` }}>
                        <span className="font-bold">🕐 {c.inicio}–{c.fin}</span>
                        <span className="font-semibold truncate" style={{ color: m?.color }}>{m?.nombre ?? "—"}</span>
                        {c.salon && <span className={t.faint}>· 🚪 {c.salon}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalle del día seleccionado */}
      {diaSel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => setDiaSel(null)}>
          <div className={cardBase + " " + t.card + " w-full max-w-md max-h-[80vh] overflow-auto"} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={"text-lg font-bold " + t.text}>
                🗓️ {diaSel} ({DIAS[(new Date(diaSel + "T00:00:00").getDay() + 6) % 7]})
              </h2>
              <button onClick={() => setDiaSel(null)} className={"text-xl " + t.faint}>✕</button>
            </div>
            {vista === "clases" && (clasesPorFecha[diaSel] || []).length === 0 && (
              <p className={"text-sm " + t.faint}>Sin clases este día (dentro del semestre activo).</p>
            )}
            {vista === "clases" && (
              <div className="space-y-2">
                {(clasesPorFecha[diaSel] || []).sort((a, b) => a.inicio.localeCompare(b.inicio)).map((c) => {
                  const m = nomMat(c.materiaId);
                  const zoom = (data.recursos as Recurso[]).find((r) => r.materiaId === c.materiaId && r.url && /zoom\.us\//i.test(r.url));
                  return (
                    <div key={c.id} className={"rounded-xl border p-3 " + t.groupCard} style={{ borderLeft: `4px solid ${m?.color ?? "#64748b"}` }}>
                      <div className={"font-bold " + t.text}>{m?.nombre ?? "—"}</div>
                      <div className={"text-sm " + t.sub}>🕐 {c.inicio} – {c.fin}{c.salon ? ` · 🚪 ${c.salon}` : ""}</div>
                      {zoom ? (
                        <Btn t={t} className="mt-2 w-full" onClick={() => abrirZoom(zoom.url)}>🎥 Unirse a Zoom ({zoom.titulo})</Btn>
                      ) : (
                        <div className={"text-xs mt-2 " + t.faint}>Sin enlace de Zoom (añádelo en Recursos de la materia).</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {vista === "entregas" && (entregasPorFecha[diaSel] || []).length > 0 && (
              <div className="space-y-1">
                <h3 className={"font-bold text-sm mb-1 " + t.text}>📌 Entregas</h3>
                {(entregasPorFecha[diaSel] || []).map((n) => {
                  const m = nomMat(n.materiaId);
                  return (
                    <div key={n.id} className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5"
                      style={{ background: (m?.color ?? "#64748b") + "1a", borderLeft: `3px solid ${m?.color ?? "#64748b"}` }}>
                      <span className="font-medium truncate" style={{ color: m?.color }}>{m?.nombre ?? "—"}</span>
                      <span className={t.sub}>· {n.nombre} · {n.porcentaje}%</span>
                      <span className="ml-auto"><FechaBadge fecha={n.fecha} t={t} /></span>
                    </div>
                  );
                })}
              </div>
            )}
            {vista === "entregas" && (eventosPorFecha[diaSel] || []).length > 0 && (
              <div className="mt-3 space-y-1">
                <h3 className={"font-bold text-sm mb-1 " + t.text}>📅 Eventos importados</h3>
                {(eventosPorFecha[diaSel] || []).map((ev) => (
                  <div key={ev.id} className="text-sm flex gap-2">
                    <span>📅 {ev.titulo}</span>
                    {ev.hora && <span className={t.faint}>· {ev.hora}</span>}
                    {ev.lugar && <span className={t.faint}>· {ev.lugar}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
