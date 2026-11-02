// Tab notas.tsx
// ==================== PESTAÑA NOTAS (ESTRUCTURA DE EVALUACIÓN) ====================

/**
 * Estructura de evaluación por materia. Las notas generadas nacen PENDIENTES
 * (valor null); cada fila pendiente muestra el mínimo requerido para ganar.
 */
export default function TabNotas({ data, refresh, t }: any) {
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const cfg: Config = data.config[0];

  /** Genera N notas con pesos iguales (la última absorbe el redondeo). */
  const generar = (m: Materia) => {
    const n = parseInt(cantidades[m.id] || "", 10);
    if (!n || n < 1 || n > 20) {
      alert("⚠️ Ingresa una cantidad de notas entre 1 y 20.");
      return;
    }
    const actuales = MiniDB.find<Nota>("notas", (x) => x.materiaId === m.id);
    if (actuales.length > 0 && !confirm(`¿Reemplazar las ${actuales.length} notas actuales de ${m.nombre}?`)) return;
    setUndo("♻️ Estructura de notas reemplazada");
    MiniDB.removeWhere("notas", (x) => x.materiaId === m.id);
    const peso = Math.floor((100 / n) * 10) / 10;
    for (let i = 1; i <= n; i++) {
      const pct = i === n ? +(100 - peso * (n - 1)).toFixed(1) : peso;
      MiniDB.insert<Nota>("notas", {
        id: uid(), materiaId: m.id, nombre: `Nota ${i}`, valor: null, porcentaje: pct, // nacen pendientes
      });
    }
    refresh();
  };

  /**
   * Sincroniza los avisos extra de una nota como eventos "AVISO:<nota_id>:<delta>"
   * en la tabla eventos (fecha = fecha de entrega - delta). Así notify-deadlines
   * los envía sin necesidad de columna nueva.
   */
  async function syncAvisosEventos(notaId: string) {
    try {
      const { data: s } = await getSb().auth.getSession();
      const uidUser = s?.session?.user?.id;
      if (!uidUser) return;
      const sb = getSb();
      const n = MiniDB.find<Nota>("notas", (x) => x.id === notaId)[0];
      if (!n || !n.fecha) return;
      // borrar avisos previos de esta nota
      const prev = (await sb.from("eventos").select("id,titulo").eq("user_id", uidUser).ilike("titulo", `AVISO:${notaId}:%`)).data || [];
      if (prev.length) await sb.from("eventos").delete().in("id", prev.map((p: any) => p.id));
      for (const a of n.avisos || []) {
        const delta = a === "-3d" ? 3 : 0;
        const f = new Date(n.fecha + "T12:00:00");
        f.setDate(f.getDate() - delta);
        await sb.from("eventos").insert({
          id: uid(), user_id: uidUser,
          titulo: `AVISO:${notaId}:${a}`,
          fecha: f.toISOString().slice(0, 10), hora: "08:00",
        });
      }
    } catch {}
  }

  /** UPDATE inline: nombre / peso / valor / fecha (vacío -> pendiente). */
  const editarNota = (id: string, campo: "nombre" | "porcentaje" | "valor" | "fecha", valor: string) => {
    const patch: any = {};
    if (campo === "nombre") patch.nombre = valor;
    if (campo === "porcentaje") patch.porcentaje = parseFloat(valor) || 0;
    if (campo === "valor") patch.valor = valor === "" ? null : parseFloat(valor) || 0;
    if (campo === "fecha") patch.fecha = valor || undefined;
    if (campo === "avisos") patch.avisos = JSON.parse(valor || "[]");
    MiniDB.update<Nota>("notas", id, patch);
    if (campo === "avisos" || campo === "fecha") syncAvisosEventos(id);
    refresh();
  };

  const activo = cfg.activo;
  const matsActivos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo);
  const sems = matsActivos.length ? [activo] : [];
  const [copiarDe, setCopiarDe] = useState<Record<string, string>>({});

  /** Copia la estructura (cantidad de notas y peso de cada una) de otra materia del mismo semestre. */
  const copiarEstructura = (m: Materia) => {
    const origenId = copiarDe[m.id];
    if (!origenId) return;
    const origen = matsActivos.find((x) => x.id === origenId);
    if (!origen) return;
    const notasOrigen = MiniDB.find<Nota>("notas", (x) => x.materiaId === origenId);
    if (notasOrigen.length === 0) return;
    const actuales = MiniDB.find<Nota>("notas", (x) => x.materiaId === m.id);
    if (actuales.length > 0 && !confirm(`¿Reemplazar las ${actuales.length} notas actuales de ${m.nombre} por la estructura de ${origen.nombre} (${notasOrigen.length} notas)?`)) return;
    setUndo("📋 Estructura copiada de " + origen.nombre);
    MiniDB.removeWhere("notas", (x) => x.materiaId === m.id);
    notasOrigen.forEach((n) => {
      MiniDB.insert<Nota>("notas", {
        id: uid(), materiaId: m.id, nombre: n.nombre, valor: null, porcentaje: n.porcentaje,
      });
    });
    setCopiarDe({ ...copiarDe, [m.id]: "" });
    refresh();
  };

  return (
    <div className="space-y-5">
      {matsActivos.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          No hay materias en el semestre activo ({activo || "sin semestre"}). Crea materias en la pestaña Materias.
        </div>
      )}

      {sems.map((sem) => {
        const psem = promedioSemestre(data, sem);
        return (
          <div key={sem} className="space-y-4">
            <div className={"flex items-center justify-between border-b-2 pb-1 " + t.h2}>
              <h2 className="text-lg font-bold">📁 {sem}</h2>
              {psem !== null && (
                <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(psem, cfg, t)}>
                  Prom. semestre: {psem.toFixed(2)}
                </span>
              )}
            </div>
            {(data.materias as Materia[])
              .filter((m) => (m.semestre || "Sin semestre") === sem)
              .map((m: Materia) => {
                const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
                const p = promedio(ns, m.id);
                const sumaPeso = ns.reduce((s, n) => s + n.porcentaje, 0);
                // Cálculo del mínimo para ganar la materia (respondido en la UI)
                const c = calculo(ns, cfg.nota_minima);
                const minPorNota = c.requerida; // mínimo uniforme en cada pendiente

                return (
                  <Fade key={m.id} k={m.id}>
                    <div className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div>
                          <div className={"font-bold " + t.text}>{m.nombre}</div>
                          <div className={"text-sm " + t.sub}>
                            {ns.length} nota{ns.length === 1 ? "" : "s"} · pesos: {sumaPeso}%
                            {ns.length > 0 && sumaPeso !== 100 && (
                              <span className="text-amber-500 font-semibold"> ⚠️ deben sumar 100%</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {p !== null && (
                            <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(p, cfg, t)}>
                              {p.toFixed(2)}
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <input className={inputBase + " w-20 " + t.input} type="number" min={1} max={20}
                              placeholder="Nº" value={cantidades[m.id] ?? ""}
                              onChange={(e) => setCantidades({ ...cantidades, [m.id]: e.target.value })} />
                            <Btn t={t} tone="soft" onClick={() => generar(m)}>Generar estructura</Btn>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              className={inputBase + " w-auto " + t.input}
                              value={copiarDe[m.id] ?? ""}
                              onChange={(e) => setCopiarDe({ ...copiarDe, [m.id]: e.target.value })}
                              title="Copiar la estructura de notas (cantidad y % de cada una) de otra materia del mismo semestre">
                              <option value="">📋 Copiar estructura de…</option>
                              {matsActivos.filter((x) => x.id !== m.id && MiniDB.find<Nota>("notas", (n) => n.materiaId === x.id).length > 0)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>{x.nombre}</option>
                                ))}
                            </select>
                            <Btn t={t} tone="soft" onClick={() => copiarEstructura(m)}
                              disabled={!copiarDe[m.id]} title="Copiar cantidad de notas y porcentajes desde la materia elegida">
                              Copiar
                            </Btn>
                          </div>
                        </div>
                      </div>

                      {/* Aviso central: mínimo requerido en las pendientes para ganar */}
                      {c.restante > 0 && (
                        <div className={"text-xs mb-2 " + t.sub}>
                          {c.requerida !== null && c.requerida <= 0 ? (
                            <span className={t.ok + " font-semibold"}>✅ Ya ganaste la materia (≥ {cfg.nota_minima})</span>
                          ) : c.requerida !== null && c.requerida > 5 ? (
                            <span className="text-red-500 font-semibold">🔴 Imposible ganarla: máximo alcanzable {c.maximo.toFixed(2)}</span>
                          ) : (
                            <span>🎯 Para ganar necesitas <strong>{c.requerida!.toFixed(2)}</strong> en cada nota pendiente (el {c.restante}% restante)</span>
                          )}
                        </div>
                      )}

                      {/* Filas editables con mínimo por nota pendiente */}
                      <div className="space-y-2">
                        {ns.length === 0 && (
                          <div className={"text-sm " + t.faint}>
                            Sin estructura. Indica la cantidad de notas y pulsa "Generar estructura".
                          </div>
                        )}
                        {ns.length > 0 && (
                          <div className={"grid grid-cols-[1fr_80px_80px_130px_32px] gap-2 text-[10px] uppercase font-semibold " + t.faint}>
                            <span>Nota</span><span>Peso %</span><span>Valor 0-5</span><span>Entrega</span><span />
                          </div>
                        )}
                        {ns.map((n: Nota) => (
                          <div key={n.id} className="grid grid-cols-[1fr_80px_80px_130px_32px] gap-2 items-center">
                            <input className={inputBase + " " + t.input} value={n.nombre}
                              onChange={(e) => editarNota(n.id, "nombre", e.target.value)} />
                            <input className={inputBase + " " + t.input} type="number" min={0} value={n.porcentaje}
                              onChange={(e) => editarNota(n.id, "porcentaje", e.target.value)} />
                            {/* Vacío = pendiente; el badge muestra el mínimo requerido */}
                            <div className="relative">
                              <input className={inputBase + " " + t.input} type="number" min={0} max={5} step={0.1}
                                placeholder="—" value={n.valor ?? ""} title="Vacío = pendiente"
                                onChange={(e) => editarNota(n.id, "valor", e.target.value)} />
                              {n.valor === null && minPorNota !== null && minPorNota > 0 && minPorNota <= 5 && (
                                <span className={"absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold pointer-events-none " + (minPorNota > cfg.nota_ok ? "text-amber-500" : t.ok)}>
                                  mín {minPorNota.toFixed(1)}
                                </span>
                              )}
                            </div>
                            <input className={inputBase + " " + t.input} type="date" value={n.fecha ?? ""}
                              onChange={(e) => editarNota(n.id, "fecha", e.target.value)} />
                            {n.fecha && (
                              <select className={inputBase + " w-auto " + t.input} title="Recordatorios push adicionales para esta entrega (además del de 1 día antes)"
                                value=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) return;
                                  const cur = (n.avisos || []).includes(v) ? (n.avisos || []) : [...(n.avisos || []), v];
                                  editarNota(n.id, "avisos", JSON.stringify(cur));
                                  e.target.value = "";
                                }}>
                                <option value="">🔔 + aviso…</option>
                                <option value="-3d">3 días antes</option>
                                <option value="0d">El mismo día</option>
                              </select>
                            )}
                            {(n.avisos || []).map((a) => (
                              <button key={a} title={`Quitar aviso ${a === "-3d" ? "3 días antes" : "el mismo día"}`}
                                onClick={() => editarNota(n.id, "avisos", JSON.stringify((n.avisos || []).filter((x) => x !== a)))}
                                className={"px-2 py-1 rounded-full text-[10px] font-bold " + t.softBtn}>
                                {a === "-3d" ? "-3d" : "hoy"} ✕
                              </button>
                            ))}
                            <button className={t.faint + " hover:text-red-500 justify-self-center"}
                              onClick={() => { setUndo("🗑️ Nota eliminada"); MiniDB.remove("notas", n.id); refresh(); }}>✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Fade>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
