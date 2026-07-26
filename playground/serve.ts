#!/usr/bin/env -S deno run -A
// Tiny static file server for the playground (ROADMAP E: "a tiny static file
// server is fine"). Serves playground/dist/ over HTTP so index.html can load the
// ESM bundle with the right MIME type (a `file://` open won't run module scripts).
//
// The web root is `playground/dist/` — the self-contained build output: the
// resolved `index.html`, the content-hashed entry points, the code-split chunks
// and the hashed compiler seed. That is exactly the directory a static host
// deploys, so what you see locally is what ships.
//
// It also sends the cache headers the scheme depends on (see assets.ts):
// content-hashed assets are `immutable` for a year, and `index.html` — the one
// un-hashed file, which POINTS AT the hashed names — is `no-cache`. Get that
// pairing backwards and a cached index.html pins a visitor to last week's
// bundle no matter how many hashed assets you ship.
//
// Run via `deno task playground` (builds first, then serves) or directly:
//   deno run -A playground/serve.ts [--port 8000]

import { cacheControl } from "./assets.ts";

const HERE = new URL(".", import.meta.url);
const ROOT = new URL("dist/", HERE);

const PORT = (() => {
  const i = Deno.args.indexOf("--port");
  return i !== -1 ? Number(Deno.args[i + 1]) : 8000;
})();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
};

const contentType = (path: string): string => {
  const dot = path.lastIndexOf(".");
  return (dot !== -1 && MIME[path.slice(dot)]) || "application/octet-stream";
};

const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  // Normalize and confine to the dist dir: strip the leading slash, default to
  // index.html, and resolve against ROOT. `new URL` collapses `..`, and we then
  // verify the result is still under ROOT so a crafted path can't escape.
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const target = new URL(rel, ROOT);
  if (!target.href.startsWith(ROOT.href)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const body = await Deno.readFile(target);
    return new Response(body, {
      headers: {
        "content-type": contentType(target.pathname),
        "cache-control": cacheControl(target.pathname),
      },
    });
  } catch {
    // A missing index.html means the bundle was never built — say so, rather
    // than a bare 404 that looks like the server is broken.
    if (rel === "index.html") {
      return new Response(
        "playground/dist/index.html is missing — run `deno task playground:build` first.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return new Response("not found", { status: 404 });
  }
};

console.error(`VL playground: http://localhost:${PORT}/`);
Deno.serve({ port: PORT }, handler);
