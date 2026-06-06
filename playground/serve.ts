#!/usr/bin/env -S deno run -A
// Tiny static file server for the playground (ROADMAP E: "a tiny static file
// server is fine"). Serves playground/ over HTTP so index.html can load the ESM
// bundle with the right MIME type (a `file://` open won't run module scripts).
//
// Run via `deno task playground` (builds first, then serves) or directly:
//   deno run -A playground/serve.ts [--port 8000]

const HERE = new URL(".", import.meta.url);

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
  // Normalize and confine to the playground dir: strip the leading slash, default
  // to index.html, and resolve against HERE. `new URL` collapses `..`, and we
  // then verify the result is still under HERE so a crafted path can't escape.
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const target = new URL(rel, HERE);
  if (!target.href.startsWith(HERE.href)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const body = await Deno.readFile(target);
    return new Response(body, {
      headers: { "content-type": contentType(target.pathname) },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
};

console.error(`VL playground: http://localhost:${PORT}/`);
Deno.serve({ port: PORT }, handler);
