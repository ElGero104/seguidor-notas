import { Materia, Clase, Config } from "./types";
import { getSb } from "./db";
import { promedio } from "./calculos";
import { Fade } from "./tema";
import { useState, useEffect } from "react";
import { useDB } from "./db";
import { tokens } from "./tema";
import { MiniDB, pullCloud, respaldoAutoNube } from "./db";
import { UndoToast } from "./undo";
import { subscribeToPush, unsubscribeFromPush } from "./push";
import LoginInline from "./login";
import TabDashboard from "./tabs/inicio";
import TabMaterias from "./tabs/materias";
import TabNotas from "./tabs/notas";
import TabSimulador from "./tabs/simulador";
import TabHorarios from "./tabs/horarios";
import TabCalendario from "./tabs/calendario";
import TabPomodoro from "./tabs/pomodoro";
import TabExamen from "./tabs/examen";
import { exportarJSON, restaurarJSON } from "./exportar";

// ==================== APP PRINCIPAL ====================

/**
 * Componente raíz: encabezado hero con degradado y estadísticas, pestañas
 * (superior en escritorio, inferior fija en móvil) y animación por pestaña.
 */
export default function App() {
  const { data, refresh } = useDB();
  const [tab, setTab] = useState<"inicio" | "materias" | "notas" | "simulador" | "horarios" | "calendario" | "pomodoro" | "examen">("inicio");
  const [sesion, setSesion] = useState<any>(null);
  const [authListo, setAuthListo] = useState(false);

  useEffect(() => {
    // Render inmediato: la app se muestra apenas hay sesión; los datos llegan async
    getSb().auth.getSession().then(async ({ data }: any) => {
      setSesion(data.session);
      setAuthListo(true);
      if (data.session) {
        pullCloud().then(async () => {
          // Respaldo automático en la nube (máx. 1/semana vía título por semana ISO)
          respaldoAutoNube();
          refresh();
        });
      }
    });
    const { data: sub } = getSb().auth.onAuthStateChange((_evt: any, s: any) => {
      setSesion(s);
      if (s) { pullCloud().then(() => { respaldoAutoNube(); refresh(); }); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Instalar como app (PWA): el navegador ofrece "beforeinstallprompt"
  // cuando todo está listo; hasta entonces el botón 📲 permanece oculto.
  const [evtInstalar, setEvtInstalar] = useState<any>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvtInstalar(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => { window.removeEventListener("beforeinstallprompt", h); };
  }, []);
  const instalarApp = () => {
    if (!evtInstalar) return;
    evtInstalar.prompt();
    setEvtInstalar(null);
  };

  const cfg: Config = data.config[0];
  const t = tokens(!!cfg.dark);

  const toggleDark = () => { MiniDB.saveConfig({ dark: !cfg.dark }); refresh(); };

  const [pushOn, setPushOn] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setPushOn(!!s));
    }
  }, []);
  const togglePush = async () => {
    const ok = pushOn ? (await unsubscribeFromPush(), false) : await subscribeToPush();
    setPushOn(ok);
  };

  const tabs = [
    { id: "inicio", icon: "🏠", label: "Inicio" },
    { id: "materias", icon: "📚", label: "Materias" },
    { id: "notas", icon: "📝", label: "Notas" },
    { id: "simulador", icon: "🎯", label: "Simulador" },
    { id: "horarios", icon: "🗓️", label: "Horarios" },
    { id: "calendario", icon: "📅", label: "Calendario" },
    { id: "pomodoro", icon: "⏱️", label: "Pomodoro" },
    { id: "examen", icon: "📝", label: "Examen" },
  ] as const;

  // Semestres registrados + selector del semestre activo (único visible)
  const semestres: string[] = cfg.semestres || [];
  const cambiarSemestre = (val: string) => {
    if (val === "__nuevo") {
      const nombre = prompt("📝 Nombre del nuevo semestre (ej: 2027-1):", "");
      if (nombre && nombre.trim()) {
        const n = nombre.trim();
        const inicio = prompt("📅 Fecha de inicio del semestre (AAAA-MM-DD):", "");
        const fin = prompt("📅 Fecha de fin del semestre (AAAA-MM-DD):", "");
        const valFechas = (s: string | null) =>
          s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "";
        MiniDB.saveConfig({
          semestres: semestres.includes(n) ? semestres : [...semestres, n],
          activo: n,
          fechasSemestre: {
            ...(cfg.fechasSemestre || {}),
            [n]: { inicio: valFechas(inicio), fin: valFechas(fin) },
          },
        });
        refresh();
      }
      return;
    }
    MiniDB.saveConfig({ activo: val });
    refresh();
  };

  // Estadísticas del encabezado: solo el semestre activo
  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo);
  let suma = 0, peso = 0;
  mats.forEach((m) => {
    const p = promedio(data.notas, m.id);
    if (p !== null) { suma += p * m.creditos; peso += m.creditos; }
  });
  const promGeneral = peso ? suma / peso : null;

  // Próxima clase del semestre activo (para el hero)
  const ahoraH = new Date();
  const diaHoyH = (ahoraH.getDay() + 6) % 7;
  const minHoyH = ahoraH.getHours() * 60 + ahoraH.getMinutes();
  const aMinH = (h: string) => { const [H, M] = h.split(":").map(Number); return H * 60 + (M || 0); };
  const idsActH = new Set(mats.map((m) => m.id));
  const clasesHoyH = (data.clases as Clase[])
    .filter((c) => idsActH.has(c.materiaId) && c.dia === diaHoyH)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  const claseAhoraH = clasesHoyH.find((c) => minHoyH >= aMinH(c.inicio) && minHoyH < aMinH(c.fin));
  const proximaClaseH = claseAhoraH || clasesHoyH.find((c) => aMinH(c.inicio) > minHoyH) || null;
  const nomProxH = proximaClaseH ? (mats.find((m) => m.id === proximaClaseH.materiaId)?.nombre ?? "—") : null;

  if (!authListo) return null;
  if (!sesion) return <LoginInline t={tokens(false)} />;

  return (
    <div className={"min-h-screen " + t.page + " transition-colors" + (cfg.dark ? " dark" : "")}>
      <div className={"w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-24 md:pb-8 " + (tab === "calendario" ? "max-w-6xl" : "max-w-4xl")}>
        {/* --- Encabezado hero con degradado --- */}
        <header className={"relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] mb-6 p-5 sm:p-10 text-white shadow-2xl shadow-indigo-900/20 bg-gradient-to-br " + t.hero}>
          <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-12 w-64 h-64 rounded-full bg-fuchsia-300/20 blur-3xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/3 w-32 h-32 rounded-full bg-indigo-300/20 blur-2xl pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold">🎓 Seguidor de Notas</h1>
              <p className="text-sm text-white/80">Tu semestre de un vistazo: notas, simulador, horarios y calendario.</p>
              {proximaClaseH && nomProxH && (
                <div className={"mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold bg-white/15 border border-white/25 backdrop-blur "}>
                  {claseAhoraH ? "🔴 En clase ahora" : "⏭️ Próxima clase"}: {nomProxH} · {proximaClaseH.inicio}–{proximaClaseH.fin}
                  {proximaClaseH.salon ? ` · ${proximaClaseH.salon}` : ""}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 sm:justify-end">
              <button onClick={exportarJSON}
                className="text-lg sm:text-xl rounded-xl px-2.5 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition"
                title="Descargar respaldo completo (.json): materias, notas, horarios y todos los semestres">
                💾
              </button>
              <label
                className="text-lg sm:text-xl rounded-xl px-2.5 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition cursor-pointer"
                title="Restaurar un respaldo (.json): reemplaza los datos actuales">
                ♻️
                <input type="file" accept=".json,application/json" className="hidden"
                  onChange={(e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    e.target.value = "";
                    if (f) restaurarJSON(f);
                  }} />
              </label>
              <button onClick={togglePush}
                className="text-lg sm:text-xl rounded-xl px-2.5 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition"
                title={pushOn ? "Desactivar notificaciones push" : "Activar notificaciones push (aviso 1 día antes de cada entrega)"}>
                {pushOn ? "🔔" : "🔕"}
              </button>
              <button onClick={() => getSb().auth.signOut()}
                className="text-lg sm:text-xl rounded-xl px-2.5 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition"
                title="Cerrar sesión">
                🚪
              </button>
              {evtInstalar && (
                <button onClick={instalarApp}
                  className="text-lg sm:text-xl rounded-xl px-2.5 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition"
                  title="Instalar como aplicación en este dispositivo">
                  📲
                </button>
              )}
              <button onClick={toggleDark}
                className="text-xl sm:text-2xl rounded-xl px-2.5 py-2 border border-white/25 bg-white/10 hover:bg-white/20 transition"
                title={cfg.dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}>
                {cfg.dark ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
          <div className="relative grid grid-cols-3 gap-3 sm:gap-4 mt-6">
            <div className={"rounded-2xl p-3 sm:p-4 transition-transform hover:scale-[1.03] " + t.heroCard}>
              <div className="text-[10px] uppercase font-bold text-white/70">Promedio</div>
              <div className="text-2xl sm:text-3xl font-extrabold">{promGeneral !== null ? promGeneral.toFixed(2) : "—"}</div>
            </div>
            <div className={"rounded-2xl p-3 sm:p-4 transition-transform hover:scale-[1.03] " + t.heroCard}>
              <div className="text-[10px] uppercase font-bold text-white/70">Materias</div>
              <div className="text-2xl sm:text-3xl font-extrabold">{mats.length}</div>
            </div>
            <div className={"rounded-2xl p-3 sm:p-4 transition-transform hover:scale-[1.03] " + t.heroCard}>
              <div className="text-[10px] uppercase font-bold text-white/70">Créditos</div>
              <div className="text-2xl sm:text-3xl font-extrabold">{mats.reduce((s, m) => s + m.creditos, 0)}</div>
            </div>
          </div>
          {/* --- Selector de semestre activo --- */}
          <div className="relative flex flex-wrap items-center gap-2 mt-4">
            <span className="text-[10px] uppercase font-bold text-white/70">Semestre activo</span>
            <select value={cfg.activo} onChange={(e) => cambiarSemestre(e.target.value)}
              className="rounded-xl px-3 py-1.5 text-sm font-semibold bg-white/15 border border-white/25 text-white backdrop-blur focus:outline-none">
              {semestres.length === 0 && <option value="">— sin semestres —</option>}
              {semestres.map((s) => (
                <option key={s} value={s} className="text-slate-800">
                  {s + ((cfg.archivados || []).includes(s) ? " (archivado)" : "")}
                </option>
              ))}
              <option value="__nuevo" className="text-slate-800">➕ Añadir semestre…</option>
            </select>
          </div>
        </header>

        {/* --- Navegación superior (solo escritorio) --- */}
        <nav className={"hidden md:flex flex-wrap gap-1.5 mb-6 rounded-2xl p-1.5 border shadow-lg w-fit mx-auto " + t.nav}>
          {tabs.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={"px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-95 " +
                (tab === x.id
                  ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/30"
                  : t.navIn)}>
              {x.icon} {x.label}
            </button>
          ))}
        </nav>

        {/* Animación de entrada al cambiar de pestaña */}
        <Fade k={tab}>
          {tab === "inicio" && <TabDashboard data={data} refresh={refresh} t={t} goTab={setTab} />}
          {tab === "materias" && <TabMaterias data={data} refresh={refresh} t={t} />}
          {tab === "notas" && <TabNotas data={data} refresh={refresh} t={t} />}
          {tab === "simulador" && <TabSimulador data={data} refresh={refresh} t={t} />}
          {tab === "horarios" && <TabHorarios data={data} refresh={refresh} t={t} />}
          {tab === "calendario" && <TabCalendario data={data} t={t} />}
          {tab === "pomodoro" && <TabPomodoro data={data} t={t} />}
          {tab === "examen" && <TabExamen data={data} t={t} />}
        </Fade>

        <footer className={"mt-8 text-center text-xs " + t.faint}>
          🗄️ Tus datos se guardan en este navegador · respáldalos con 💾 desde el encabezado.
          <br />📲 Llévala a tu celular: menú del navegador → «Añadir a pantalla de inicio».
        </footer>
      </div>

      {/* --- Navegación inferior fija (solo móvil) --- */}
      <nav className={"fixed bottom-0 inset-x-0 z-50 md:hidden border-t backdrop-blur " + t.navMob}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid grid-cols-8 w-full max-w-4xl mx-auto">
          {tabs.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={"flex flex-col items-center gap-0.5 py-2 sm:py-2.5 text-[8px] sm:text-[9px] font-semibold transition-all duration-200 active:scale-90 " +
                (tab === x.id ? "text-indigo-500 -translate-y-0.5" : t.sub)}>
              <span className={"text-lg sm:text-xl leading-none transition-transform " + (tab === x.id ? "scale-110" : "")}>{x.icon}</span>
              <span className="truncate max-w-full px-0.5">{x.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* --- Aviso flotante global de "Deshacer" --- */}
      <UndoToast t={t} />
    </div>
  );
}
