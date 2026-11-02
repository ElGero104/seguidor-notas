import { useState, useEffect } from "react";
// Tab recursos.tsx
// ==================== RECURSOS POR MATERIA (hub de links) ====================

import { MiniDB, uid } from "../db";
import { Recurso } from "../types";
import { inputBase, Btn } from "../tema.tsx";
const REC_TIPOS: Record<string, string> = {
  link: "🔗", zoom: "🎥", drive: "📁", pdf: "📄", otro: "📎",
};

export default function RecursosMateria({ materiaId, data, refresh, t }: any) {
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState<Recurso["tipo"]>("link");
  const recursos = (data.recursos as Recurso[]).filter((r) => r.materiaId === materiaId);

  const agregar = () => {
    if (!titulo.trim()) return;
    MiniDB.insert<Recurso>("recursos", { id: uid(), materiaId, titulo: titulo.trim(), url: url.trim(), tipo });
    setTitulo(""); setUrl("");
    refresh();
  };
  const eliminar = (id: string) => {
    MiniDB.remove("recursos", id);
    refresh();
  };

  return (
    <div className={"mt-3 rounded-xl p-3 " + t.group}>
      <div className={"text-xs font-bold mb-2 " + t.sub}>📎 Recursos de la materia ({recursos.length})</div>
      <div className="space-y-1.5 mb-2">
        {recursos.length === 0 && <div className={"text-xs " + t.faint}>Sin recursos aún: añade Zoom/Meet, Drive, syllabus…</div>}
        {recursos.map((r) => (
          <div key={r.id} className="flex items-center gap-2 text-sm">
            <span>{REC_TIPOS[r.tipo] || "📎"}</span>
            {r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline truncate">{r.titulo}</a>
            ) : (
              <span className={t.text}>{r.titulo}</span>
            )}
            <button onClick={() => eliminar(r.id)} className="ml-auto text-red-400 hover:text-red-500 text-xs" title="Eliminar recurso">✕</button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
