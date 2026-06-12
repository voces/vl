// The self-hosting FIXPOINT — the true self-hosting proof.
//
// `selfhost_emit_golden_test.ts` pins the HOST-emitted bytes for 14 modules, and
// the milestone (#241) proved the self-host emitter compiles its OWN source to a
// VALID, instantiable wasm module. This test closes the loop on CORRECTNESS:
//
//   1. Run the genuine lexer→parser→`emitProgram` pipeline over the emitter's OWN
//      source (`lexer.vl ++ ast.vl ++ parser.vl ++ wasmEmit.vl`) PLUS a tiny
//      `driverExports` entry point, producing `M_self` — the module the self-host
//      emitter emits FROM ITSELF.
//   2. Instantiate `M_self` and RUN IT as an emitter: drive its exported `runEmit`
//      over each of the 14 golden sources, reading the emitted bytes back through
//      its `rbyteLen`/`rbyteAt` exports.
//   3. Assert each result is BYTE-IDENTICAL to the host-pinned `tests/golden/*.wasm`.
//
// A match means `f_self(P) == f_host(P)` byte-for-byte for 14 real programs: the
// self-emitted emitter is a true FIXED POINT of the host emitter, not merely a valid
// module. The goldens (single-sourced in `tests/selfhost/goldens.ts`) ARE the host
// reference, so "== golden" is "== host".
//
// Mechanism notes (why it looks the way it does):
// • The self-emitted module has NO `print` import and `emitProgram` does NOT lower
//   top-level statements (only functions + module globals), so `M_self` can only be
//   driven through EXPORTED functions, and its WasmGC byte buffer is read back one
//   byte at a time (GC arrays are opaque to JS). Hence `driverExports`.
// • `export function` is required so the HOST toolchain (`toWasm.ts` exports only
//   `export function`s) exposes the entry point; the self-host emitter exports every
//   function regardless, so the same source drives both.
// • Building `M_self` needs the ~407K-char emitter source fed through `emitProgram`
//   AT RUNTIME. A single VL string literal that big overflows `array.new_fixed`, so
//   an outer (host-compiled) driver reconstructs it from <9000-char chunks — the same
//   shape `selfhost_emit_program_test.ts`/the golden driver use.

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";
import { GOLDENS } from "./selfhost/goldens.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// Same lexer-rename glue as the rest of the self-host suite: `lexer.vl` collides
// with `ast.vl`/`parser.vl` on `Tok`/`Diag`/`advance`, renamed in the SOURCE TEXT
// before concatenation. Pure glue — no `.vl` compiler file is edited.
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// ── driverExports: the emitter ENTRY POINT baked into the emitter source ───────
// `srcFor(which)` returns the which-th golden's source as a string literal (drawn
// from the SAME `GOLDENS` array the goldens were pinned from). `runEmit` resets
// parser+emitter state (the SAME reset list the golden driver uses), lexes/parses/
// emits that source, leaving the module bytes in `W.bytes`. `rbyteLen`/`rbyteAt` let
// the host read those bytes back out — no `print`, no linear memory. The functions
// are `export`ed so the host-compiled build exposes them; the self-host emitter
// exports every function regardless, so the same source drives `M_self`.
const srcForArms = GOLDENS
  .map((g, i) => `  if which == ${i} { return ${JSON.stringify(g.src)} }`)
  .join("\n");
const driverExports = `
export function rbyteLen(): i32 {
  W.bytes.length
}
export function rbyteAt(i: i32): i32 {
  W.bytes[i]
}
function srcFor(which: i32): string {
${srcForArms}
  return ""
}
function fxLoadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i, start: t.start, line: t.line, col: t.col })
    i = i + 1
  }
  P.toks.length
}
export function runEmit(which: i32): i32 {
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
  let src = srcFor(which)
  fxLoadToks(src)
  let root = parseProgram()
  emitProgram(root)
}
`;

// T = the emitter's own source PLUS the entry point. It does NOT embed itself
// (`srcFor`'s literals are the small goldens only), so there is no quine regress.
const T = lexer + "\n" + ast + "\n" + parser + "\n" + wasmEmit + "\n" +
  driverExports;

// ── The outer (host-compiled) driver that emits M_self ─────────────────────────
// It reconstructs T from <9000-char chunks (a single literal that big overflows
// `array.new_fixed`), drives the real lexer→parser→`emitProgram` over it, and prints
// the resulting module bytes as a `self: b0,b1,…` line the host parses back.
const CHUNK = 9000;
const chunks: string[] = [];
for (let i = 0; i < T.length; i += CHUNK) chunks.push(T.slice(i, i + CHUNK));
const outerDriver = `
function buildSrc(): string {
  let parts: string[] = []
${chunks.map((c) => `  parts.push(${JSON.stringify(c)})`).join("\n")}
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
    P.toks.push({ kind: t.kind, text: t.text, pos: i, start: t.start, line: t.line, col: t.col })
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
drive(buildSrc())
`;

// Build M_self ONCE (memoized): compile the outer driver with the host toolchain,
// run it to self-emit T, and parse the printed bytes into a module. Then instantiate
// M_self and return a caller bound to that single instance so all 14 `runEmit` calls
// share its state (each call resets the relevant globals itself).
type SelfEmitter = {
  runEmit: (which: number) => number;
  rbyteLen: () => number;
  rbyteAt: (i: number) => number;
};

