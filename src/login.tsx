import { labelBase } from "./tema";
export const EMAIL_DOMAIN = "@udea.edu.co";
import { useState } from "react";
import { getSb } from "./db";
import { inputBase, Btn } from "./tema";

// ==================== LOGIN (Supabase Auth por usuario) ====================

/** Pantalla de acceso: pide usuario (ej: geronimo.patino) y clave. */
export default function LoginInline({ t }: any) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aEmail = (u: string) => (u.includes("@") ? u : u.trim() + EMAIL_DOMAIN);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const email = aEmail(usuario);
      const r = modo === "login"
        ? await getSb().auth.signInWithPassword({ email, password })
        : await getSb().auth.signUp({ email, password });
      if (r.error) throw r.error;
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
            <input type="text" required value={usuario} autoComplete="username"
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="geronimo.patino"
              className={inputBase} />
          </div>
          <div>
            <label className={labelBase}>Clave</label>
            <input type="password" required minLength={6} value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputBase} />
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <button type="submit" disabled={cargando}
            className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60">
            {cargando ? "Cargando…" : modo === "login" ? "Entrar" : "Registrarme"}
          </button>
        </form>
        <button
          onClick={() => { setModo(modo === "login" ? "registro" : "login"); setError(null); }}
          className="w-full mt-4 text-sm underline opacity-70 hover:opacity-100">
          {modo === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
