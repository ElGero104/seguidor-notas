// Build: compila src/main.tsx a docs/app.js (bundle minificado, sin Babel en runtime)
import { build } from "esbuild";
await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  outfile: "docs/app.js",
  minify: true,
  jsx: "transform",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  logLevel: "info",
});
console.log("docs/app.js generado");
