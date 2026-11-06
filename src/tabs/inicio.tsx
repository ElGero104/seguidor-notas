// Tab inicio.tsx
// ==================== PESTAÑA INICIO (DASHBOARD) ====================

import { MiniDB } from "../db";
import { Materia, Nota, Clase, Recurso, Config } from "../types";
import { promedio, calculo, diasHasta } from "../calculos";
import { DIAS, cardBase, Btn, FechaBadge, Fade, estadoBg, estadoTxt } from "../tema";
import { abrirZoom } from "./horarios";

/** Barra de progreso del semestre: % transcurrido entre fecha de inicio y fin. */
function BarraSemestre({ cfg, t, refresh, data }: any) {
  const rango = (cfg.fechasSemestre || {})[cfg.activo];
  // Sin fechas: mostrar aviso con botón para configurarlas rápido
  if (!rango || !rango.inicio || !rango.fin) {
    return (
      <div className={cardBase + " " + t.card + " flex flex-wrap items-center gap-3"}>
        <span className={"text-sm " + t.sub}>📅 Agrega las fechas de <strong>{cfg.activo}</strong> para ver el progreso del semestre</span>
        <button
          onClick={() => {
            const ini = prompt("📅 Fecha de inicio del semestre (AAAA-MM-DD):", rango?.inicio || "");
            if (ini === null) return;
            const fin = prompt("📅 Fecha de fin del semestre (AAAA-MM-DD):", rango?.fin || "");
            if (fin === null) return;
            const v = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "";
            if (!v(ini) || !v(fin)) { alert("⚠️ Ingresa fechas válidas en formato AAAA-MM-DD"); return; }
            MiniDB.saveConfig({ fechasSemestre: { ...(cfg.fechasSemestre || {}), [cfg.activo]: { inicio: v(ini), fin: v(fin) } } });
            refresh();
          }}
          className={"ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition"}>
          ➕ Configurar fechas
        </button>
      </div>
    );
  }
  const inicio = new Date(rango.inicio + "T00:00:00");
  const fin = new Date(rango.fin + "T00:00:00");
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime()) || fin <= inicio) return null;
  const total = fin.getTime() - inicio.getTime();
  const transcurrido = hoy.getTime() - inicio.getTime();
  const pct = Math.max(0, Math.min(100, Math.round((transcurrido / total) * 100)));
  const diasTotales = Math.round(total / 86400000);
  const diasTranscurridos = Math.max(0, Math.round(transcurrido / 86400000));
  const diasRestantes = Math.max(0, Math.round((fin.getTime() - hoy.getTime()) / 86400000));
  const semTranscurridas = Math.floor(diasTranscurridos / 7);
  const semTotales = Math.ceil(diasTotales / 7);
  return (
    <div className={cardBase + " " + t.card}>
      <div className="flex items-center justify-between mb-2">
        <h2 className={"font-bold text-sm " + t.text}>📅 Progreso del semestre · {cfg.activo}</h2>
        <span className={"text-sm font-extrabold " + (pct >= 100 ? t.ok : pct >= 75 ? "text-amber-500" : t.text)}>{pct}%</span>
      </div>
      <div className={"h-3 rounded-full overflow-hidden " + t.group}>
        <div
          className={"h-full rounded-full transition-all duration-700 " + (pct >= 100 ? "bg-emerald-500" : "bg-gradient-to-r from-indigo-500 to-violet-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className={"flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs " + t.faint}>
        <span>🗓️ {rango.inicio} → {rango.fin}</span>
        <span>⏳ Semana {Math.min(semTranscurridas + (diasTranscurridos % 7 > 0 ? 1 : 0), semTotales)} de {semTotales}</span>
        <span>📆 {diasRestantes} días restantes</span>
        {pct >= 100 && <span className={t.ok + " font-bold"}>✅ ¡Semestre terminado!</span>}
        {hoy < inicio && <span className="text-amber-500 font-bold">⏸️ Aún no empieza</span>}
      </div>
    </div>
  );
}
/**
 * Dashboard de resumen: promedio general, % del semestre evaluado,
 * próximas entregas y materias que requieren atención — todo de un vistazo.
 */
export default function TabDashboard({ data, refresh, t, goTab }: any) {
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

  // ---- ¿Qué sigue hoy?: clases del día (horario) + entregas que vencen hoy ----
  const ahora = new Date();
  const diaHoy = (ahora.getDay() + 6) % 7; // 0 = lunes
  const idsHoy = new Set(mats.map((m) => m.id));
  const minActual = ahora.getHours() * 60 + ahora.getMinutes();
  const aMin = (h: string) => { const [H, M] = h.split(":").map(Number); return H * 60 + M; };
  const clasesHoy = (data.clases as Clase[])
    .filter((c) => idsHoy.has(c.materiaId) && c.dia === diaHoy)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  const claseAhora = clasesHoy.find((c) => minActual >= aMin(c.inicio) && minActual < aMin(c.fin));
  const proximaClase = claseAhora || clasesHoy.find((c) => aMin(c.inicio) > minActual);
  const entregasHoy = (data.notas as Nota[]).filter((n) => idsHoy.has(n.materiaId) && n.fecha && diasHasta(n.fecha) === 0);
  const nomMat = (id: string) => mats.find((m) => m.id === id)?.nombre ?? "—";

  const stat = (label: string, value: string, sub: string, cls = "") => (
    <div className={"rounded-2xl border p-4 " + t.card}>
      <div className={"text-[10px] uppercase font-bold tracking-wide " + t.faint}>{label}</div>
      <div className={"text-2xl font-extrabold mt-1 " + cls}>{value}</div>
      <div className={"text-xs mt-0.5 " + t.sub}>{sub}</div>
    </div>
  );

  return (
    <div className="space-y-5">
      <BarraSemestre cfg={cfg} t={t} refresh={refresh} data={data} />

      {/* --- Vista HOY: agenda completa del día --- */}
      <Fade k="hoy">
        <div className={cardBase + " " + t.card}>
          <h2 className={"font-bold mb-3 " + t.text}>
            📍 Hoy <span className={"text-xs font-medium " + t.faint}>{DIAS[diaHoy]} · {new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long" })}</span>
          </h2>
          {clasesHoy.length === 0 && entregasHoy.length === 0 && (
            <p className={"text-sm " + t.sub}>🎉 Hoy no tienes clases ni entregas. ¡Descansa!</p>
          )}
          <div className="space-y-4">
            {clasesHoy.length > 0 && (
              <div>
                <h3 className={"text-xs font-bold uppercase tracking-wide mb-2 " + t.faint}>🕒 Clases de hoy ({clasesHoy.length})</h3>
                <div className="space-y-1.5">
                  {clasesHoy.map((c) => {
                    const m = mats.find((x) => x.id === c.materiaId);
                    const zoom = (data.recursos as Recurso[]).find((r) => r.materiaId === c.materiaId && r.url && /zoom\.us\//i.test(r.url));
                    const esAhora = claseAhora?.id === c.id;
                    return (
                      <div key={c.id} className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-sm " + (esAhora ? t.warnBg : t.groupCard)}
                        style={{ borderLeft: `4px solid ${m?.color ?? "#64748b"}` }}>
                        <span className="font-bold">{c.inicio}–{c.fin}</span>
                        <span className={"font-semibold " + t.text}>{m?.nombre ?? "—"}</span>
                        {c.salon && <span className={t.faint}>· 🚪 {c.salon}</span>}
                        {esAhora && <span className="text-xs font-bold">🔴 AHORA</span>}
                        {zoom && (
                          <button onClick={() => abrirZoom(zoom.url)} title="Abrir Zoom en la app"
                            className="ml-auto text-indigo-500 hover:text-indigo-300 font-bold">🎥 Unirse</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {(entregasHoy.length > 0 || proximas.some((n) => diasHasta(n.fecha) === 1)) && (
              <div>
                <h3 className={"text-xs font-bold uppercase tracking-wide mb-2 " + t.faint}>📌 Entregas (hoy / mañana)</h3>
                <div className="space-y-1.5">
                  {entregasHoy.map((n) => {
                    const m = mats.find((x) => x.id === n.materiaId);
                    return (
                      <div key={n.id} className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-sm " + t.badBg}>
                        <span className="font-semibold">{m?.nombre ?? "—"}</span>
                        <span>· {n.nombre}</span>
                        <span className="ml-auto"><FechaBadge fecha={n.fecha} t={t} /></span>
                      </div>
                    );
                  })}
                  {proximas.filter((n) => diasHasta(n.fecha) === 1).map((n) => {
                    const m = mats.find((x) => x.id === n.materiaId);
                    return (
                      <div key={n.id} className={"flex items-center gap-2 rounded-xl border px-3 py-2 text-sm " + t.warnBg}>
                        <span className="font-semibold">{m?.nombre ?? "—"}</span>
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
      </Fade>

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

      {/* --- Gráfico de barras: promedio por materia y % evaluado --- */}
      <Fade k="grafica">
        <div className={cardBase + " " + t.card}>
          <h2 className={"font-bold mb-3 " + t.text}>📊 Promedio por materia</h2>
          <div className="space-y-3">
            {mats.map((m) => {
              const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
              const p = promedio(ns, m.id);
              const pesoEval = Math.min(100, ns.filter((n) => n.valor !== null).reduce((s, n) => s + n.porcentaje, 0));
              const color = p === null ? "#64748b" : p < cfg.nota_minima ? "#ef4444" : p < cfg.nota_ok ? "#f59e0b" : "#10b981";
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className={"font-medium truncate " + t.text}>{m.nombre}</span>
                    <span className={"font-bold " + t.sub}>{p !== null ? p.toFixed(2) : "—"}</span>
                  </div>
                  <div className={"h-3 rounded-full overflow-hidden " + (cfg.dark ? "bg-slate-900" : "bg-slate-100")}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: (p !== null ? (p / 5) * 100 : 0) + "%", background: color }} />
                  </div>
                  <div className={"h-1.5 mt-1 rounded-full overflow-hidden " + (cfg.dark ? "bg-slate-900" : "bg-slate-100")}>
                    <div className="h-full rounded-full bg-indigo-400/70" style={{ width: pesoEval + "%" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className={"mt-3 text-[10px] " + t.faint}>
            Barra gruesa: promedio (0–5; rojo/ámbar/verde según la nota mínima y la nota "ok"). Barra fina: % del peso ya evaluado.
          </p>
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
