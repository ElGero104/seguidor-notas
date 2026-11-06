// ==================== SUPABASE STORAGE (ARCHIVOS POR MATERIA) ====================
// Bucket "apuntes", estructura: {userId}/{materiaId}/{archivoId}-{nombre}

import { getSb } from "./db";
import { Archivo } from "./types";

export const BUCKET = "apuntes";

/** Asegura que el bucket exista (lo crea si no, público para descargas). */
export async function ensureBucket() {
  try {
    const sb = getSb();
    const { data: buckets } = await sb.storage.listBuckets();
    if (!buckets?.find((b: any) => b.name === BUCKET)) {
      await sb.storage.createBucket(BUCKET, { public: true });
    }
  } catch {}
}

async function userId(): Promise<string | null> {
  const { data: s } = await getSb().auth.getSession();
  return s?.session?.user?.id ?? null;
}

/** Sube un archivo a Storage y devuelve el registro Archivo listo para guardar en DB. */
export async function subirArchivo(materiaId: string, file: File): Promise<Archivo | null> {
  const uid = await userId();
  if (!uid) return null;
  await ensureBucket();
  const id = crypto.randomUUID();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${uid}/${materiaId}/${id}-${safeName}`;
  const { error } = await getSb().storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) { alert("⚠️ No se pudo subir el archivo: " + error.message); return null; }
  return {
    id,
    materiaId,
    nombre: file.name,
    extension: ext,
    storagePath: path,
    tamano: file.size,
    subido: new Date().toISOString(),
  };
}

/** Elimina un archivo de Storage (silencioso si ya no existe). */
export async function eliminarArchivoStorage(storagePath: string) {
  if (!storagePath) return;
  try { await getSb().storage.from(BUCKET).remove([storagePath]); } catch {}
}

/** Elimina TODOS los archivos de una materia en Storage. */
export async function eliminarArchivosMateria(materiaId: string) {
  const uid = await userId();
  if (!uid) return;
  try {
    const prefix = `${uid}/${materiaId}/`;
    const { data } = await getSb().storage.from(BUCKET).list(`${uid}/${materiaId}`, { limit: 1000 });
    const paths = (data || []).map((f: any) => `${prefix}${f.name}`);
    if (paths.length) await getSb().storage.from(BUCKET).remove(paths);
  } catch {}
}

/** Descarga un archivo como blob (para previsualizar o descargar). */
export async function descargarArchivo(storagePath: string): Promise<Blob | null> {
  try {
    const { data, error } = await getSb().storage.from(BUCKET).download(storagePath);
    if (error || !data) return null;
    return data;
  } catch { return null; }
}

/** URL pública de descarga (el bucket es público). */
export function urlPublica(storagePath: string): string {
  const { data } = getSb().storage.from(BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Dispara la descarga de un archivo en el navegador. */
export async function descargarEnNavegador(archivo: Archivo) {
  const blob = await descargarArchivo(archivo.storagePath);
  if (!blob) { alert("⚠️ No se pudo descargar el archivo."); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.nombre;
  a.click();
  URL.revokeObjectURL(url);
}

/** Descarga varios archivos secuencialmente con pequeño delay (evita bloqueos del navegador). */
export async function descargarVarios(archivos: Archivo[], onProgreso?: (i: number, total: number) => void) {
  for (let i = 0; i < archivos.length; i++) {
    onProgreso?.(i + 1, archivos.length);
    await descargarEnNavegador(archivos[i]);
    await new Promise((r) => setTimeout(r, 400));
  }
}

/** Ícono según la extensión del archivo. */
export function iconoArchivo(ext: string): string {
  const e = (ext || "").toLowerCase();
  if (["pdf"].includes(e)) return "📕";
  if (["doc", "docx"].includes(e)) return "📘";
  if (["xls", "xlsx", "csv"].includes(e)) return "📊";
  if (["ppt", "pptx"].includes(e)) return "📊";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e)) return "🖼️";
  if (["mp4", "webm", "mov"].includes(e)) return "🎬";
  if (["mp3", "wav", "ogg"].includes(e)) return "🎵";
  if (["zip", "rar", "7z"].includes(e)) return "🗜️";
  if (["txt", "md"].includes(e)) return "📄";
  return "📎";
}

/** Tamaño legible (KB/MB). */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
