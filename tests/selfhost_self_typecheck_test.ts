// VL TYPECHECKS VL — the self-hosting typechecker rung.
//
// The full-source emitter fixpoint (`selfhost_emit_fullfixpoint_test.ts`) proves the
// self-emitted EMITTER re-emits `lexer + ast + parser + wasmEmit` byte-identically.
// This test proves the companion property for the TYPE CHECKER: the self-hosted
// `lexer.vl → parser.vl → typecheck.vl` pipeline, running as wasm, typechecks the
// compiler's ENTIRE own source (all five modules — including `typecheck.vl` itself)
// with ZERO diagnostics. A single false positive here means the self-hosted checker
// would reject valid VL — including the compiler — so this is the bootstrap gate for
// putting the type checker in the self-compile loop.
//
// COST: one heavy host compile of the ~0.9 M-char five-module pipeline, plus a wasm
// run that re-lexes/parses/typechecks the same ~0.9 M-char source. Too slow for the
// default suite, so it is GATED behind `SELFHOST_FULL_FIXPOINT=1` (the same lane as
// the emitter fixpoint) and otherwise reported as ignored.

import { compileCached } from "./_selfhost_cache.ts";

const RUN = !!Deno.env.get("SELFHOST_FULL_FIXPOINT");

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// The same lexer-rename glue the rest of the self-host suite uses (the lexer's
// private `Tok`/`Diag`/`advance` would otherwise collide across the concatenation).
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");
const wasmEmit = read("../compiler/wasmEmit.vl");

// X' = the FULL compiler source the self-hosted pipeline must typecheck.
const Xp = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" + wasmEmit +
  "\n";

const CHUNK = 9000;
// Render `s` as `parts.push("…")` over <9000-char chunks (a single literal that big
// overflows `array.new_fixed`'s 10000-operand engine limit).
const chunkPushes = (s: string): string => {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += CHUNK) {
    out.push(`  parts.push(${JSON.stringify(s.slice(i, i + CHUNK))})`);
  }
  return out.join("\n");
};

// The driver: reconstruct X' from chunks, run the real lexer → parser → typecheck,
// and report the diagnostic counts (lex / parse / check) as one packed i32.
const driver = `
function buildX(): string {
  let parts: string[] = []
${chunkPushes(Xp)}
  let out = ""
  let i = 0
  while i < parts.length { out = out + parts[i] i = i + 1 }
  out
}
function scLoadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length { let t = r.tokens[i] P.toks.push({ kind: t.kind, text: t.text, pos: i }) i = i + 1 }
  P.toks.length
}
// Packed result: 1000000*stage + count. stage 1 = lexer diags, 2 = parse diags,
// 3 = check diags, 0 = clean (the pipeline typechecks the whole compiler).
export function selfCheck(): i32 {
  P.toks = [] P.nodes = [] P.diags = [] P.pos = 0
  initChecker()
  let src = buildX()
  let lr = tokenize(src)
  if lr.diags.length > 0 { return 1000000 + lr.diags.length }
  scLoadToks(src)
  let root = parseProgram()
  if P.diags.length > 0 { return 2000000 + P.diags.length }
  let nerr = i32ToStr(checkProgram(root))
  if T.diags.length > 0 { return 3000000 + T.diags.length }
  0
}
`;

let resultPromise: Promise<number> | undefined;
const selfCheckResult = (): Promise<number> =>
  resultPromise ??= (async () => {
    const { wasm, diagnostics } = await compileCached(
      lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" + wasmEmit +
        "\n" + driver + "\n",
    );
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length > 0 || !wasm) {
      throw new Error(
        "self-typecheck pipeline failed to compile: " +
          errs.map((d) => d.message).slice(0, 3).join("; "),
      );
    }
    const inst = await WebAssembly.instantiate(
      await WebAssembly.compile(wasm as BufferSource),
      {},
    );
    const exp = inst.exports as Record<string, (...a: number[]) => number>;
    return exp.selfCheck();
  })();

Deno.test({
  name:
    "self-typecheck: VL typechecks the whole compiler (lexer+ast+parser+typecheck+wasmEmit) with zero diagnostics",
  ignore: !RUN,
  fn: async () => {
    const code = await selfCheckResult();
    const stage = Math.floor(code / 1000000);
    const count = code % 1000000;
    // stage 0 = clean; any other stage carries the offending diagnostic count.
    if (stage !== 0 || count !== 0) {
      const where = ["emit", "lexer", "parse", "check"][stage] ?? "unknown";
      throw new Error(
        `self-hosted pipeline reported ${count} ${where} diagnostic(s) on the ` +
          `compiler's own source (expected a clean typecheck)`,
      );
    }
  },
});
