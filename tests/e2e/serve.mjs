import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

// Serves a published site at "/" and again at "/last-breath/", the way Pages serves it, so one
// server covers both places the site has to work. A missing file is a plain 404 with no fallback.
const [root = "site", port = "4173"] = process.argv.slice(2);
const base = resolve(root);
const mounts = ["/last-breath/", "/"];

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".dat": "application/octet-stream",
};

createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");
  const mount = mounts.find((prefix) => pathname.startsWith(prefix));
  const relative = decodeURIComponent(pathname.slice(mount?.length ?? 0)) || "index.html";
  const file = normalize(join(base, relative.endsWith("/") ? relative + "index.html" : relative));

  try {
    if (!mount || !file.startsWith(base + sep) || !(await stat(file)).isFile()) throw new Error("missing");
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  }
}).listen(Number(port), () => console.log(`serving ${base} on http://localhost:${port}`));
