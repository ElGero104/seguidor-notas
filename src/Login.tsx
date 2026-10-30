import React, { useState } from "react";
import { supabase } from "./supabaseClient";

type Props = {
  onSuccess: () => void;
  t: any;
};

const EMAIL_DOMAIN = "@udea.edu.co";
const aEmail = (usuario: string) =>
  usuario.includes("@") ? usuario : usuario.trim() + EMAIL_DOMAIN;

export default function Login({ onSuccess, t }: Props) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      if (modo === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: aEmail(usuario), password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email: aEmail(usuario), password });
        if (error) throw error;
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message === "Invalid login credentials"
        ? "Usuario o clave incorrectos."
        : err?.message || "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className={"min-h-screen flex items-center justify-center p-4 " + t.page}>
      <div className={"w-full max-w-sm rounded-3xl border shadow-lg p-8 " + t.card}>
        <h1 className="text-2xl font-extrabold text-center">🎓 Seguidor de Notas</h1>
        <p className="text-sm text-center mt-1 mb-6 opacity-70">
          {modo === "login" ? "Inicia sesión para continuar" : "Crea tu cuenta"}
        </p>
        <form onSubmit={enviar} className="space-y-4">
          <div>
            <label className={labelBase}>Usuario</label>
            <input
              type="text"
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="geronimo.patino"
              autoComplete="username"
              className={inputBase}
            />
          </div>
          <div>
            <label className={labelBase}>Clave</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className={inputBase}
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={cargando}
            className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60"
          >
            {cargando ? "Cargando…" : modo === "login" ? "Entrar" : "Registrarme"}
          </button>
        </form>
        <button
          onClick={() => { setModo(modo === "login" ? "registro" : "login"); setError(null); }}
          className="w-full mt-4 text-sm underline opacity-70 hover:opacity-100"
        >
          {modo === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}

const inputBase = "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";
const labelBase = "block text-xs font-semibold mb-1 uppercase tracking-wide";
