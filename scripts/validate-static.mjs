import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pages = ["index.html", "dashboard.html", "administracion.html"];
let failures = 0;

function fail(message) {
  failures += 1;
  console.error("ERROR:", message);
}

function checkJavaScript(source, label, module = true) {
  const args = module
    ? ["--check", "--input-type=module"]
    : ["--check", "--input-type=commonjs"];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    input: source,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`JavaScript inválido en ${label}:\n${result.stderr || result.stdout}`);
  } else {
    console.log("OK JavaScript:", label);
  }
}

for (const page of pages) {
  const absolute = path.join(root, page);
  if (!fs.existsSync(absolute)) {
    fail(`No existe la página requerida: ${page}`);
    continue;
  }

  const html = fs.readFileSync(absolute, "utf8");
  const ids = new Set();

  for (const match of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    const id = match[1];
    if (ids.has(id)) fail(`${page}: ID duplicado "${id}"`);
    ids.add(id);
  }

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = match[1];
    const source = match[2].trim();
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];

    if (src) {
      if (!/^(https?:|data:|\/\/)/i.test(src)) {
        const localPath = path.resolve(root, src.split(/[?#]/)[0]);
        if (!fs.existsSync(localPath)) fail(`${page}: no existe el script ${src}`);
        else {
          const scriptSource = fs.readFileSync(localPath, "utf8");
          checkJavaScript(scriptSource, src, true);
        }
      }
    } else if (source) {
      checkJavaScript(source, `${page} (script inline)`, /\btype\s*=\s*["']module["']/i.test(attrs));
    }
  }

  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const resource = match[1];
    if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/|#)/i.test(resource)) continue;
    const localPath = path.resolve(root, resource.split(/[?#]/)[0]);
    if (!fs.existsSync(localPath)) fail(`${page}: no existe el recurso local ${resource}`);
  }

  console.log("OK HTML:", page, `(${ids.size} IDs únicos)`);
}

if (failures) {
  console.error(`Validación finalizada con ${failures} error(es).`);
  process.exit(1);
}
console.log("Validación estática completada sin errores.");
