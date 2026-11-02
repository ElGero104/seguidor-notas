import { useState, useEffect } from "react";
export const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
import { Config } from "./types";

// ==================== TEMA (DARK MODE) ====================
/** Tokens de clases Tailwind según el tema: la app pasa `t` a todos los componentes. */
export function tokens(dark: boolean) {
  return {
    page: dark
      ? "bg-[#0b1020] bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(99,102,241,0.18),transparent),radial-gradient(900px_500px_at_-10%_20%,rgba(217,70,239,0.12),transparent)]"
      : "bg-[#f4f6fb] bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(99,102,241,0.12),transparent),radial-gradient(900px_500px_at_-10%_20%,rgba(56,189,248,0.10),transparent)]",
    card: dark
      ? "bg-white/[0.04] border-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
      : "bg-white/80 border-slate-200/80 backdrop-blur-xl shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
    text: dark ? "text-slate-100" : "text-slate-800",
    sub: dark ? "text-slate-400" : "text-slate-500",
    faint: dark ? "text-slate-500" : "text-slate-400",
    input: dark
      ? "bg-white/[0.06] border-white/10 text-slate-100 placeholder-slate-500 focus:border-indigo-400/60"
      : "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400",
    softBtn: dark
      ? "bg-indigo-400/15 text-indigo-300 hover:bg-indigo-400/25 border border-indigo-400/20"
      : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100",
    nav: dark ? "bg-[#0b1020]/80 border-white/10 backdrop-blur-xl" : "bg-white/80 border-slate-200/80 backdrop-blur-xl",
    navIn: dark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100",
    group: dark ? "bg-white/[0.03] border-white/10" : "bg-slate-50/80 border-slate-200/70",
    groupCard: dark ? "bg-white/[0.05] border-white/10" : "bg-white border-slate-100",
    ok: dark ? "text-emerald-400" : "text-emerald-600",
    okBg: dark ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200",
    badBg: dark ? "bg-red-400/15 text-red-300 border border-red-400/20" : "bg-red-50 text-red-700 border border-red-200",
    warnBg: dark ? "bg-amber-400/15 text-amber-300 border border-amber-400/20" : "bg-amber-50 text-amber-700 border border-amber-200",
    grad: dark ? "from-indigo-400 via-violet-400 to-fuchsia-400" : "from-indigo-600 via-violet-600 to-fuchsia-600",
    h2: dark ? "text-slate-100 border-indigo-400/30" : "text-slate-800 border-indigo-200",
    ring: dark ? "ring-2 ring-indigo-400/70" : "ring-2 ring-indigo-500/60",
    hero: dark ? "from-[#312e81] via-[#5b21b6] to-[#831843]" : "from-indigo-600 via-violet-600 to-fuchsia-600",
    heroCard: "bg-white/10 backdrop-blur-md border border-white/20 shadow-inner",
    navMob: dark ? "bg-[#0b1020]/90 border-white/10 backdrop-blur-xl" : "bg-white/90 border-slate-200/80 backdrop-blur-xl",
  };
}

/** Color por estado según rangos de la config: <mínima rojo, <ok ámbar, >=ok verde. */
export function estadoTxt(v: number, cfg: Config, t: any) {
  if (v < cfg.nota_minima) return "text-red-500 font-semibold";
  if (v < cfg.nota_ok) return "text-amber-500 font-semibold";
  return t.ok + " font-semibold";
}
export function estadoBg(v: number, cfg: Config, t: any) {
  if (v < cfg.nota_minima) return t.badBg;
  if (v < cfg.nota_ok) return t.warnBg;
  return t.okBg;
}

// Clases base compartidas
export const cardBase = "rounded-3xl border p-5 sm:p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.12)]";
export const inputBase = "w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition";
export const labelBase = "block text-[11px] font-bold mb-1.5 uppercase tracking-wider";

/** Botón con variantes primary / soft (adaptada al tema) / danger. */
export function Btn({ children, onClick, tone = "primary", t, className = "" }: any) {
  const tones = {
    primary: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 shadow-lg shadow-indigo-600/25 active:scale-[0.98]",
    soft: t.softBtn,
    danger: t ? "text-red-400 hover:bg-red-500/10" : "text-red-500 hover:bg-red-50",
  };
  return (
    <button onClick={onClick}
      className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97] ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

/** Badge de fecha de entrega con urgencia por color. */
export function FechaBadge({ fecha, t }: any) {
  const d = diasHasta(fecha);
  if (d === null) return null;
  if (d < 0) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.badBg}`}>🔴 venció hace {-d} d</span>;
  if (d === 0) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.warnBg}`}>⏰ ¡vence hoy!</span>;
  if (d <= 7) return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.warnBg}`}>📌 en ${d} d</span>;
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.okBg}`}>📅 ${d} d</span>;
}

/**
 * Animación de entrada (fade + deslizamiento) implementada con CSS puro:
 * portátil al canvas y a la web standalone, sin dependencias externas.
 * Cambiar `k` (ej. la pestaña activa) reinicia la animación.
 */
export function Fade({ children, k }: any) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    const id = setTimeout(() => setOn(true), 10); // re-dispara la transición
    return () => clearTimeout(id);
  }, [k]);
  return (
    <div style={{
      opacity: on ? 1 : 0,
      transform: on ? "none" : "translateY(14px) scale(0.99)",
      transition: "opacity 0.35s cubic-bezier(0.22,1,0.36,1), transform 0.35s cubic-bezier(0.22,1,0.36,1)",
    }}>
      {children}
    </div>
  );
}
