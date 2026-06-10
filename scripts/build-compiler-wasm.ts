// Build the SELF-HOSTED VL compiler into a standalone wasm module
// (`build/vl-compiler.wasm`) — the brain of the native `vl` tool.
//
// The module is the five-module compiler (lexer → parser → typecheck → wasmEmit)
// compiled by the stage-0 (deno/toWasm.ts) toolchain, plus a thin source-in /
// bytes-out driver the host embeds against:
//
//   srcReset() / srcPush(cp)   — stream a source file in, one code point at a time
//   compileSrc() -> rc          — 0 ok; 1 lex/parse, 2 typecheck, 3 emit failure
//   rbyteLen() / rbyteAt(i)     — read the emitted wasm module back out
//   diagLen() / diagAt(i)       — the failure diagnostics (newline-joined)
//
// The host side is `scripts/vl-host` (Rust + wasmtime): a thin OS adapter — argv,
// file I/O, stdout, and the engine embedding. ALL compiler logic lives here, in
// the VL-written wasm; the adapter never parses or types anything.
//
//   deno run -A scripts/build-compiler-wasm.ts [-o build/vl-compiler.wasm]

import { compileCached } from "../tests/_selfhost_cache.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// The same lexer-rename glue the self-host test suite uses (the lexer's private
// `Tok`/`Diag`/`advance` collide with ast.vl's across the concatenation).
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// The driver is SINGLE-SOURCED in `vl-compiler-driver.vl` (the native-fixpoint
// script appends the same file with cat), so the seed compiler and a
// self-rebuilt compiler expose the identical surface.
const driver = read("./vl-compiler-driver.vl");

const outFlag = Deno.args.indexOf("-o");
const outPath = outFlag >= 0
  ? Deno.args[outFlag + 1]
  : "build/vl-compiler.wasm";
// A RELATIVE -o resolves against the repo root (the script's parent), so the
// default lands in `<repo>/build/` from any cwd; an absolute path is used as-is.
const outUrl = outPath.startsWith("/")
  ? new URL("file://" + outPath)
  : new URL("../" + outPath, import.meta.url);

const { wasm, diagnostics } = await compileCached(
  lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" + wasmEmit +
    "\n" + driver + "\n",
);
const errs = diagnostics.filter((d) => d.severity === "error");
if (errs.length > 0 || !wasm) {
  console.error(
    "build-compiler-wasm: stage-0 compile failed: " +
      errs.map((d) => d.message).slice(0, 5).join("; "),
  );
  Deno.exit(1);
}
await Deno.mkdir(new URL(".", outUrl), { recursive: true }).catch(() => {});
Deno.writeFileSync(outUrl, wasm);
console.log(`wrote ${outPath} (${wasm.length} bytes)`);
