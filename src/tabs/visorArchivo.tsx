// VisorArchivo.tsx
// ==================== VISOR/EDITOR INLINE DE ARCHIVOS ====================

import { useState, useEffect } from "react";
import { Archivo } from "../types";
import { MiniDB } from "../db";
import { urlPublica, leerArchivoTexto, guardarArchivoExistente, descargarEnNavegador, iconoArchivo, tamanoLegible, esEditable } from "../storage";

/**
 * Modal que previsualiza un archivo según su tipo:
 * - PDF → iframe inline
 * - Imagen → img inline
 * - Video/Audio → reproductor nativo
 * - Texto (txt, md, csv, json, código…) → editor con botón Guardar (sobrescribe en Storage)
 * - Otros → solo descarga
 */
export default function VisorArchivo({ archivo, t, onClose, refresh }: any) {
  const [contenido, setContenido] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editado, setEditado] = useState(false);

  const ext = (archivo.extension || "").toLowerCase();
  const esImg = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
  const esVideo = ["mp4", "webm", "mov"].includes(ext);
  const esAudio = ["mp3", "wav", "ogg"].includes(ext);
  const esPdf = ext === "pdf";
  const editable = esEditable(ext);
  const url = urlPublica(archivo.storagePath);

  useEffect(() => {
    if (editable) {
      setCargando(true);
      leerArchivoTexto(archivo.storagePath).then((txt) => {
        setContenido(txt ?? "");
        setCargando(false);
      });
    }
  }, [archivo.id]);

  // Cerrar con Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const guardar = async () => {
    setGuardando(true);
    const ok = await guardarArchivoExistente(archivo.storagePath, contenido);
    setGuardando(false);
    if (ok) {
      MiniDB.update<Archivo>("archivos", archivo.id, { tamano: new Blob([contenido]).size, subido: new Date().toISOString() });
      setEditado(false);
      refresh?.();
      alert("✅ Guardado en la nube");
    } else {
      alert("⚠️ No se pudo guardar");
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={"w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden " + t.card}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-current/10">
          <span className="text-2xl">{iconoArchivo(ext)}</span>
          <div className="min-w-0 flex-1">
            <div className={"font-bold truncate " + t.text}>{archivo.nombre}</div>
            <div className={"text-xs " + t.faint}>{ext.toUpperCase() || "ARCHIVO"} · {tamanoLegible(archivo.tamano)}</div>
          </div>
          <button onClick={() => descargarEnNavegador(archivo)} className={"px-3 py-1.5 rounded-lg text-xs font-bold " + t.softBtn} title="Descargar">⬇️ Descargar</button>
          {editable && (
            <button onClick={guardar} disabled={guardando || !editado}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed">
              {guardando ? "⏳ Guardando…" : "💾 Guardar"}
            </button>
          )}
          <button onClick={onClose} className={"text-xl px-2 hover:opacity-70 " + t.sub}>✕</button>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 overflow-auto p-4">
          {cargando && <div className={"text-center py-10 " + t.sub}>⏳ Cargando contenido…</div>}

          {!cargando && esPdf && (
            <iframe src={url} className="w-full h-[70vh] rounded-xl border" title={archivo.nombre} />
          )}

          {!cargando && esImg && (
            <div className="flex justify-center">
              <img src={url} alt={archivo.nombre} className="max-w-full max-h-[70vh] rounded-xl" />
            </div>
          )}

          {!cargando && esVideo && (
            <video src={url} controls className="w-full max-h-[70vh] rounded-xl bg-black" />
          )}

          {!cargando && esAudio && (
            <div className="flex flex-col items-center py-10">
              <div className="text-6xl mb-4">🎵</div>
              <audio src={url} controls className="w-full max-w-md" />
            </div>
          )}

          {!cargando && editable && (
            <textarea
              value={contenido}
              onChange={(e) => { setContenido(e.target.value); setEditado(true); }}
              className={"w-full h-[60vh] rounded-xl border p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400/50 " + t.input}
              placeholder="Escribe aquí…"
              spellCheck={false}
            />
          )}

          {!cargando && !esPdf && !esImg && !esVideo && !esAudio && !editable && (
            <div className={"text-center py-10 " + t.sub}>
              <div className="text-5xl mb-3">{iconoArchivo(ext)}</div>
              <p>Este tipo de archivo no se puede previsualizar en la web.</p>
              <p className="text-xs mt-1">Usá el botón <strong>⬇️ Descargar</strong> para abrirlo con la app correspondiente.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
