#!/usr/bin/env node
/**
 * Prueba las fórmulas puras de src/App.tsx: promedio ponderado, nota
 * requerida (calculo), días hasta entrega (diasHasta), color de estado
 * (estadoTxt) y el CRC32 del generador de Excel. Extrae las secciones del
 * código fuente, las compila con esbuild y ejecuta casos conocidos.
 *
 * Corre en el CI (node scripts/test-formulas.js) y también funciona local.
 * Si algo falla y hay un GH_TOKEN disponible, abre un issue con el error
 * completo para poder diagnosticar sin acceso a los logs.
 */
const { execSync, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");

/** Reporta un fallo por consola y, si puede, abriendo un issue en el repo. */
function reportar(titulo, detalle) {
  console.error("❌ " + titulo);
  console.error(detalle);
  if (process.env.GH_TOKEN && process.env.GITHUB_REPOSITORY) {
    const cuerpo = "Error al correr `scripts/test-formulas.js` en el CI.\n\n```\n" +
      String(detalle).slice(0, 60000) + "\n```\n\nNode " + process.version +
      " · commit " + (process.env.GITHUB_SHA || "?").slice(0, 7);
    try {
      execFileSync("gh", [
        "issue", "create",
        "--repo", process.env.GITHUB_REPOSITORY,
        "--title", titulo,
        "--body", cuerpo,
      ], { env: process.env, stdio: "ignore" });
      console.error("(issue creado con el detalle del error)");
    } catch (_) {
      console.error("(no se pudo crear el issue de diagnóstico)");
    }
  }
}

/** Si algo explota, reporta antes de salir. */
process.on("uncaughtException", (e) => {
  reportar("CI: prueba de fórmulas falló (excepción)", ((e && e.stack) || String(e)));
  process.exit(1);
});

/** Extrae el fragmento entre dos marcas de sección. */
function extraer(inicio, fin) {
  const i = src.indexOf(inicio);
  const j = src.indexOf(fin, i);
  if (i < 0 || j < 0) throw new Error("No se encontró la sección: " + inicio);
  return src.slice(i, j);
}

/** Extrae una función puntual por su firma (para funciones que viven en otra sección). */
function extraerFuncion(firma) {
  const i = src.indexOf(firma);
  const j = i < 0 ? -1 : src.indexOf("\n}", i);
  if (i < 0 || j < 0) throw new Error("No se encontró la función: " + firma);
  return src.slice(i, j + 2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "seguidor-test-"));

/** Compila un fragmento TS con esbuild y lo requiere, exportando funciones. */
function compilar(nombre, fragmento, exportar) {
  const ts = path.join(tmp, nombre + ".ts");
  const js = path.join(tmp, nombre + ".js");
  fs.writeFileSync(ts, fragmento + "\nmodule.exports = " + exportar + ";\n");
  try {
    execSync('npx --yes esbuild@0.24.0 "' + ts + '" --format=cjs --outfile="' + js + '"');
  } catch (e) {
    reportar("CI: esbuild falló compilando el fragmento " + nombre,
      "comando: npx --yes esbuild@0.24.0 \"" + ts + "\" --format=cjs --outfile=\"" + js + "\"\n\n" +
      String(e.message) + "\n--- stdout ---\n" + String(e.stdout || "") +
      "\n--- stderr ---\n" + String(e.stderr || ""));
    process.exit(1);
  }
  return require(js);
}

let fallos = 0;
const nombresFallos = [];
function check(nombre, cond) {
  if (cond) console.log("  OK " + nombre);
  else { console.error("  FALLO " + nombre); fallos++; nombresFallos.push(nombre); }
}

// ---------- Cálculos académicos ----------
// estadoTxt vive en la sección TEMA (DARK MODE), se extrae aparte.
const { promedio, calculo, diasHasta, estadoTxt } = compilar(
  "calculos",
  extraer("// ==================== CÁLCULOS ACADÉMICOS", "// ==================== TEMA (DARK MODE)") +
    "\n" + extraerFuncion("function estadoTxt"),
  "{ promedio, calculo, diasHasta, estadoTxt }"
);

const N = (id, valor, porcentaje) => ({ id, materiaId: "m1", nombre: "x", valor, porcentaje });

console.log("Promedio ponderado:");
check("3.5 y 4.0 con pesos iguales = 3.75", promedio([N("1", 3.5, 50), N("2", 4.0, 50)], "m1") === 3.75);
check("ignora las pendientes (valor null)", promedio([N("1", 4.0, 60), N("2", null, 40)], "m1") === 4.0);
check("ponderado 70/30: 3.0 y 5.0 = 3.6", Math.abs(promedio([N("1", 3.0, 70), N("2", 5.0, 30)], "m1") - 3.6) < 1e-9);
check("sin notas = null", promedio([], "m1") === null);
check("filtra por materia", promedio([N("1", 5, 100)], "otra") === null);

console.log("Cálculo de nota requerida:");
const c1 = calculo([N("1", 3.0, 50)], 3.0);
check("acumulado = 150", c1.acumulado === 150);
check("restante = 50", c1.restante === 50);
check("requerida = 3.0", Math.abs(c1.requerida - 3.0) < 1e-9);
check("máximo alcanzable = 4.0", Math.abs(c1.maximo - 4.0) < 1e-9);
const c2 = calculo([N("1", 4.5, 60), N("2", 5.0, 40)], 3.0);
check("todo evaluado: restante = 0", c2.restante === 0);
check("todo evaluado: requerida = null", c2.requerida === null);
check("máximo = nota final (4.7)", Math.abs(c2.maximo - 4.7) < 1e-9);
const c3 = calculo([N("1", 2.0, 80)], 3.0);
check("materia imposible: requerida > 5", c3.requerida > 5);

console.log("Días hasta fecha:");
const fmtLocal = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
check("mañana = 1", diasHasta(fmtLocal(new Date(Date.now() + 86400000))) === 1);
check("ayer = -1", diasHasta(fmtLocal(new Date(Date.now() - 86400000))) === -1);
check("sin fecha = null", diasHasta(undefined) === null);

console.log("Estado por nota:");
const cfgT = { dark: false, nota_minima: 3.0, nota_ok: 4.0, archivados: [], activo: "", semestres: [] };
const tT = { ok: "text-emerald-600" };
check("2.9 = pierde (roja)", estadoTxt(2.9, cfgT, tT) === "text-red-500 font-semibold");
check("3.0 = gana justo (ámbar)", estadoTxt(3.0, cfgT, tT) === "text-amber-500 font-semibold");
check("4.5 = sobresaliente (ok)", estadoTxt(4.5, cfgT, tT) === "text-emerald-600 font-semibold");

// ---------- Generador de Excel (.xlsx) ----------
const { crc32, colL, cStr, cNum } = compilar(
  "excel",
  extraer("// ==================== RESPALDO EXCEL (.xlsx)", "// ==================== RECURSOS POR MATERIA"),
  "{ crc32, colL, cStr, cNum }"
);

console.log("Generador de Excel:");
// Vector estándar: CRC32 de "123456789" es 0xCBF43926
check("crc32('123456789') = 0xCBF43926", crc32(new Uint8Array([49, 50, 51, 52, 53, 54, 55, 56, 57])) === 0xcbf43926);
check("crc32 vacío = 0", crc32(new Uint8Array(0)) === 0);
check("colL: 0=A, 25=Z, 26=AA, 27=AB", colL(0) === "A" && colL(25) === "Z" && colL(26) === "AA" && colL(27) === "AB");
check(
  "cStr celda de texto",
  cStr(0, 1, "Parcial") === '<c r="A1" t="inlineStr"><is><t xml:space="preserve">Parcial</t></is></c>'
);
check("cStr escapa & en XML", cStr(0, 1, "a&b").includes("a&amp;b"));
check("cNum celda numérica", cNum(1, 2, 4.5) === '<c r="B2"><v>4.5</v></c>');

console.log("");
if (fallos > 0) {
  reportar("CI: " + fallos + " prueba(s) de fórmulas fallaron",
    "Pruebas fallidas:\n" + nombresFallos.map((n) => "- " + n).join("\n"));
  process.exit(1);
}
console.log("✅ Todas las pruebas de fórmulas pasaron");
