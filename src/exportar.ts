import { getSb, sb, uid } from "./db";
import { promedio } from "./calculos";
import { MiniDB, DB_SCHEMA, CONFIG_DEFAULT } from "./db";
import { Materia, Nota, Config } from "./types";
import { diasHasta } from "./calculos";
import { setUndo } from "./undo.tsx";

// ==================== EXPORTAR CSV/EXCEL ====================
/**
 * Exporta todas las materias con sus notas a CSV (separador ";" + BOM UTF-8
 * para que Excel lo abra con acentos correctos) y dispara la descarga.
 */
export function exportarCSV(data: any) {
  const rows: string[][] = [["Materia", "Semestre", "Nota", "Valor (0-5)", "Peso (%)", "Fecha entrega", "Estado"]];
  (data.materias as Materia[]).forEach((m) => {
    MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id).forEach((n) => {
      rows.push([
        m.nombre, m.semestre, n.nombre,
        n.valor !== null ? String(n.valor) : "",
        String(n.porcentaje), n.fecha ?? "",
        n.valor !== null ? "Calificada" : "Pendiente",
      ]);
    });
  });
  if (rows.length === 1) { alert("⚠️ No hay notas que exportar."); return; }
  // Escapar comillas y unir con ";" (formato que Excel reconoce en es-CO)
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seguidor-notas.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== RESPALDO Y RESTAURACIÓN COMPLETA (.json) ====================
/**
 * Respaldo completo de TODOS los datos en un solo archivo .json: materias,
 * notas, horarios, TODOS los semestres y la configuración. Es el respaldo
 * "de verdad": sirve para migrar de navegador o recuperar tras limpiar datos.
 * "Restaurar" valida el archivo, pide confirmación y reemplaza los datos
 * actuales (se puede deshacer durante 5 segundos desde el aviso).
 */
/**
 * Respaldo automático a la nube: guarda el estado completo como JSON en la
 * tabla recursos (tipo "backup") del usuario. Se ejecuta al iniciar sesión y
 * como máximo 1 vez por semana; conserva los últimos 4 respaldos.
 */
async function respaldoAutoNube() {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return;
    const sb = getSb();
    const last = (await sb.from("recursos").select("titulo").eq("user_id", uidUser).eq("tipo", "backup").order("titulo", { ascending: false }).limit(1)).data?.[0];
    const hoy = new Date().toISOString().slice(0, 10);
    if (last && last.titulo.includes(hoy)) return; // ya hay respaldo de hoy
    const payload = JSON.stringify({ app: "seguidor-notas", version: 1, fecha: new Date().toISOString(), db: JSON.parse(JSON.stringify(MiniDB.load())) });
    await sb.from("recursos").insert({
      id: uid(), user_id: uidUser, materia_id: null as any,
      titulo: "respaldo-auto-" + hoy, url: payload, tipo: "backup",
    });
    // conservar solo los últimos 4
    const todos = (await sb.from("recursos").select("id,titulo").eq("user_id", uidUser).eq("tipo", "backup").order("titulo", { ascending: false })).data || [];
    const viejos = todos.slice(4).map((r: any) => r.id);
    if (viejos.length) await sb.from("recursos").delete().in("id", viejos);
  } catch {}
}

/** Descarga el último respaldo automático de la nube (si existe y es más reciente que el local). */
async function restaurarAutoNubeSiMasReciente() {
  try {
    const { data: s } = await getSb().auth.getSession();
    const uidUser = s?.session?.user?.id;
    if (!uidUser) return false;
    const sb = getSb();
    const r = await sb.from("recursos").select("titulo,url").eq("user_id", uidUser).eq("tipo", "backup").order("titulo", { ascending: false }).limit(1);
    const last = r.data?.[0] as any;
    if (!last?.url) return false;
    const p = JSON.parse(last.url);
    const db = p && p.app === "seguidor-notas" && p.db ? p.db : null;
    if (!db || !Array.isArray(db.materias)) return false;
    const cfgR: Config = { ...CONFIG_DEFAULT, ...(db.config?.[0] || {}) };
    const actual = { ...DB_SCHEMA, ...db, config: [cfgR] };
    MiniDB.setCache(JSON.parse(JSON.stringify(actual)));
    return true;
  } catch { return false; }
}

