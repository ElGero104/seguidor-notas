import { useState, useRef } from "react";
// Tab recursos.tsx
// ==================== RECURSOS + ARCHIVOS POR MATERIA ====================

import { MiniDB, uid } from "../db";
import { Recurso, Archivo } from "../types";
import { inputBase, Btn } from "../tema";
import { subirArchivo, eliminarArchivoStorage, descargarEnNavegador, iconoArchivo, tamanoLegible, esPrevisualizable } from "../storage";
import VisorArchivo from "./visorArchivo";
const REC_TIPOS: Record<string, string> = {
  link: "🔗", zoom: "🎥", drive: "📁", pdf: "📄", otro: "📎",
};

export default function RecursosMateria({ materiaId, data, refresh, t }: any) {
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState<Recurso["tipo"]>("link");
  const [subiendo, setSubiendo] = useState(false);
  const [visor, setVisor] = useState<Archivo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recursos = (data.recursos as Recurso[]).filter((r) => r.materiaId === materiaId);
  const archivos = (data.archivos as Archivo[]).filter((a) => a.materiaId === materiaId);

  const agregar = () => {
    if (!titulo.trim()) return;
    MiniDB.insert<Recurso>("recursos", { id: uid(), materiaId, titulo: titulo.trim(), url: url.trim(), tipo });
    setTitulo(""); setUrl("");
    refresh();
  };
  const eliminarRecurso = (id: string) => {
    MiniDB.remove("recursos", id);
    refresh();
  };

  // Subir archivo a Supabase Storage + registrar en DB (sincronizado)
  const onElegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    const registro = await subirArchivo(materiaId, file);
    setSubiendo(false);
    if (registro) {
      MiniDB.insert<Archivo>("archivos", registro);
      refresh();
    }
  };

  // Eliminar archivo: borra de Storage Y de la DB (doble sync)
  const eliminarArchivo = async (a: Archivo) => {
    if (!confirm(`¿Eliminar "${a.nombre}"? Se borrará también de la nube.`)) return;
    await eliminarArchivoStorage(a.storagePath);
    MiniDB.remove("archivos", a.id);
    refresh();
  };

  const totalBytes = archivos.reduce((s, a) => s + (a.tamano || 0), 0);

  return (
    <div className={"mt-3 rounded-xl p-3 " + t.group}>
      {/* --- Links / recursos web --- */}
      <div className={"text-xs font-bold mb-2 " + t.sub}>🔗 Recursos de la materia ({recursos.length})</div>
      <div className="space-y-1.5 mb-2">
        {recursos.length === 0 && <div className={"text-xs " + t.faint}>Sin links aún: Zoom/Meet, Drive, syllabus…</div>}
        {recursos.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span>{REC_TIPOS[r.tipo] || "📎"}</span>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline truncate">{r.titulo}</a>
            ) : (
              <span className={t.text}>{r.titulo}</span>
            )}
            <button onClick={() => eliminarRecurso(r.id)} className="ml-auto text-red-400 hover:text-red-500 text-xs" title="Eliminar recurso">✕</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <input className={inputBase + " " + t.input + " flex-1 min-w-[120px]"} placeholder="Título (ej: Clase Zoom)"
          value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <input className={inputBase + " " + t.input + " flex-1 min-w-[140px]"} placeholder="https://… (opcional)"
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <select className={inputBase + " " + t.input + " w-auto"} value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
          <option value="link">🔗 Link</option>
          <option value="zoom">🎥 Zoom/Meet</option>
          <option value="drive">📁 Drive</option>
          <option value="pdf">📄 PDF</option>
          <option value="otro">📎 Otro</option>
        </select>
        <Btn t={t} tone="soft" onClick={agregar}>＋</Btn>
      </div>

      {/* --- Archivos subidos (Supabase Storage) --- */}
      <div className={"text-xs font-bold mb-2 mt-3 pt-2 border-t " + t.sub + " border-current/10"}>
        📁 Archivos ({archivos.length}){totalBytes > 0 && <span className={"font-normal ml-1 " + t.faint}>· {tamanoLegible(totalBytes)}</span>}
      </div>
      <div className="space-y-1.5 mb-2">
        {archivos.length === 0 && <div className={"text-xs " + t.faint}>Sin archivos aún: sube PDFs, Word, Excel, imágenes…</div>}
        {archivos.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-sm">
            <span>{iconoArchivo(a.extension)}</span>
            <button onClick={() => esPrevisualizable(a.extension) ? setVisor(a) : descargarEnNavegador(a)}
              className="text-indigo-500 hover:underline truncate text-left" title={esPrevisualizable(a.extension) ? `Ver ${a.nombre}` : `Descargar ${a.nombre}`}>
              {a.nombre}
            </button>
            <span className={"text-[10px] " + t.faint}>{tamanoLegible(a.tamano)}</span>
            <button onClick={() => descargarEnNavegador(a)} className="text-xs opacity-60 hover:opacity-100" title="Descargar">⬇️</button>
            <button onClick={() => eliminarArchivo(a)} className="ml-auto text-red-400 hover:text-red-500 text-xs" title="Eliminar (también de la nube)">✕</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" className="hidden" onChange={onElegirArchivo}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp,.zip,.rar,.mp4,.mp3" />
        <Btn t={t} tone="soft" onClick={() => fileRef.current?.click()} disabled={subiendo}>
          {subiendo ? "⏳ Subiendo…" : "📤 Subir archivo"}
        </Btn>
        <span className={"text-[10px] " + t.faint}>PDF, Word, Excel, imágenes, ZIP…</span>
      </div>
      {visor && <VisorArchivo archivo={visor} t={t} onClose={() => setVisor(null)} refresh={refresh} />}
    </div>
  );
}
