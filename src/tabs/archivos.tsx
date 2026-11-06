// Tab archivos.tsx
// ==================== CARPETA DEL SEMESTRE (ARCHIVOS EN STORAGE) ====================

import { useState } from "react";
import { MiniDB } from "../db";
import { Materia, Archivo, Config } from "../types";
import { cardBase, Btn, Fade } from "../tema";
import { setUndo } from "../undo";
import { eliminarArchivoStorage, descargarEnNavegador, descargarZipSemestre, descargarZipMateria, iconoArchivo, tamanoLegible, esPrevisualizable } from "../storage";
import VisorArchivo from "./visorArchivo";

/**
 * Vista de todos los archivos subidos a las materias del semestre activo,
 * agrupados por materia. Permite descargar uno o toda la "carpeta" del semestre.
 */
export default function TabArchivos({ data, refresh, t }: any) {
  const cfg: Config = data.config[0];
  const [descargando, setDescargando] = useState(false);
  const [progreso, setProgreso] = useState("");
  const [zipMateria, setZipMateria] = useState<string | null>(null);
  const [visor, setVisor] = useState<Archivo | null>(null);

  const mats = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo);
  const idsAct = new Set(mats.map((m) => m.id));
  const archivos = (data.archivos as Archivo[]).filter((a) => idsAct.has(a.materiaId));
  const porMateria = mats.map((m) => ({
    m,
    archivos: archivos.filter((a) => a.materiaId === m.id),
  })).filter((g) => g.archivos.length > 0);

  const totalBytes = archivos.reduce((s, a) => s + (a.tamano || 0), 0);

  const eliminar = async (a: Archivo) => {
    if (!confirm(`¿Eliminar "${a.nombre}"? Se borrará también de la nube.`)) return;
    setUndo("🗑️ Archivo eliminado");
    await eliminarArchivoStorage(a.storagePath);
    MiniDB.remove("archivos", a.id);
    refresh();
  };

  // Carpeta completa del semestre como ZIP con subcarpetas por materia
  const descargarTodo = async () => {
    if (archivos.length === 0) return;
    setDescargando(true);
    setProgreso("Preparando…");
    const ok = await descargarZipSemestre(
      cfg.activo || "semestre",
      porMateria.map((g) => ({ materiaNombre: g.m.nombre, archivos: g.archivos })),
      (msg) => setProgreso(msg)
    );
    setDescargando(false);
    setProgreso("");
    if (!ok) alert("⚠️ No se pudo generar el ZIP");
  };

  // ZIP solo de una materia
  const descargarMateria = async (materiaNombre: string, archs: Archivo[]) => {
    setZipMateria(materiaNombre);
    setProgreso("Preparando…");
    const ok = await descargarZipMateria(materiaNombre, archs, (msg) => setProgreso(msg));
    setZipMateria(null);
    setProgreso("");
    if (!ok) alert("⚠️ No se pudo generar el ZIP de la materia");
  };

  return (
    <div className="space-y-5">
      {/* --- Header --- */}
      <Fade k="header">
        <div className={cardBase + " " + t.card + " flex flex-wrap items-center gap-3"}>
          <div>
            <h2 className={"font-bold " + t.text}>📁 Carpeta del semestre · {cfg.activo || "—"}</h2>
            <p className={"text-xs mt-0.5 " + t.faint}>
              {archivos.length} archivo{archivos.length === 1 ? "" : "s"} · {tamanoLegible(totalBytes)} · {porMateria.length} materia{porMateria.length === 1 ? "" : "s"}
            </p>
          </div>
          {archivos.length > 0 && (
            <div className="ml-auto">
              <Btn t={t} onClick={descargarTodo} disabled={descargando}>
                {descargando ? `⏳ ${progreso || "Generando ZIP…"}` : `📦 Descargar semestre como ZIP (${archivos.length} archivos)`}
              </Btn>
            </div>
          )}
        </div>
      </Fade>

      {/* --- Estado vacío --- */}
      {archivos.length === 0 && (
        <Fade k="vacio">
          <div className={"rounded-3xl border-2 border-dashed p-10 text-center " + t.card}>
            <div className="text-5xl mb-3">📁</div>
            <h2 className={"text-xl font-bold " + t.text}>Sin archivos en {cfg.activo || "este semestre"}</h2>
            <p className={"text-sm mt-2 " + t.sub}>
              Abrí una materia en la pestaña <strong>Materias</strong> y usa <strong>📤 Subir archivo</strong> para guardar PDFs, Word, Excel, etc. Acá aparecerán todos juntos.
            </p>
          </div>
        </Fade>
      )}

      {/* --- Agrupado por materia --- */}
      {porMateria.map(({ m, archivos: archs }) => (
        <Fade k={m.id}>
          <div key={m.id} className={cardBase + " " + t.card}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
              <h3 className={"font-bold " + t.text}>{m.nombre}</h3>
              <span className={"text-xs " + t.faint}>· {archs.length} archivo{archs.length === 1 ? "" : "s"} · {tamanoLegible(archs.reduce((s, a) => s + (a.tamano || 0), 0))}</span>
              <button
                onClick={() => descargarMateria(m.nombre, archs)}
                disabled={zipMateria !== null}
                className={"ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold " + t.softBtn}
                title={`Descargar ZIP con los archivos de ${m.nombre}`}>
                {zipMateria === m.nombre ? "⏳…" : "📦 ZIP materia"}
              </button>
            </div>
            <div className="space-y-1.5">
              {archs.map((a) => (
                <div key={a.id} className={"flex items-center gap-2 rounded-lg px-3 py-2 text-sm " + t.groupCard}>
                  <span className="text-lg">{iconoArchivo(a.extension)}</span>
                  <button onClick={() => esPrevisualizable(a.extension) ? setVisor(a) : descargarEnNavegador(a)}
                    className="text-indigo-500 hover:underline truncate text-left font-medium" title={esPrevisualizable(a.extension) ? `Ver ${a.nombre}` : `Descargar ${a.nombre}`}>
                    {a.nombre}
                  </button>
                  <span className={"text-[10px] uppercase font-bold px-1.5 py-0.5 rounded " + t.group}>{a.extension}</span>
                  <span className={"text-[10px] " + t.faint}>{tamanoLegible(a.tamano)}</span>
                  <span className={"text-[10px] " + t.faint}>{new Date(a.subido).toLocaleDateString("es-CO")}</span>
                  <button onClick={() => descargarEnNavegador(a)} className="ml-auto text-xs opacity-60 hover:opacity-100" title="Descargar">⬇️</button>
                  <button onClick={() => eliminar(a)} className="text-red-400 hover:text-red-500 text-xs" title="Eliminar (también de la nube)">✕</button>
                </div>
              ))}
            </div>
          </div>
        </Fade>
      ))}

      {visor && <VisorArchivo archivo={visor} t={t} onClose={() => setVisor(null)} refresh={refresh} />}
    </div>
  );
}