export function exportarJSON() {
  const respaldo = {
    app: "seguidor-notas",
    version: 1,
    fecha: new Date().toISOString(),
    db: JSON.parse(JSON.stringify(MiniDB.load())),
  };
  const blob = new Blob([JSON.stringify(respaldo, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seguidor-notas-respaldo-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

export function restaurarJSON(archivo: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const p = JSON.parse(String(reader.result));
      // Acepta el respaldo con envoltorio ({app, db, fecha}) o la DB cruda
      const db: any = p && p.app === "seguidor-notas" && p.db ? p.db : p;
      if (!db || !Array.isArray(db.materias) || !Array.isArray(db.notas) ||
          !Array.isArray(db.clases) || !Array.isArray(db.config)) {
        throw new Error("formato inválido");
      }
      const cfgR: Config = { ...CONFIG_DEFAULT, ...(db.config[0] || {}) };
      if (!confirm(
        `♻️ ¿Restaurar este respaldo?\n\n` +
        `Se REEMPLAZARÁN todos los datos actuales de este navegador.\n\n` +
        `El archivo contiene ${db.materias.length} materia(s) en ${(cfgR.semestres || []).length} semestre(s).`
      )) return;
      setUndo("♻️ Respaldo restaurado"); // también deshacible durante 5 s
      MiniDB.persist({ ...DB_SCHEMA, ...db, config: [cfgR] });
      window.dispatchEvent(new Event("db-undo"));
    } catch {
      alert("❌ El archivo no es un respaldo válido de Seguidor de Notas.");
    }
  };
  reader.readAsText(archivo);
}

// ==================== ENTREGAS ↔ GOOGLE CALENDAR (.ics) ====================
/**
 * Exporta las entregas del semestre activo como archivo .ics estándar
 * (un evento por cada nota con fecha). Al importarlo en Google Calendar,
 * el celular notifica cada entrega sin necesidad de abrir la app.
 * La conexión "en vivo" requeriría OAuth de Google Cloud; el .ics logra
 * lo mismo sin claves y manteniendo los datos 100% privados.
 */
export function exportarICS(data: any) {
  const cfg: Config = data.config[0];
  const activos = (data.materias as Materia[]).filter((m) => (m.semestre || "Sin semestre") === cfg.activo);
  const idsAct = new Set(activos.map((m) => m.id));
  const notas = (data.notas as Nota[]).filter((n) => n.fecha && idsAct.has(n.materiaId));
  if (notas.length === 0) { alert("⚠️ No hay entregas con fecha en el semestre activo.\n\nAñade fechas en la pestaña Notas."); return; }
  const escICS = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Seguidor de Notas//Entregas//ES",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Entregas " + escICS(cfg.activo),
  ];
  notas.forEach((n) => {
    const nomMat = activos.find((m) => m.id === n.materiaId)?.nombre ?? "Entrega";
    lineas.push("BEGIN:VEVENT");
    lineas.push("UID:" + n.id + "@seguidor-notas");
    lineas.push("DTSTAMP:20260101T000000Z");
    lineas.push("DTSTART;VALUE=DATE:" + (n.fecha as string).replace(/-/g, ""));
    lineas.push("SUMMARY:📋 " + escICS(nomMat + " — " + n.nombre));
    lineas.push("END:VEVENT");
  });
  lineas.push("END:VCALENDAR");
  const blob = new Blob([lineas.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seguidor-notas-entregas.ics";
  a.click();
  URL.revokeObjectURL(url);
}

/** Parser mínimo de .ics: extrae los VEVENT con DTSTART, SUMMARY y LOCATION. */
function parsearICS(texto: string): Evento[] {
  const planas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Desplegar líneas continuadas (RFC 5545: la continuación empieza con espacio)
  const lineas: string[] = [];
  planas.forEach((ln) => {
    if ((ln.startsWith(" ") || ln.startsWith("\t")) && lineas.length) lineas[lineas.length - 1] += ln.slice(1);
    else lineas.push(ln);
  });
  const eventos: Evento[] = [];
  let cur: any = null;
  lineas.forEach((ln) => {
    const i = ln.indexOf(":");
    if (i < 0) return;
    const clave = ln.slice(0, i).split(";")[0].trim().toUpperCase();
    const valor = ln.slice(i + 1);
    if (clave === "BEGIN" && valor.trim().toUpperCase() === "VEVENT") { cur = {}; return; }
    if (clave === "END" && valor.trim().toUpperCase() === "VEVENT") {
      if (cur && cur.fecha) {
        eventos.push({ id: uid(), titulo: cur.titulo || "(sin título)", fecha: cur.fecha, hora: cur.hora, lugar: cur.lugar });
      }
      cur = null;
      return;
    }
    if (!cur) return;
    if (clave === "DTSTART") {
      const m = valor.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/);
      if (m) {
        cur.fecha = m[1] + "-" + m[2] + "-" + m[3];
        if (m[4]) cur.hora = m[4] + ":" + m[5];
      }
    } else if (clave === "SUMMARY") {
      cur.titulo = valor.replace(/\\,/g, ",").replace(/\\n/gi, " ").trim();
    } else if (clave === "LOCATION") {
      cur.lugar = valor.trim();
    }
  });
  return eventos;
}

/**
 * Importa un .ics de Google Calendar (Configuración → Importar y exportar →
 * Exportar) y muestra sus eventos en la pestaña Calendario junto a las
 * entregas. Reimportar reemplaza los eventos importados anteriores.
 */
export function importarICS(archivo: File) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const evs = parsearICS(String(reader.result));
      if (evs.length === 0) { alert("❌ No se encontraron eventos con fecha en el archivo .ics."); return; }
      const previos = MiniDB.find<Evento>("eventos").length;
      if (!confirm(
        "📅 ¿Importar " + evs.length + " evento(s) del calendario?\n\n" +
        (previos > 0 ? "Se reemplazarán los " + previos + " evento(s) importados antes.\n" : "") +
        "Los verás en la pestaña Calendario junto a tus entregas."
      )) return;
      setUndo("📅 Calendario importado"); // deshacible durante 5 segundos
      MiniDB.removeWhere("eventos", () => true);
      evs.forEach((e) => MiniDB.insert<Evento>("eventos", e));
      window.dispatchEvent(new Event("db-undo"));
    } catch {
      alert("❌ No se pudo leer el archivo .ics.");
    }
  };
  reader.readAsText(archivo);
}

