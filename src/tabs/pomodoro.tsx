// Tab pomodoro.tsx
// ==================== POMODORO ====================

const POM_KEY = "seguidor-notas-pomodoro";

export default function TabPomodoro({ data, t }: any) {
  const [segundos, setSegundos] = useState(25 * 60);
  const [corriendo, setCorriendo] = useState(false);
  const [fase, setFase] = useState<"trabajo" | "descanso">("trabajo");
  const [sesiones, setSesiones] = useState<number>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(POM_KEY) || "{}");
      return raw.hoy === new Date().toISOString().slice(0, 10) ? raw.count || 0 : 0;
    } catch { return 0; }
  });

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setSegundos((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [corriendo]);

  useEffect(() => {
    if (segundos === 0) {
      if (fase === "trabajo") {
        const count = sesiones + 1;
        setSesiones(count);
        localStorage.setItem(POM_KEY, JSON.stringify({ hoy: new Date().toISOString().slice(0, 10), count }));
        setFase("descanso");
        setSegundos(5 * 60);
      } else {
        setFase("trabajo");
        setSegundos(25 * 60);
      }
      setCorriendo(false);
    }
  }, [segundos, fase, sesiones]);

  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  const total = fase === "trabajo" ? 25 * 60 : 5 * 60;
  const pct = ((total - segundos) / total) * 100;

  // Entregas próximas (7 días) para estudiar "para el parcial de mañana"
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const idsMat = new Set((data.materias as Materia[]).map((m) => m.id));
  const proximas = (data.notas as Nota[])
    .filter((n) => n.fecha && idsMat.has(n.materiaId))
    .map((n) => ({ ...n, dias: diasHasta(n.fecha) }))
    .filter((n) => n.dias !== null && n.dias >= 0 && n.dias <= 7)
    .sort((a, b) => (a.dias! - b.dias!))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      <div className={cardBase + " " + t.card + " text-center"}>
        <h2 className={"font-bold mb-1 " + t.text}>⏱️ Pomodoro</h2>
        <div className={"text-xs mb-4 " + t.sub}>
          {fase === "trabajo" ? "🎯 Sesión de estudio (25 min)" : "☕ Descanso (5 min)"}
        </div>
        <div className="relative inline-flex items-center justify-center mb-4">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r="80" fill="none" strokeWidth="12" className={t.page.includes("slate-900") ? "stroke-slate-700" : "stroke-slate-200"} />
            <circle cx="90" cy="90" r="80" fill="none" strokeWidth="12" strokeLinecap="round"
              stroke="#6366f1" strokeDasharray={2 * Math.PI * 80} strokeDashoffset={2 * Math.PI * 80 * (1 - pct / 100)}
              transform="rotate(-90 90 90)" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div className="absolute text-4xl font-extrabold tabular-nums">
            {String(min).padStart(2, "0")}:{String(seg).padStart(2, "0")}
          </div>
        </div>
        <div className="flex justify-center gap-2">
          <Btn t={t} onClick={() => setCorriendo(!corriendo)}>{corriendo ? "⏸ Pausar" : "▶ Iniciar"}</Btn>
          <Btn t={t} tone="soft" onClick={() => { setCorriendo(false); setFase("trabajo"); setSegundos(25 * 60); }}>↺ Reiniciar</Btn>
        </div>
        <div className={"mt-4 text-sm " + t.sub}>
          🍅 Sesiones de estudio hoy: <strong className={t.text}>{sesiones}</strong>
        </div>
      </div>

      {proximas.length > 0 && (
        <div className={cardBase + " " + t.card}>
          <h2 className={"font-bold mb-3 " + t.text}>📌 Estudiar para… (próximos 7 días)</h2>
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
    </div>
  );
}
