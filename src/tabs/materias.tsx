// Tab materias.tsx
// ==================== PESTAÑA MATERIAS ====================

/**
 * Vista de materias del SEMESTRE ACTIVO (se elige en el encabezado):
 * crear materias dentro de ese semestre, búsqueda, archivar/restaurar,
 * próximas entregas, notas y exportación CSV.
 */
export default function TabMaterias({ data, refresh, t }: any) {
  const [form, setForm] = useState({ nombre: "", profesor: "", creditos: 3 });
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [minimizadas, setMinimizadas] = useState<Record<string, boolean>>({});
  const [ef, setEf] = useState({ nombre: "", profesor: "", creditos: 3, color: "#6366f1" });
  const cfg: Config = data.config[0];
  const activo = cfg.activo;
  const arch: string[] = cfg.archivados || [];

  // Las materias nuevas nacen dentro del semestre activo
  const agregar = () => {
    if (!activo) { alert("⚠️ Primero crea un semestre: elige ➕ Añadir semestre… en el encabezado."); return; }
    if (!form.nombre.trim()) return;
    MiniDB.insert<Materia>("materias", {
      id: uid(),
      nombre: form.nombre.trim(),
      profesor: form.profesor.trim(),
      creditos: Number(form.creditos) || 0,
      color: COLORS[MiniDB.find<Materia>("materias").length % COLORS.length],
      semestre: activo,
    });
    setForm({ nombre: "", profesor: "", creditos: 3 });
    refresh();
  };

  // DELETE en cascada: materia + notas + clases + recursos
  const eliminar = (id: string) => {
    setUndo("🗑️ Materia eliminada");
    MiniDB.remove("materias", id);
    MiniDB.removeWhere("notas", (n) => n.materiaId === id);
    MiniDB.removeWhere("clases", (c) => c.materiaId === id);
    MiniDB.removeWhere("recursos", (r) => r.materiaId === id);
    refresh();
  };

  // Archivar / restaurar el semestre activo
  const toggleArchivo = () => {
    MiniDB.saveConfig({ archivados: arch.includes(activo) ? arch.filter((x) => x !== activo) : [...arch, activo] });
    refresh();
  };

  // Eliminar el semestre activo por completo: materias + notas + clases (cascada)
  const borrarSemestre = () => {
    if (!activo) return;
    const ms = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo);
    const idsMs = new Set(ms.map((m) => m.id));
    const nNotas = (data.notas as Nota[]).filter((n) => idsMs.has(n.materiaId)).length;
    if (!confirm(`⚠️ ¿Eliminar "${activo}" con ${ms.length} materia(s) y ${nNotas} nota(s)?\n\nSe borrarán también sus horarios.\n\nPodrás deshacerlo durante 5 segundos con el aviso ↩️ Deshacer.`)) return;
    setUndo("🗑️ Semestre eliminado");
    ms.forEach((m) => {
      MiniDB.remove("materias", m.id);
      MiniDB.removeWhere("notas", (n) => n.materiaId === m.id);
      MiniDB.removeWhere("clases", (c) => c.materiaId === m.id);
      MiniDB.removeWhere("recursos", (r) => r.materiaId === m.id);
    });
    const restantes = (cfg.semestres || []).filter((s) => s !== activo);
    MiniDB.saveConfig({
      semestres: restantes,
      archivados: arch.filter((s) => s !== activo),
      activo: restantes.slice().sort()[restantes.length - 1] || "",
    });
    refresh();
  };

  // Editar materia: nombre, profesor, créditos y color
  const empezarEdicion = (m: Materia) => {
    setEditando(m.id);
    setEf({ nombre: m.nombre, profesor: m.profesor, creditos: m.creditos, color: m.color });
  };
  const guardarEdicion = (id: string) => {
    if (!ef.nombre.trim()) return;
    MiniDB.update<Materia>("materias", id, {
      nombre: ef.nombre.trim(),
      profesor: ef.profesor.trim(),
      creditos: Number(ef.creditos) || 0,
      color: ef.color,
    });
    setEditando(null);
    refresh();
  };

  // Filtro de búsqueda (nombre y profesor)
  const coincide = (m: Materia) =>
    !q.trim() || (m.nombre + " " + m.profesor).toLowerCase().includes(q.trim().toLowerCase());

  // Materias del semestre activo
  const todos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo).filter(coincide);
  const psem = promedioSemestre(data, activo);
  const archivado = arch.includes(activo);

  // Sin semestres aún: guiar al selector del encabezado
  if (!activo) {
    return (
      <div className={"rounded-3xl border-2 border-dashed p-10 text-center " + t.card}>
        <div className="text-5xl mb-3">📂</div>
        <h2 className={"text-xl font-bold " + t.text}>Aún no hay semestres</h2>
        <p className={"text-sm mt-2 " + t.sub}>
          Crea tu primer semestre con la opción "➕ Añadir semestre…" del encabezado. Luego añade materias aquí.
        </p>
      </div>
    );
  }

  // Próximas entregas: 5 notas con fecha más cercana (solo del semestre activo)
  const idsActivos = new Set((data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === activo).map((m) => m.id));
  const proximas = (data.notas as Nota[])
    .filter((n) => n.fecha && idsActivos.has(n.materiaId))
    .sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* --- Encabezado del semestre activo --- */}
      <div className={"flex flex-wrap items-center justify-between gap-2 border-b-2 pb-1 " + t.h2}>
        <h2 className="text-lg font-bold">
          {archivado ? "🗄️" : "📂"} {activo}
          <span className={"text-sm font-normal " + t.sub}> · {todos.length} materia{todos.length === 1 ? "" : "s"}</span>
        </h2>
        <div className="flex items-center gap-2">
          {psem !== null && (
            <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(psem, cfg, t)}>
              Prom. semestre: {psem.toFixed(2)}
            </span>
          )}
          <button onClick={() => {
            const act = cfg.fechasSemestre?.[activo] || { inicio: "", fin: "" };
            const ini = prompt("📅 Fecha de inicio del semestre (AAAA-MM-DD):", act.inicio);
            if (ini === null) return;
            const fin = prompt("📅 Fecha de fin del semestre (AAAA-MM-DD):", act.fin);
            if (fin === null) return;
            const v = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "";
            MiniDB.saveConfig({ fechasSemestre: { ...(cfg.fechasSemestre || {}), [activo]: { inicio: v(ini), fin: v(fin) } } });
            refresh();
          }} className={t.faint + " hover:text-indigo-400 text-sm"}
            title="Editar fechas de inicio y fin del semestre (las clases del calendario solo se muestran dentro de este rango)">
            📅 Fechas
          </button>
          <button onClick={toggleArchivo} className={t.faint + " hover:text-indigo-400 text-sm"}
            title={archivado ? "Restaurar semestre" : "Archivar semestre"}>
            {archivado ? "📂 Restaurar" : "🗄️ Archivar semestre"}
          </button>
          <button onClick={borrarSemestre} className="text-red-400 hover:text-red-500 text-sm"
            title="Eliminar este semestre y todo su contenido">
            🗑️ Eliminar semestre
          </button>
        </div>
      </div>

      {archivado && (
        <div className={"rounded-xl px-4 py-2 text-sm " + t.warnBg}>
          🗄️ Semestre archivado (solo consulta). Pulsa "Restaurar" para volver a trabajarlo.
        </div>
      )}

      {/* --- Crear materia (dentro del semestre activo) + exportar CSV --- */}
      <div className={cardBase + " " + t.card}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={"font-bold " + t.text}>➕ Crear materia en {activo}</h2>
          <div className="flex gap-2">
            <Btn t={t} tone="soft" onClick={() => exportarExcel(data)}>📊 Excel</Btn>
            <Btn t={t} tone="soft" onClick={() => exportarCSV(data)}>⬇️ CSV</Btn>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <span className={labelBase + " " + t.sub}>Nombre</span>
            <input className={inputBase + " " + t.input} value={form.nombre}
              placeholder="Ej: Análisis y Diseño de Sistemas I"
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </div>
          <div>
            <span className={labelBase + " " + t.sub}>Profesor</span>
            <input className={inputBase + " " + t.input} value={form.profesor} placeholder="Opcional"
              onChange={(e) => setForm({ ...form, profesor: e.target.value })} />
          </div>
          <div>
            <span className={labelBase + " " + t.sub}>Créditos</span>
            <div className="flex gap-2">
              <input className={inputBase + " " + t.input} type="number" min={0} value={form.creditos}
                onChange={(e) => setForm({ ...form, creditos: e.target.value })} />
              <Btn t={t} onClick={agregar}>Añadir</Btn>
            </div>
          </div>
        </div>
      </div>

      {/* --- Búsqueda --- */}
      <div className={cardBase + " " + t.card}>
        <input className={inputBase + " " + t.input} placeholder="🔍 Buscar materia o profesor…"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* --- Próximas entregas --- */}
      {proximas.length > 0 && (
        <Fade k="prox">
          <div className={cardBase + " " + t.card}>
            <h2 className={"font-bold mb-3 " + t.text}>⏳ Próximas entregas</h2>
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
        </Fade>
      )}

      {/* --- Materias del semestre activo --- */}
      {todos.length === 0 && (
        <div className={cardBase + " " + t.card + " " + t.sub + " text-sm"}>
          Todavía no hay materias en este semestre. Crea la primera arriba. 👆
        </div>
      )}
      {todos.map((m: Materia) => {
        const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
        const p = promedio(data.notas, m.id);
        const c = calculo(ns, cfg.nota_minima);
        return (
          <Fade key={m.id} k={m.id}>
            <div className={cardBase + " " + t.card} style={{ borderLeft: `5px solid ${m.color}` }}>
              {editando === m.id ? (
                /* --- Formulario de edición de materia --- */
                <div className={"mb-3 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-5 gap-2 " + t.group}>
                  <input className={inputBase + " " + t.input} value={ef.nombre}
                    placeholder="Nombre de la materia"
                    onChange={(e) => setEf({ ...ef, nombre: e.target.value })} />
                  <input className={inputBase + " " + t.input} value={ef.profesor} placeholder="Profesor"
                    onChange={(e) => setEf({ ...ef, profesor: e.target.value })} />
                  <input className={inputBase + " " + t.input} type="number" min={0} value={ef.creditos}
                    title="Créditos"
                    onChange={(e) => setEf({ ...ef, creditos: e.target.value })} />
                  <div className="flex items-center gap-2">
                    <input type="color" value={ef.color} title="Color de la materia"
                      className={"h-9 w-12 rounded cursor-pointer border bg-transparent " + (cfg.dark ? "border-slate-600" : "border-slate-300")}
                      onChange={(e) => setEf({ ...ef, color: e.target.value })} />
                    <span className={"text-xs " + t.faint}>color</span>
                  </div>
                  <div className="flex gap-2">
                    <Btn t={t} onClick={() => guardarEdicion(m.id)}>💾 Guardar</Btn>
                    <Btn t={t} tone="danger" onClick={() => setEditando(null)}>Cancelar</Btn>
                  </div>
                </div>
              ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={"font-bold " + t.text}>{m.nombre}</div>
                  <div className={"text-sm " + t.sub}>
                    {m.profesor || "Sin profesor"} · {m.creditos} créditos · {c.pesoEval}% calificado · {c.restante}% pendiente
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p !== null && (
                    <span className={"px-3 py-1 rounded-full text-sm font-bold " + estadoBg(p, cfg, t)}>
                      {p.toFixed(2)}
                    </span>
                  )}
                  <Btn t={t} tone="soft" onClick={() => setMinimizadas({ ...minimizadas, [m.id]: !minimizadas[m.id] })}
                    title={minimizadas[m.id] ? "Mostrar detalle de la materia" : "Minimizar detalle de la materia"}>
                    {minimizadas[m.id] ? "▸" : "▾"}
                  </Btn>
                  <Btn t={t} tone="soft" onClick={() => empezarEdicion(m)} title="Editar materia">✎</Btn>
                  <Btn t={t} tone="danger" onClick={() => eliminar(m.id)}>✕</Btn>
                </div>
              </div>
              )}

              {!minimizadas[m.id] && (
              <>
              {/* Aviso: mínimo para ganar la materia (solo si hay pendientes) */}
              {c.restante > 0 && (
                <div className={"mt-2 text-xs " + t.sub}>
                  {c.requerida !== null && c.requerida <= 0 ? (
                    <span className={t.ok + " font-semibold"}>✅ Materia asegurada (≥ {cfg.nota_minima})</span>
                  ) : c.requerida !== null && c.requerida > 5 ? (
                    <span className="text-red-500 font-semibold">🔴 Ya no es posible ganarla (máx. {c.maximo.toFixed(2)})</span>
                  ) : (
                    <span>🎯 Para ganar necesitas <strong>{c.requerida!.toFixed(2)}</strong> en el {c.restante}% pendiente · máximo posible: {c.maximo.toFixed(2)}</span>
                  )}
                </div>
              )}

              {/* Lista de notas */}
              <div className="mt-3 space-y-2">
                {ns.length === 0 && <div className={"text-sm " + t.faint}>Sin notas registradas</div>}
                {ns.map((n: Nota) => (
                  <div key={n.id} className={"flex items-center gap-2 text-sm " + t.sub}>
                    <span className="flex-1">
                      {n.nombre} <span className={t.faint}>({n.porcentaje}%)</span>{" "}
                      <FechaBadge fecha={n.fecha} t={t} />
                    </span>
                    {n.valor === null ? (
                      <span className={"text-xs italic " + t.faint}>pendiente</span>
                    ) : (
                      <span className={estadoTxt(n.valor, cfg, t)}>{n.valor.toFixed(1)}</span>
                    )}
                    <button className={t.faint + " hover:text-red-500"}
                      onClick={() => { setUndo("🗑️ Nota eliminada"); MiniDB.remove("notas", n.id); refresh(); }}>✕</button>
                  </div>
                ))}
              </div>
              <FormNota materiaId={m.id} refresh={refresh} t={t} />
              <RecursosMateria materiaId={m.id} data={data} refresh={refresh} t={t} />
              </>
              )}
            </div>
          </Fade>
        );
      })}
    </div>
  );
}