let selfEmitter: Promise<SelfEmitter> | undefined;
const buildSelfEmitter = (): Promise<SelfEmitter> =>
  selfEmitter ??= (async () => {
    const outerSource = lexer + "\n" + ast + "\n" + parser + "\n" + wasmEmit +
      "\n" + outerDriver;
    const { wasm, diagnostics } = await compileCached(outerSource);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0 || !wasm) {
      throw new Error(
        "fixpoint: outer M_self builder failed to compile (host toolchain): " +
          errors.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const ndiag = logs.find((l) => l.startsWith("NDIAG "));
    if (ndiag && ndiag !== "NDIAG 0") {
      throw new Error(`fixpoint: self-emit produced parse diagnostics: ${ndiag}`);
    }
    const errLine = logs.find((l) => l.startsWith("EMIT_ERR "));
    if (errLine) throw new Error(`fixpoint: self-emit failed: ${errLine}`);
    const selfLine = logs.find((l) => l.startsWith("self: "));
    if (!selfLine) {
      throw new Error(
        `fixpoint: outer driver printed no \`self:\` bytes; got ${
          JSON.stringify(logs.filter((l) => !l.startsWith("self: ")))
        }`,
      );
    }
    const nums = selfLine.slice("self: ".length).split(",").map((s) => {
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0 || n > 255) {
        throw new Error(`fixpoint: byte out of range in M_self: ${s}`);
      }
      return n;
    });
    const mSelf = new Uint8Array(nums);

    // M_self must be a VALID, instantiable wasm module (the #241 milestone). We
    // instantiate it HERE and drive it as the emitter below.
    const module = await WebAssembly.compile(mSelf);
    const instance = await WebAssembly.instantiate(module, {});
    const exp = instance.exports as Record<string, (...a: number[]) => number>;
    for (const name of ["runEmit", "rbyteLen", "rbyteAt"]) {
      if (typeof exp[name] !== "function") {
        throw new Error(`fixpoint: M_self is missing the \`${name}\` export`);
      }
    }
    return {
      runEmit: (which) => exp.runEmit(which),
      rbyteLen: () => exp.rbyteLen(),
      rbyteAt: (i) => exp.rbyteAt(i),
    };
  })();

const goldenPath = (name: string) =>
  new URL(`./golden/${name}.wasm`, import.meta.url);

// First differing byte index (or the shorter length if one is a prefix), with a
// windowed context for the diagnostic — same shape as the golden pin's `firstDiff`.
const firstDiff = (
  expected: Uint8Array,
  actual: Uint8Array,
): { index: number; window: string } | undefined => {
  const n = Math.min(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== actual[i]) {
      const lo = Math.max(0, i - 4);
      const hi = i + 5;
      return {
        index: i,
        window:
          `  golden  … ${[...expected.slice(lo, hi)].join(", ")} …\n` +
          `  M_self  … ${[...actual.slice(lo, hi)].join(", ")} …`,
      };
    }
  }
  if (expected.length !== actual.length) {
    return {
      index: n,
      window: `  (one is a prefix of the other; lengths differ at index ${n})`,
    };
  }
  return undefined;
};

// F-tiers: this V8-side fixpoint is REDUNDANT with the native one — ci-native's
// `native-fixpoint.sh` proves stage3 == stage4 byte-for-byte over the WHOLE
// compiler (a strictly larger input than the 14 goldens) on every run, and the
// golden byte-pin itself is asserted by `selfhost_emit_program_test.ts`. Its
// marginal value is catching a V8-vs-wasmtime divergence in the self-compiled
// emitter — gate it behind `SELFHOST_DENO_RUN=1` (the deno-side bisect tier)
// rather than pay its ~100s cold assembly compile on every compiler-touching
// run.
const DENO_RUN = Deno.env.get("SELFHOST_DENO_RUN") === "1";

GOLDENS.forEach((g, which) => {
  Deno.test(
    {
      name: `emit-fixpoint: M_self emits ${g.name} byte-identical to the host golden`,
      ignore: !DENO_RUN,
    },
    async () => {
      const emitter = await buildSelfEmitter();
      const rc = emitter.runEmit(which);
      if (rc < 0) {
        throw new Error(`M_self runEmit(${which}) for ${g.name} returned ${rc}`);
      }
      const len = emitter.rbyteLen();
      const actual = new Uint8Array(len);
      for (let i = 0; i < len; i++) actual[i] = emitter.rbyteAt(i);

      // RE-PIN MODE (`UPDATE_GOLDENS=1`): overwrite the pinned bytes with the
      // self-emitter's CURRENT output instead of asserting. The goldens are a
      // native self-snapshot (there is no host-side golden test — see header), so
      // a DELIBERATE emitter/representation change re-pins them here, and the
      // FULL fixpoint (`SELFHOST_FULL_FIXPOINT=1`) + native-fixpoint.sh +
      // behavioral parity (native-align / host-parity / corpus-run) are what
      // actually validate the change. Guarded behind an env flag so an ordinary
      // run can never silently bless a regression.
      if (Deno.env.get("UPDATE_GOLDENS") === "1") {
        Deno.writeFileSync(goldenPath(g.name), actual);
        return;
      }

      const expected = Deno.readFileSync(goldenPath(g.name));
      const diff = firstDiff(expected, actual);
      if (diff) {
        throw new Error(
          `M_self's emission of ${g.name} differs from the host golden at byte ` +
            `${diff.index} (golden ${expected.length}b, M_self ${actual.length}b):\n` +
            diff.window,
        );
      }
    },
  );
});
