import { useState, useEffect } from "react";
export const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];
export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
import { Config } from "./types";
import { diasHasta } from "./calculos";

// ==================== PALETA DE COLOR PRINCIPAL ====================
// El usuario elige un color; se mapea a clases Tailwind equivalentes.
export const PALETA_APP: { hex: string; nombre: string; grad: string; gradBtn: string; soft: string; softDark: string; ring: string }[] = [
  { hex: "#6366f1", nombre: "Índigo",  grad: "from-indigo-600 via-violet-600 to-fuchsia-600",  gradBtn: "from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-600/25",  soft: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-100",  softDark: "bg-indigo-400/15 text-indigo-300 hover:bg-indigo-400/25 border-indigo-400/20",  ring: "ring-indigo-500/60" },
  { hex: "#10b981", nombre: "Esmeralda", grad: "from-emerald-600 via-teal-600 to-cyan-600",      gradBtn: "from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25", soft: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100", softDark: "bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25 border-emerald-400/20", ring: "ring-emerald-500/60" },
  { hex: "#ec4899", nombre: "Rosa",    grad: "from-pink-600 via-rose-600 to-red-500",          gradBtn: "from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-600/25",       soft: "bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-100",       softDark: "bg-pink-400/15 text-pink-300 hover:bg-pink-400/25 border-pink-400/20",       ring: "ring-pink-500/60" },
  { hex: "#f59e0b", nombre: "Ámbar",   grad: "from-amber-500 via-orange-600 to-red-500",       gradBtn: "from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-orange-600/25", soft: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100",   softDark: "bg-amber-400/15 text-amber-300 hover:bg-amber-400/25 border-amber-400/20",   ring: "ring-amber-500/60" },
  { hex: "#06b6d4", nombre: "Cian",    grad: "from-cyan-600 via-sky-600 to-blue-600",          gradBtn: "from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 shadow-cyan-600/25",          soft: "bg-cyan-50 text-cyan-700 hover:bg-cyan-100 border-cyan-100",       softDark: "bg-cyan-400/15 text-cyan-300 hover:bg-cyan-400/25 border-cyan-400/20",       ring: "ring-cyan-500/60" },
  { hex: "#8b5cf6", nombre: "Violeta", grad: "from-violet-600 via-purple-600 to-fuchsia-600", gradBtn: "from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 shadow-violet-600/25", soft: "bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-100", softDark: "bg-violet-400/15 text-violet-300 hover:bg-violet-400/25 border-violet-400/20", ring: "ring-violet-500/60" },
];
export function paletaDe(hex: string, dark: boolean) {
  const p = PALETA_APP.find((x) => x.hex === hex) || PALETA_APP[0];
  return { ...p, softBtn: dark ? p.softDark : p.soft };
}


// ==================== TEMA (DARK MODE) ====================
/** Tokens de clases Tailwind según el tema: la app pasa `t` a todos los componentes. */
export function tokens(dark: boolean, colorApp?: string) {
  const pal = paletaDe(colorApp || "#6366f1", dark);
  return {
    page: dark
      ? "bg-[#0b1020] bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(99,102,241,0.18),transparent),radial-gradient(900px_500px_at_-10%_20%,rgba(217,70,239,0.12),transparent)]"
      : "bg-[#f4f6fb] bg-[radial-gradient(1200px_600px_at_80%_-10%,rgba(99,102,241,0.12),transparent),radial-gradient(900px_500px_at_-10%_20%,rgba(56,189,248,0.10),transparent)]",
    card: dark
      ? "bg-white/[0.04] border-white/10 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
      : "bg-white/80 border-slate-200/80 backdrop-blur-xl shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
    text: dark ? "text-slate-100" : "text-slate-800",
    sub: dark ? "text-slate-300" : "text-slate-500",
    faint: dark ? "text-slate-400" : "text-slate-400",
    input: dark
      ? "bg-white/[0.08] border-white/15 text-slate-100 placeholder-slate-400 focus:border-indigo-400/60"
      : "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400",
    softBtn: pal.softBtn + " border",
    nav: dark ? "bg-[#0b1020]/80 border-white/10 backdrop-blur-xl" : "bg-white/80 border-slate-200/80 backdrop-blur-xl",
    navIn: dark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100",
    group: dark ? "bg-white/[0.06] border-white/10 text-slate-200" : "bg-slate-50/80 border-slate-200/70",
    groupCard: dark ? "bg-white/[0.07] border-white/10 text-slate-200" : "bg-white border-slate-100",
    ok: dark ? "text-emerald-400" : "text-emerald-600",
    okBg: dark ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200",
    badBg: dark ? "bg-red-400/15 text-red-300 border border-red-400/20" : "bg-red-50 text-red-700 border border-red-200",
    warnBg: dark ? "bg-amber-400/15 text-amber-300 border border-amber-400/20" : "bg-amber-50 text-amber-700 border border-amber-200",
    grad: pal.grad,
    h2: dark ? "text-slate-100 border-indigo-400/30" : "text-slate-800 border-indigo-200",
    ring: "ring-2 " + pal.ring,
    hero: dark ? "from-[#312e81] via-[#5b21b6] to-[#831843]" : pal.grad,
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
