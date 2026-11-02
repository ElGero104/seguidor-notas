import { useDB } from "./db";
import { useState, useEffect } from "react";
import { MiniDB, DB_SCHEMA } from "./db";

// ==================== DESHACER (aviso global con 5 segundos) ====================
/**
 * Sistema global de "deshacer": antes de cada acción destructiva se toma una
 * foto instantánea de la DB en localStorage; el aviso flotante permite
 * restaurarla durante 5 segundos. Al deshacer (o restaurar un respaldo) se
 * emite el evento "db-undo" y todos los componentes con useDB() se refrescan.
 */
type UndoInfo = { snapshot: typeof DB_SCHEMA; msg: string; key: number };
let undoState: UndoInfo | null = null;
const undoSubs = new Set<() => void>();
const notifyUndo = () => undoSubs.forEach((f) => f());

/** Toma la instantánea ACTUAL de la caché y muestra el aviso. Llamar ANTES de mutar. */
export function setUndo(msg: string) {
  undoState = { snapshot: JSON.parse(JSON.stringify(MiniDB.load())), msg, key: Date.now() };
  notifyUndo();
}

export function clearUndo() {
  undoState = null;
  notifyUndo();
}

export function deshacerUltimo() {
  if (!undoState) return;
  const snap = undoState.snapshot;
  clearUndo();
  MiniDB.persist(JSON.parse(JSON.stringify(snap)));
  window.dispatchEvent(new Event("db-undo"));
}

/** Aviso flotante: mensaje de la acción + botón "Deshacer" (5 segundos). */
export function UndoToast({ t }: any) {
  const [u, setU] = useState<UndoInfo | null>(undoState);
  useEffect(() => {
    const f = () => setU(undoState);
    undoSubs.add(f);
    return () => { undoSubs.delete(f); };
  }, []);
  // El aviso desaparece solo a los 5 segundos (o al deshacer)
  useEffect(() => {
    if (!u) return;
    const id = setTimeout(() => clearUndo(), 5000);
    return () => clearTimeout(id);
  }, [u && u.key]);
  if (!u) return null;
  return (
    <div className={"fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 rounded-2xl border shadow-lg px-4 py-2.5 " + t.card}
      role="status">
      <span className={"text-sm font-medium " + t.text}>{u.msg}</span>
      <button onClick={deshacerUltimo}
        className="rounded-xl px-3 py-1.5 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition shadow">
        ↩️ Deshacer
      </button>
    </div>
  );
}