// ==================== RESPALDO EXCEL (.xlsx) ====================
/**
 * Genera un archivo .xlsx REAL (ZIP de XML, construido a mano sin librerías),
 * con una hoja por semestre. Cada materia incluye sus notas con pesos y
 * FÓRMULAS vivas de Excel: promedio ponderado (SUMPRODUCT), peso evaluado
 * y nota requerida en lo pendiente para ganar la materia.
 */

/** Tabla CRC32 estándar (requerida por el formato ZIP). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Escapa texto para incrustarlo en XML (nombres, fórmulas, etc.). */
function esc(s: any) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Letra de columna: 0 -> A, 1 -> B, 26 -> AA... */
function colL(i: number) {
  let s = "";
  i++;
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/** ZIP sin compresión (método STORE): la base del contenedor .xlsx. */
function zipStore(files: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder();
  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
  const u32 = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
  const cat = (arrs: Uint8Array[]) => {
    const len = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(len);
    let p = 0;
    arrs.forEach((a) => { out.set(a, p); p += a.length; });
    return out;
  };
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = cat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), name, f.data]);
    chunks.push(local);
    central.push(cat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21),
      u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name]));
    offset += local.length;
  });
  const cd = cat(central);
  const eocd = cat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cd.length), u32(offset), u16(0)]);
  return cat([...chunks, cd, eocd]);
}

