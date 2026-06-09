// The RUNTIME corpus oracle for the self-hosted compiler (tier 2 of corpus
// conformance — see `tests/selfhost_corpus_test.ts` for tier 1, verdict-only).
//
// Tier 1 proves the VL front end AGREES with the spec about which programs are
// valid. THIS tier proves the full VL pipeline produces wasm that BEHAVES like the
// spec says: each whitelisted `@run` corpus file is lexed, parsed, type-checked,
// and EMITTED by the VL compiler (`lexer.vl → parser.vl → typecheck.vl →
// wasmEmit.vl`), the emitted module is instantiated with the host's `print` import
// family, its top-level statements run via the wasm START function, and the
// captured logs must EQUAL the file's ordered `@log` directives — the runtime
// VL≡TS oracle (the TS host runs the same files in `cases_test.ts`).
//
// Print contract (docs/selfhost-print-emit-plan.md): the emitted module imports
// `__print_i32__`/`__print_bool__`/`__print_char__`/`__print_str_flush__` from the
// `"imports"` module — exactly what the host's `runWasm` provides — occupying wasm
// function indices 0..3 (every local function shifts by 4; a print-free program
// emits NO import section, which is why the byte-exact goldens are unaffected).
//
// COMPILE-ONCE + CRASH ISOLATION: the whole pipeline compiles once; each file runs
// through an exported `runOne(idx)` (returning a stage code) so a file that traps
// the emitter is isolated, and the emitted bytes are read back per byte through
// `rbyteLen`/`rbyteAt` (GC arrays are opaque to JS).
//
// GROWING THE WHITELIST: re-run the runtime sweep as the emitter/checker/parser
// gain coverage and promote newly-passing files. Current buckets of the 304 @run
// files: 28 PASS; 70 emit gaps (lambdas/for-in/…), 77 checker false-rejects, 76 parse
// gaps, 28 scratch-needing top-level statements (emit validly only inside
// functions today), 11 emitter traps (real bugs to pin), 4 log diffs (bool prints
// as 1/0 — needs bool-ness threading per the plan's step 3).

import { compileCached } from "./_selfhost_cache.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// @run files whose VL-emitted wasm runs with logs EQUAL to their @log directives.
const WHITELIST = [
  "arith/literal-add.vl",
  "arith/ops.vl",
  "arith/typed-add.vl",
  "arrays/basics.vl",
  "chars/literals.vl",
  "functions/calls.vl",
  "functions/forward-call-inferred.vl",
  "functions/forward-reference-needs-return-type.vl",
  "functions/forward-reference-struct-param.vl",
  "functions/forward-reference.vl",
  "functions/mutual-recursion-struct-param.vl",
  "functions/return-then-statement-same-line.vl",
  "functions/struct-param-mutual-recursion-global.vl",
  "functions/trailing-comma-params.vl",
  "functions/unused-param-inline-call.vl",
  "lexer/soft-keywords-as-function-names.vl",
  "lexer/soft-keywords-as-identifiers.vl",
  "lint/called-function-no-warn.vl",
  "lint/mutual-recursion-no-warn.vl",
  "lint/reachable-no-warn.vl",
  "loops/for-range-bound-named-step.vl",
  "loops/for-step.vl",
  "loops/for-sum.vl",
  "loops/while-sum.vl",
  "statements/discarded-call-return.vl",
  "statements/struct-call-as-statement.vl",
  "variables/definite-assign-initialized-ok.vl",
  "variables/let-reassign-ok.vl",
];

type Entry = { rel: string; src: string; logs: string[] };
const entries: Entry[] = WHITELIST.map((rel) => {
  const src = Deno.readTextFileSync(new URL("./cases/" + rel, import.meta.url));
  const logs = [...src.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);
  return { rel, src, logs };
});

const driver = `
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i })
    i = i + 1
  }
  P.toks.length
}
function srcOf(idx: i32): string {
${entries.map((f, i) => `  if idx == ${i} { return ${JSON.stringify(f.src)} }`).join("\n")}
  return ""
}
export function runOne(idx: i32): i32 {
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
  initChecker()
  loadToks(srcOf(idx))
  let root = parseProgram()
  if P.diags.length > 0 { return 1 }
  let nerr = i32ToStr(checkProgram(root))
  if T.diags.length > 0 { return 2 }
  let rc = emitProgram(root)
  if rc < 0 { return 3 }
  0
}
export function rbyteLen(): i32 { W.bytes.length }
export function rbyteAt(i: i32): i32 { W.bytes[i] }
`;

// Compile the pipeline ONCE (memoized); per test, runOne + readback + instantiate.
let pipeline: Promise<Record<string, (...a: number[]) => number>> | undefined;
const getPipeline = (): Promise<Record<string, (...a: number[]) => number>> =>
  pipeline ??= (async () => {
    const source = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" +
      wasmEmit + "\n" + driver + "\n";
    const { wasm, diagnostics } = await compileCached(source);
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length > 0 || !wasm) {
      throw new Error(
        "corpus-run driver failed to compile: " +
          errs.map((d) => d.message).join("; "),
      );
    }
    const inst = await WebAssembly.instantiate(await WebAssembly.compile(wasm), {});
    return inst.exports as Record<string, (...a: number[]) => number>;
  })();

entries.forEach((e, idx) => {
  Deno.test(`corpus-run: ${e.rel} — VL-emitted wasm logs match @log`, async () => {
    const exp = await getPipeline();
    const st = exp.runOne(idx);
    if (st !== 0) {
      const stage = ["", "parse", "typecheck", "emit"][st] ?? String(st);
      throw new Error(`${e.rel}: VL pipeline failed at ${stage}`);
    }
    const len = exp.rbyteLen();
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) bytes[j] = exp.rbyteAt(j);

    const got: string[] = [];
    const chars: number[] = [];
    const mod = await WebAssembly.compile(bytes);
    const inst = await WebAssembly.instantiate(mod, {
      imports: {
        __print_i32__: (v: number) => got.push(String(v)),
        __print_bool__: (v: number) => got.push(v ? "true" : "false"),
        __print_char__: (c: number) => chars.push(c),
        __print_str_flush__: () => {
          got.push(String.fromCodePoint(...chars));
          chars.length = 0;
        },
      },
    });
    // Top-level statements ran via the START function at instantiation; a `main`
    // export (if the file defines one) is NOT auto-called by the corpus contract.
    void inst;
    if (JSON.stringify(got) !== JSON.stringify(e.logs)) {
      throw new Error(
        `${e.rel}: log mismatch\n  want ${JSON.stringify(e.logs)}\n  got  ${
          JSON.stringify(got)
        }`,
      );
    }
  });
});
