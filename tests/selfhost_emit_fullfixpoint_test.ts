// The FULL-SOURCE self-hosting fixpoint — gcc-style stage2 == stage3, the bootstrap
// capstone.
//
// `selfhost_emit_fixpoint_test.ts` (always-run) proves M_self emits the 14 toy
// golden programs byte-for-byte — the emitter's correctness on the coverage matrix.
// This test proves the STRONGEST rung on the single largest real input there is, the
// compiler ITSELF:
//
//   X            = the compiler's own source (lexer + ast + parser + wasmEmit)
//   host_bytes(X)= B_T.runEmitFull()    — X emitted by the HOST-compiled emitter
//                  (B_T = toWasm.ts(T_full), T_full = X + a tiny entry point)
//   M_self       = B_T's self-emission of T_full (the self-emitted emitter, ~1.2 MB)
//   self_bytes(X)= M_self.runEmitFull()  — X emitted by the SELF-EMITTED emitter
//
//   assert self_bytes(X) == host_bytes(X), byte-for-byte, and both instantiate.
//
// In gcc-bootstrap terms: stage1 = toWasm.ts; stage2 = the emitter it compiles
// (`B_T`); stage3 = the emitter stage2 emits (`M_self`). stage2 and stage3 producing
// IDENTICAL bytes for X is the canonical fixed-point proof — it exercises the
// large-magnitude LEB128 / section-size encodings (function counts in the hundreds,
// multi-kilobyte section bodies) that the toy goldens never reach.
//
// COST: building M_self embeds X (~402 K code points) as wasm `i32.const` runs, so it
// needs two heavy host compiles (~50 s + ~64 s) of ~0.8 M / ~1.2 M-char sources. That
// is far too slow for the default suite, so this test is GATED behind
// `SELFHOST_FULL_FIXPOINT=1` and otherwise reported as ignored. Run it on demand or in
// a dedicated lane:
//
//   SELFHOST_FULL_FIXPOINT=1 deno test -A tests/selfhost_emit_fullfixpoint_test.ts
//
// Mechanism mirrors `selfhost_emit_fixpoint_test.ts`: the self-emitted module has no
// `print` import and `emitProgram` lowers only functions + module globals, so M_self
// is driven through `export function`s (`runEmitFull` / `rbyteLen` / `rbyteAt`) and its
// WasmGC byte buffer read back one byte at a time. The ~0.8 M-char T_full is
// reconstructed at runtime from <9000-char chunks (a single literal that big overflows
// `array.new_fixed`'s 10000-operand engine limit).

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const RUN = !!Deno.env.get("SELFHOST_FULL_FIXPOINT");

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// Same lexer-rename glue as the rest of the self-host suite.
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// X = the compiler's own source: the program M_self must re-emit.
const X = lexer + "\n" + ast + "\n" + parser + "\n" + wasmEmit + "\n";

const CHUNK = 9000;
// Render `s` as a sequence of `parts.push("…")` statements over <9000-char chunks
// (a single literal that big overflows the 10000-operand `array.new_fixed` limit).
const chunkPushes = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += CHUNK) {
    out.push(`  parts.push(${JSON.stringify(s.slice(i, i + CHUNK))})`);
  }
  return out.join("\n");
};

// driverFull: reconstruct X from chunks and emit it via the real pipeline; expose the
// byte buffer for readback. `export function` so the host-compiled build exposes them;
// the self-host emitter exports every function regardless, so the same source drives
// both `B_T` and `M_self`.
const driverFull = `
export function rbyteLen(): i32 {
  W.bytes.length
}
export function rbyteAt(i: i32): i32 {
  W.bytes[i]
}
function buildX(): string {
  let parts: string[] = []
${chunkPushes(X)}
  let out = ""
  let i = 0
  while i < parts.length {
    out = out + parts[i]
    i = i + 1
  }
  out
}
function fxLoadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
export function runEmitFull(): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  W.bytes = []
  fnNames = []
  fnIndices = []
  localNames = []
  globalStmts = []
  globalNames = []
  let src = buildX()
  fxLoadToks(src)
  let root = parseProgram()
  emitProgram(root)
}
`;

// T_full = X plus the entry point. M_self = the self-emission of T_full. Its
// runEmitFull re-emits X (NOT T_full), so there is no quine regress.
const Tfull = X + driverFull;

