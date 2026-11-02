// Tab simulador.tsx
// ==================== PESTAÑA SIMULADOR ====================

import { MiniDB } from "../db";
import { Materia, Nota, Config } from "../types";
import { promedio, calculo } from "../calculos";
import { cardBase, inputBase, Fade, estadoTxt } from "../tema.tsx";
/**
 * Simulador con objetivo configurable + panel "peso restante vs. riesgo":
 * prioriza materias por el margen entre su máximo alcanzable y la nota mínima.
 */
export default function TabSimulador({ data, refresh, t }: any) {
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