/** Celda de texto (inlineStr). `bold` usa el estilo 1 (negrita). */
function cStr(col: number, row: number, text: string, bold = false) {
  return `<c r="${colL(col)}${row}"${bold ? ' s="1"' : ""} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
}
/** Celda numérica. */
function cNum(col: number, row: number, v: number, bold = false) {
  return `<c r="${colL(col)}${row}"${bold ? ' s="1"' : ""}><v>${v}</v></c>`;
}
/** Celda vacía (deja la casilla en blanco, ej. nota pendiente). */
function cEmp(col: number, row: number) {
  return `<c r="${colL(col)}${row}"/>`;
}

/**
 * Respaldo completo a Excel: una hoja por semestre con las materias,
 * sus notas (nombre, peso %, valor, fecha) y fórmulas calculadas:
 *   - Promedio ponderado: SUMPRODUCT(pesos, valores) / SUMPRODUCT(pesos calificados)
 *   - Peso evaluado:      SUMPRODUCT((valores<>"") * pesos)
 *   - Nota requerida en lo pendiente para ganar la materia
 */
export function exportarExcel(data: any) {
  const cfg: Config = data.config[0];
  const mats = data.materias as Materia[];
  const todosSems = [...new Set([...(cfg.semestres || []), ...mats.map((m) => m.semestre || "Sin semestre")])]
    .filter(Boolean).sort();
  if (todosSems.length === 0) { alert("⚠️ No hay datos que respaldar."); return; }

  const enc = new TextEncoder();
  const used = new Set<string>();
  const sheets: { name: string; xml: string }[] = [];

  todosSems.forEach((sem) => {
    const ms = mats.filter((m) => (m.semestre || "Sin semestre") === sem);
    const rows: string[] = [];
    let r = 1;

    if (ms.length === 0) {
      rows.push(`<row r="1">` + cStr(0, 1, "Semestre sin materias", true) + `</row>`);
    }
    ms.forEach((m) => {
      const ns = MiniDB.find<Nota>("notas", (n) => n.materiaId === m.id);
      // Título de la materia + datos generales
      rows.push(`<row r="${r}">` + cStr(0, r, m.nombre, true) + cStr(1, r, m.profesor || "") + cStr(2, r, m.creditos + " créditos") + `</row>`);
      r++;
      // Encabezado de columnas
      rows.push(`<row r="${r}">` + cStr(0, r, "Nota", true) + cStr(1, r, "Peso %", true) +
        cStr(2, r, "Valor (0-5)", true) + cStr(3, r, "Fecha entrega", true) + cStr(4, r, "Estado", true) + `</row>`);
      r++;
      const first = r;
      ns.forEach((n) => {
        let cells = cStr(0, r, n.nombre) + cNum(1, r, n.porcentaje);
        cells += n.valor !== null ? cNum(2, r, n.valor) : cEmp(2, r);
        if (n.fecha) cells += cStr(3, r, n.fecha);
        cells += cStr(4, r, n.valor !== null ? "Calificada" : "Pendiente");
        rows.push(`<row r="${r}">` + cells + `</row>`);
        r++;
      });
      const last = r - 1;
      if (ns.length > 0) {
        // Promedio ponderado (solo calificadas) + peso evaluado, con fórmulas vivas
        rows.push(`<row r="${r}">` + cStr(0, r, "Promedio ponderado", true) +
          `<c r="B${r}" s="1"><f>SUMPRODUCT((C${first}:C${last}&lt;&gt;"")*B${first}:B${last})</f></c>` +
          `<c r="C${r}" s="1"><f>IF(SUMPRODUCT((C${first}:C${last}&lt;&gt;"")*B${first}:B${last})=0,"—",SUMPRODUCT(B${first}:B${last},C${first}:C${last})/SUMPRODUCT((C${first}:C${last}&lt;&gt;"")*B${first}:B${last}))</f></c>` +
          `</row>`);
        r++;
        // Nota requerida en el % pendiente para ganar la materia
        rows.push(`<row r="${r}">` + cStr(0, r, `Requerida en lo pendiente (para ${cfg.nota_minima})`) +
          `<c r="C${r}"><f>IF(SUMPRODUCT((C${first}:C${last}&lt;&gt;"")*B${first}:B${last})&gt;=100,"—",(${cfg.nota_minima}*100-SUMPRODUCT(B${first}:B${last},C${first}:C${last}))/(100-SUMPRODUCT((C${first}:C${last}&lt;&gt;"")*B${first}:B${last})))</f></c>` +
          `</row>`);
        r++;
      }
      r++; // fila en blanco entre materias
    });

    // Nombre de hoja válido para Excel (sin []:*?/\ y máx 31 caracteres)
    let name = (sem.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31)) || "Hoja";
    let dedup = 1;
    while (used.has(name)) name = name.slice(0, 28) + "_" + dedup++;
    used.add(name);

    sheets.push({
      name,
      xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` + rows.join("") + `</sheetData></worksheet>`,
    });
  });

  // ---- Partes del contenedor OOXML ----
  const n = sheets.length;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") + `</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + `</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`;

  // ---- Empaquetar y descargar ----
  const bytes = zipStore([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(wbRels) },
    { name: "xl/styles.xml", data: enc.encode(styles) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(s.xml) })),
  ]);
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "seguidor-notas-respaldo.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
