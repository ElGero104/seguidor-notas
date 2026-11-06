// Tab estadisticas.tsx
// ==================== PESTAÑA ESTADÍSTICAS (GRÁFICOS SVG) ====================

import { Materia, Nota, Config } from "../types";
import { promedio, promedioSemestre } from "../calculos";
import { cardBase, Fade } from "../tema";

/**
 * Panel de estadísticas visuales con gráficos SVG puros (sin dependencias):
 * - Evolución de notas por materia (línea temporal)
 * - Distribución de créditos (gráfico de dona)
 * - Comparación de promedio entre semestres (barras)
 * - Histograma de notas obtenidas
 */
export default function TabEstadisticas({ data, t }: any) {
  const cfg: Config = data.config[0];
  const mats = data.materias as Materia[];
  const notas = data.notas as Nota[];
  const semestres: string[] = cfg.semestres || [];

  // ---- 1. Evolución de notas por materia (línea temporal ordenada por fecha) ----
  const matsActivas = mats.filter((m) => (m.semestre || "Sin semestre") === cfg.activo);
  const evolucion = matsActivas.map((m) => {
    const ns = notas
      .filter((n) => n.materiaId === m.id && n.valor !== null && n.fecha)
      .sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1));
    return { m, puntos: ns.map((n) => ({ fecha: n.fecha!, valor: n.valor as number, nombre: n.nombre })) };
  }).filter((e) => e.puntos.length >= 2);

  // ---- 2. Distribución de créditos (dona) ----
  const totalCreditos = matsActivas.reduce((s, m) => s + m.creditos, 0);
  const creditosData = matsActivas.map((m) => ({
    nombre: m.nombre, creditos: m.creditos, color: m.color, pct: totalCreditos ? (m.creditos / totalCreditos) * 100 : 0,
  }));

  // ---- 3. Comparación de promedio entre semestres (barras) ----
  const semestresData = semestres.map((s) => ({
    nombre: s,
    prom: promedioSemestre(data, s),
    activo: s === cfg.activo,
  })).filter((s) => s.prom !== null);

  // ---- 4. Histograma de notas obtenidas (rangos 0-1, 1-2, 2-3, 3-4, 4-5) ----
  const rangos = [
    { label: "0–1", min: 0, max: 1, count: 0, color: "#ef4444" },
    { label: "1–2", min: 1, max: 2, count: 0, color: "#f97316" },
    { label: "2–3", min: 2, max: 3, count: 0, color: "#f59e0b" },
    { label: "3–4", min: 3, max: 4, count: 0, color: "#84cc16" },
    { label: "4–5", min: 4, max: 5.01, count: 0, color: "#10b981" },
  ];
  notas.forEach((n) => {
    if (n.valor === null) return;
    const r = rangos.find((r) => n.valor! >= r.min && n.valor! < r.max);
    if (r) r.count++;
  });
  const maxCount = Math.max(1, ...rangos.map((r) => r.count));

  // Promedio general del semestre activo
  const promGeneral = promedioSemestre(data, cfg.activo);

  return (
    <div className="space-y-5">
      {/* --- Header con promedio general --- */}
      {promGeneral !== null && (
        <Fade k="hero">
          <div className={"rounded-3xl p-6 text-center text-white shadow-lg bg-gradient-to-br " + t.hero}>
            <div className="text-5xl font-extrabold mb-1">{promGeneral.toFixed(2)}</div>
            <div className="text-sm text-white/80">Promedio ponderado · {cfg.activo || "Semestre activo"}</div>
          </div>
        </Fade>
      )}

      {/* --- 1. Evolución de notas (línea) --- */}
      {evolucion.length > 0 && (
        <Fade k="evolucion">
          <div className={cardBase + " " + t.card}>
            <h2 className={"font-bold mb-1 " + t.text}>📈 Evolución de notas</h2>
            <p className={"text-xs mb-4 " + t.faint}>Tendencia de calificaciones ordenadas por fecha de entrega</p>
            <div className="space-y-4">
              {evolucion.map((e) => (
                <GraficoLinea key={e.m.id} materia={e.m} puntos={e.puntos} t={t} cfg={cfg} />
              ))}
            </div>
          </div>
        </Fade>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* --- 2. Distribución de créditos (dona) --- */}
        {creditosData.length > 0 && (
          <Fade k="creditos">
            <div className={cardBase + " " + t.card}>
              <h2 className={"font-bold mb-1 " + t.text}>🥧 Distribución de créditos</h2>
              <p className={"text-xs mb-4 " + t.faint}>{totalCreditos} créditos en {cfg.activo}</p>
              <GraficoDona datos={creditosData} t={t} />
            </div>
          </Fade>
        )}

        {/* --- 4. Histograma de notas --- */}
        {rangos.some((r) => r.count > 0) && (
          <Fade k="histograma">
            <div className={cardBase + " " + t.card}>
              <h2 className={"font-bold mb-1 " + t.text}>📊 Histograma de notas</h2>
              <p className={"text-xs mb-4 " + t.faint}>Frecuencia de calificaciones obtenidas</p>
              <div className="flex items-end gap-2 h-40">
                {rangos.map((r) => (
                  <div key={r.label} className="flex-1 flex flex-col items-center gap-1">
                    <div className={"text-xs font-bold " + t.text}>{r.count}</div>
                    <div
                      className="w-full rounded-t-lg transition-all duration-500"
                      style={{
                        height: `${(r.count / maxCount) * 100}%`,
                        minHeight: r.count > 0 ? "8px" : "2px",
                        backgroundColor: r.color,
                        opacity: 0.85,
                      }}
                    />
                    <div className={"text-[10px] " + t.faint}>{r.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Fade>
        )}
      </div>

      {/* --- 3. Comparación entre semestres (barras) --- */}
      {semestresData.length > 1 && (
        <Fade k="semestres">
          <div className={cardBase + " " + t.card}>
            <h2 className={"font-bold mb-1 " + t.text}>⚖️ Comparación entre semestres</h2>
            <p className={"text-xs mb-4 " + t.faint}>Promedio ponderado por créditos en cada semestre</p>
            <div className="space-y-3">
              {semestresData.map((s) => {
                const pct = s.prom! / 5 * 100;
                return (
                  <div key={s.nombre}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={"font-semibold " + (s.activo ? t.text : t.sub)}>
                        {s.nombre} {s.activo && "●"}
                      </span>
                      <span className={"font-bold " + t.text}>{s.prom!.toFixed(2)}</span>
                    </div>
                    <div className={"h-3 rounded-full overflow-hidden " + t.group}>
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${s.activo ? "bg-gradient-to-r from-indigo-500 to-violet-500" : "bg-slate-400/60"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Fade>
      )}

      {/* --- Estado vacío --- */}
      {matsActivas.length === 0 && (
        <Fade k="vacio">
          <div className={"rounded-3xl border-2 border-dashed p-10 text-center " + t.card}>
            <div className="text-5xl mb-3">📊</div>
            <h2 className={"text-xl font-bold " + t.text}>Sin datos para graficar</h2>
            <p className={"text-sm mt-2 " + t.sub}>Agrega materias y notas con fecha para ver tus estadísticas.</p>
          </div>
        </Fade>
      )}
    </div>
  );
}

// ==================== COMPONENTES DE GRÁFICOS SVG ====================

/** Gráfico de línea: evolución de notas de una materia a lo largo del tiempo. */
function GraficoLinea({ materia, puntos, t, cfg }: any) {
  const W = 320, H = 120, PAD = 8;
  const valores = puntos.map((p: any) => p.valor);
  const min = 0, max = 5;
  const x = (i: number) => PAD + (i / Math.max(1, puntos.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const path = puntos.map((p: any, i: number) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.valor)}`).join(" ");
  const areaPath = `${path} L${x(puntos.length - 1)},${H - PAD} L${x(0)},${H - PAD} Z`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: materia.color }} />
        <span className={"text-sm font-semibold " + t.text}>{materia.nombre}</span>
        <span className={"text-xs ml-auto " + t.faint}>{puntos.length} nota{puntos.length > 1 ? "s" : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
        {/* Línea de nota mínima */}
        <line x1={PAD} x2={W - PAD} y1={y(cfg.nota_minima)} y2={y(cfg.nota_minima)}
          stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
        <text x={W - PAD} y={y(cfg.nota_minima) - 3} fontSize="7" fill="#ef4444" textAnchor="end" opacity="0.7">
          mín {cfg.nota_minima}
        </text>
        {/* Área bajo la curva */}
        <path d={areaPath} fill={materia.color} opacity="0.12" />
        {/* Línea principal */}
        <path d={path} fill="none" stroke={materia.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Puntos */}
        {puntos.map((p: any, i: number) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.valor)} r="4" fill={materia.color} stroke="#fff" strokeWidth="1.5" />
            <text x={x(i)} y={y(p.valor) - 7} fontSize="7" fill={t.text === "text-slate-100" ? "#e2e8f0" : "#334155"} textAnchor="middle" fontWeight="bold">
              {p.valor.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Gráfico de dona: distribución proporcional de créditos por materia. */
function GraficoDona({ datos, t }: any) {
  const size = 160, stroke = 28;
  const r = (size - stroke) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.group.includes("bg-white") ? "#e2e8f0" : "rgba(255,255,255,0.1)"} strokeWidth={stroke} />
        {datos.map((d: any) => {
          const len = (d.pct / 100) * circ;
          const el = (
            <circle key={d.nombre} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth={stroke}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              style={{ transition: "stroke-dasharray 0.5s, stroke-dashoffset 0.5s" }} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="space-y-1.5 flex-1 min-w-0">
        {datos.map((d: any) => (
          <div key={d.nombre} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className={"truncate " + t.sub}>{d.nombre}</span>
            <span className={"ml-auto font-bold " + t.text}>{d.creditos} cr</span>
          </div>
        ))}
      </div>
    </div>
  );
}