/** Alta de notas: valor vacío = PENDIENTE (null), no cuenta como 0. */
function FormNota({ materiaId, refresh, t }: any) {
  const [f, setF] = useState({ nombre: "", valor: "", porcentaje: "", fecha: "" });
  const add = () => {
    const pct = parseFloat(f.porcentaje);
    if (!f.nombre.trim() || isNaN(pct) || pct <= 0) return;
    const valor = f.valor === "" ? null : parseFloat(f.valor); // "" -> pendiente
    if (valor !== null && (isNaN(valor) || valor < 0 || valor > 5)) return;
    MiniDB.insert<Nota>("notas", {
      id: uid(), materiaId, nombre: f.nombre.trim(), valor, porcentaje: pct,
      fecha: f.fecha || undefined,
    });
    setF({ nombre: "", valor: "", porcentaje: "", fecha: "" });
    refresh();
  };
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2 border-t pt-3" style={{ borderColor: "rgba(148,163,184,0.2)" }}>
      <input className={inputBase + " " + t.input} placeholder="Nota (ej: Parcial 1)" value={f.nombre}
        onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <input className={inputBase + " " + t.input} type="number" min={0} max={5} step={0.1} placeholder="Valor (vacío = pendiente)" value={f.valor}
        onChange={(e) => setF({ ...f, valor: e.target.value })} />
      <input className={inputBase + " " + t.input} type="number" min={0} placeholder="% peso" value={f.porcentaje}
        onChange={(e) => setF({ ...f, porcentaje: e.target.value })} />
      <input className={inputBase + " " + t.input} type="date" title="Fecha de entrega (opcional)" value={f.fecha}
        onChange={(e) => setF({ ...f, fecha: e.target.value })} />
      <Btn t={t} tone="soft" onClick={add}>+ Nota</Btn>
    </div>
  );
}