// The outer (host-compiled) driver that reconstructs T_full from chunks, self-emits
// it, and prints the resulting module bytes as a `self: b0,b1,…` line.
const outerDriver = `
function buildT(): string {
  let parts: string[] = []
${chunkPushes(Tfull)}
  let out = ""
  let i = 0
  while i < parts.length {
    out = out + parts[i]
    i = i + 1
  }
  out
}
function fxLoad2(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
function drive(src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  W.bytes = []
  fnNames = []
  fnIndices = []
  localNames = []
  globalStmts = []
  globalNames = []
  fxLoad2(src)
  let root = parseProgram()
  print("NDIAG " + i32ToStr(P.diags.length))
  let rc = emitProgram(root)
  if rc < 0 {
    print("EMIT_ERR " + emitErr)
  } else {
    print("self: " + bytesToStr())
  }
  0
}
drive(buildT())
`;

const compileBase = async (source: string, what: string): Promise<Uint8Array> => {
  const { wasm, diagnostics } = await compileCached(source);
  const errs = diagnostics.filter((d) => d.severity === "error");
  if (errs.length > 0 || !wasm) {
    throw new Error(
      `full-fixpoint: ${what} failed to compile (host toolchain): ` +
        errs.map((d) => d.message).join("; "),
    );
  }
  return wasm;
};

// Instantiate a host-compiled emitter module and drive its `runEmitFull`, reading the
// emitted bytes back through `rbyteLen`/`rbyteAt`.
const driveFull = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const module = await WebAssembly.compile(bytes as BufferSource);
  const instance = await WebAssembly.instantiate(module, {});
  const exp = instance.exports as Record<string, (...a: number[]) => number>;
  for (const name of ["runEmitFull", "rbyteLen", "rbyteAt"]) {
    if (typeof exp[name] !== "function") {
      throw new Error(`full-fixpoint: module is missing the \`${name}\` export`);
    }
  }
  const rc = exp.runEmitFull();
  if (rc < 0) throw new Error(`full-fixpoint: runEmitFull returned ${rc}`);
  const len = exp.rbyteLen();
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) buf[i] = exp.rbyteAt(i);
  return buf;
};

// Memoized: compute host_bytes(X), self_bytes(X), and M_self's length ONCE (two heavy
// compiles), then share across the assertions below.
type Result = { host: Uint8Array; self: Uint8Array; mSelfLen: number };
let result: Promise<Result> | undefined;
const compute = (): Promise<Result> =>
  result ??= (async () => {
    // host_bytes(X): X emitted by the host-compiled emitter (B_T).
    const bT = await compileBase(Tfull, "B_T (host emitter)");
    const host = await driveFull(bT);

    // M_self: the host self-emission of T_full.
    const outer = await compileBase(X + outerDriver, "outer (M_self builder)");
    const { logs } = await runWasm(outer);
    const ndiag = logs.find((l) => l.startsWith("NDIAG "));
    if (ndiag && ndiag !== "NDIAG 0") {
      throw new Error(`full-fixpoint: self-emit parse diagnostics: ${ndiag}`);
    }
    const errLine = logs.find((l) => l.startsWith("EMIT_ERR "));
    if (errLine) throw new Error(`full-fixpoint: self-emit failed: ${errLine}`);
    const sl = logs.find((l) => l.startsWith("self: "));
    if (!sl) throw new Error("full-fixpoint: outer driver printed no `self:` bytes");
    const mSelf = new Uint8Array(
      sl.slice("self: ".length).split(",").map((s) => {
        const n = Number(s);
        if (!Number.isInteger(n) || n < 0 || n > 255) {
          throw new Error(`full-fixpoint: byte out of range in M_self: ${s}`);
        }
        return n;
      }),
    );

    // self_bytes(X): X emitted by the SELF-EMITTED emitter (M_self).
    const self = await driveFull(mSelf);
    return { host, self, mSelfLen: mSelf.length };
  })();

const firstDiff = (a: Uint8Array, b: Uint8Array): number => {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
};

Deno.test({
  name:
    "full-fixpoint (stage2==stage3): M_self re-emits the whole compiler byte-identically to the host",
  ignore: !RUN,
  fn: async () => {
    const { host, self } = await compute();
    if (host.length === 0) throw new Error("host_bytes(X) is empty");
    const d = firstDiff(host, self);
    if (d !== -1) {
      throw new Error(
        `self_bytes(X) differs from host_bytes(X) at byte ${d} ` +
          `(host ${host.length}b, self ${self.length}b):\n` +
          `  host … ${[...host.slice(Math.max(0, d - 4), d + 5)].join(", ")} …\n` +
          `  self … ${[...self.slice(Math.max(0, d - 4), d + 5)].join(", ")} …`,
      );
    }
  },
});

Deno.test({
  name: "full-fixpoint: self_bytes(X) is a valid, instantiable wasm module",
  ignore: !RUN,
  fn: async () => {
    const { self } = await compute();
    await WebAssembly.instantiate(await WebAssembly.compile(self as BufferSource), {});
  },
});
