import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (_req: Request) => {
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const hoy = new Date().toISOString().slice(0, 10);
    const mañana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const hace3 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10); // fecha objetivo hoy cuando aviso es -3d

    // 1) Entregas de mañana (aviso estándar -1d)
    const { data: notas, error } = await sb
      .from("notas")
      .select("id, nombre, fecha, user_id, materia_id, materias(nombre)")
      .eq("fecha", mañana);
    if (error) throw error;

    // 2) Avisos extra programados como eventos AVISO:<nota_id>:<-3d|0d>
    const { data: avisos, error: eErr } = await sb
      .from("eventos")
      .select("id, titulo, fecha, user_id")
      .eq("fecha", hoy)
      .ilike("titulo", "AVISO:%");
    if (eErr) throw eErr;

    const porUsuario: Record<string, { titulo: string; cuerpo: string }[]> = {};
    const push = (userId: string, titulo: string, cuerpo: string) => {
      (porUsuario[userId] = porUsuario[userId] || []).push({ titulo, cuerpo });
    };

    for (const n of notas || []) {
      push(n.user_id, `⏰ Entrega mañana (${mañana})`, `${(n.materias as any)?.nombre ?? "Materia"}: ${n.nombre}`);
    }
    for (const av of avisos || []) {
      const [, notaId, delta] = av.titulo.split(":");
      const { data: nota } = await sb.from("notas").select("nombre, materia_id, materias(nombre)").eq("id", notaId).single();
      if (!nota) continue;
      const mat = (nota as any).materias?.nombre ?? "Materia";
      if (delta === "-3d") push(av.user_id, `⏰ Entrega en 3 días`, `${mat}: ${(nota as any).nombre}`);
      else push(av.user_id, `🔔 Entrega HOY`, `${mat}: ${(nota as any).nombre}`);
    }

    const results: any[] = [];
    for (const [userId, lista] of Object.entries(porUsuario)) {
      for (const item of lista) {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ user_id: userId, title: item.titulo, body: item.cuerpo.slice(0, 180), url: "./" }),
        });
        results.push({ user_id: userId, status: resp.status, titulo: item.titulo });
      }
    }
    return new Response(JSON.stringify({ hoy, mañana, avisos: results.length, results }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
