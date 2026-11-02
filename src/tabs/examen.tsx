// Tab examen.tsx
// ==================== MODO EXAMEN ====================

import { Materia, Nota } from "../types";
import { cardBase } from "../tema";
import { diasHasta } from "../calculos";
export default function TabExamen({ data, t }: any) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const idsMat = new Set((data.materias as Materia[]).map((m) => m.id));
  const entregas = (data.notas as Nota[])
    .filter((n) => n.fecha && idsMat.has(n.materiaId))
    .map((n) => ({ ...n, dias: diasHasta(n.fecha) }))
    .filter((n) => n.dias !== null && n.dias >= 0 && n.dias <= 7)
    .sort((a, b) => (a.dias! - b.dias!));

  return (
    <div className="space-y-4">
      <div className={"rounded-3xl p-6 text-center text-white shadow-lg bg-gradient-to-br " + t.hero}>
        <div className="text-4xl mb-1">📝</div>
        <h1 className="text-2xl font-extrabold">Modo examen</h1>
        <p className="text-sm text-white/80">Entregas de los próximos 7 días · {entregas.length} pendiente{entregas.length === 1 ? "" : "s"}</p>
      </div>
      {entregas.length === 0 && (
        <div className={cardBase + " " + t.card + " text-center " + t.sub}>
          🎉 Sin entregas en los próximos 7 días. ¡Aprovecha para adelantar!
        </div>
      )}
      {entregas.map((n) => {
        const m = (data.materias as Materia[]).find((x) => x.id === n.materiaId);
        return (
          <div key={n.id} className={cardBase + " " + t.card + " flex items-center gap-4"}
            style={{ borderLeft: `6px solid ${m?.color ?? "#6366f1"}` }}>
            <div className="text-center min-w-[64px]">
              <div className="text-3xl font-extrabold">{n.dias === 0 ? "HOY" : `en ${n.dias} d`}</div>
              <div className={"text-xs " + t.faint}>{n.fecha}</div>
            </div>
            <div className="flex-1">
              <div className={"text-lg font-bold " + t.text}>{n.nombre}</div>
              <div className={"text-sm " + t.sub}>{m?.nombre ?? "—"} · {n.porcentaje}% de la nota final</div>
            </div>
            <div className="text-2xl">{n.valor === null ? "⏳" : "✅"}</div>
          </div>
        );
      })}
    </div>
  );
}
