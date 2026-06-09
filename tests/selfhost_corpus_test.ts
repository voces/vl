// Corpus-driven conformance for the self-hosted front end (the DURABLE harness).
//
// The bespoke `selfhost_*` snippet tests drive hand-written programs through the VL
// pipeline — useful TDD while building `typecheck.vl`, but throwaway: the snippets
// duplicate coverage that already lives, implementation-agnostically, in the REAL
// corpus (`tests/cases/**/*.vl` + `@directive` comments). That corpus's own header
// promises it "will validate a future self-hosted compiler unchanged" — so it is the
// proper conformance vehicle, and the metric that actually measures "off TS": how
// many corpus files the VL self-host pipeline handles, growing monotonically to 100%.
//
// THIS harness drives a WHITELIST of corpus files through the VL pipeline
// (`lexer.vl -> parser.vl -> typecheck.vl`) and asserts VL's VERDICT matches the
// file's directive: a file with an `@error` directive must be REJECTED (>=1 parse or
// type diagnostic); any other file must be ACCEPTED (0 diagnostics). The directive is
// the oracle — no TS run, and no fragile message-text comparison (VL's diagnostic
// WORDING differs from TS's; aligning text + position is a later milestone that needs
// source-span threading). Verdict agreement is the first, honest rung.
//
// SCOPE TODAY (typecheck only): no emit, no `@run` log cross-check. The VL emitter
// can't yet emit `print` (so the 310 `@run` files can't run through VL), and the AST
// carries no source positions (so `@error-at L:C` isn't matchable). Those unlock the
// next rungs (print emission; span threading). For now the whitelist is the subset of
// corpus files where the VL front end PARSES + TYPE-CHECKS and agrees with the spec.
//
// LEDGER: 50 corpus files conform (19 genuine front-end rejections + 31 clean
// programs accepted with zero diagnostics), across arith / conditionals / loops /
// variables / globals / functions / types / objects / arrays / operators / literals.
//
// GROWING THE WHITELIST: as `typecheck.vl`/`parser.vl` gain coverage, re-run the
// discovery sweep (a candidate set driven the same way) and promote newly-agreeing
// files here. A whitelisted file that starts DISAGREEING is a regression and fails.
// The count below IS the conformance ledger.

import { runWasm } from "../compiler/compile.ts";
import { compileCached } from "./_selfhost_cache.ts";

const read = (rel: string) =>
  Deno.readTextFileSync(new URL(rel, import.meta.url));

// Same lexer-rename glue as the rest of the self-host suite (no module system yet).
const lexer = read("../compiler/lexer.vl")
  .replace(/\bTok\b/g, "LexTok")
  .replace(/\bDiag\b/g, "LexDiag")
  .replace(/\badvance\b/g, "lexAdvance");
const ast = read("../compiler/ast.vl");
const parser = read("../compiler/parser.vl");
const typecheck = read("../compiler/typecheck.vl");

// ── The whitelist: corpus files where the VL front end's verdict matches the spec.
// Reject set = `@error` files VL genuinely detects (a real type/parse error). Accept
// set = clean files VL parses + type-checks with zero diagnostics. (Discovered by the
// sweep; see the header. Out-of-subset files — closures, generics, `if/then/else`
// expressions, loops, redeclaration/const-reassign checks VL lacks — are excluded
// until the relevant coverage lands.)
const WHITELIST = [
  // ── rejects ────────────────────────────────────────────────────────────────
  // Curated to GENUINE front-end rejections: type errors the VL checker models,
  // plus real lexer/parser syntax errors. Advanced-feature `@error` files
  // (negation / intersection / recursive types / null-inference / lambdas /
  // named-args) are EXCLUDED — VL "rejects" them only as a parse-subset artifact,
  // not by analysing the feature, so they'd give false confidence.
  // type errors (the checker raises them):
  "types/assign-type.vl",
  "types/i32-string-mismatch.vl",
  "types/return-mismatch.vl",
  "types/undeclared-call.vl",
  "types/fn-arg-count.vl",
  "types/fn-arg-type.vl",
  "types/condition-type.vl",
  "types/boolean-to-i32-reject.vl",
  "types/boolean-literal-to-i32-reject.vl",
  "operators/eq-no-union-mismatch.vl",
  // lexer errors (malformed numeric literals):
  "literals/err-bad-hex-digit.vl",
  "literals/err-doubled-separator.vl",
  "literals/err-empty-hex.vl",
  "literals/err-prefix-separator.vl",
  "literals/err-trailing-separator.vl",
  // parser errors (illegal comma placement):
  "arrays/leading-comma-illegal.vl",
  "arrays/trailing-comma-illegal.vl",
  "objects/trailing-comma-illegal.vl",
  "functions/trailing-comma-illegal.vl",
  // ── accepts (clean programs VL parses + type-checks with zero diagnostics) ──
  "arith/literal-add.vl",
  "arith/ops.vl",
  "arith/typed-add.vl",
  "statements/struct-call-as-statement.vl",
  "variables/let-reassign-ok.vl",
  "variables/let-literal-widens.vl",
  "variables/const-field-mutation-ok.vl",
  "variables/definite-assign-both-branches-ok.vl",
  "variables/definite-assign-then-use-ok.vl",
  "variables/definite-assign-initialized-ok.vl",
  "variables/definite-assign-diverging-branch-ok.vl",
  "globals/read-through.vl",
  "globals/mutate-through-fn.vl",
  "globals/mutate-in-fn-loop.vl",
  "globals/struct-field-through-fn.vl",
  "loops/while-sum.vl",
  "functions/forward-reference.vl",
  "functions/forward-reference-struct-param.vl",
  "functions/forward-reference-nested-struct-param.vl",
  "functions/mutual-recursion.vl",
  "functions/mutual-recursion-struct-param.vl",
  "functions/return-then-statement-same-line.vl",
  "functions/void-tail-statements.vl",
  "objects/equality.vl",
  "objects/struct.vl",
  "arrays/equality.vl",
  "arrays/f64-elems.vl",
  "arrays/infer-empty-push.vl",
  "arrays/infer-empty-string.vl",
  "arrays/infer-empty-index-set.vl",
  "arrays/infer-empty-from-usage.vl",
];

const corpusSrc = (rel: string) =>
  Deno.readTextFileSync(new URL("./cases/" + rel, import.meta.url));

// The oracle: a file is expected to be REJECTED iff it declares an `@error` directive.
const expectsReject = (src: string): boolean => /^\s*\/\/\s*@error/m.test(src);

type Entry = { rel: string; key: string; src: string; reject: boolean };
const entries: Entry[] = WHITELIST.map((rel, i) => {
  const src = corpusSrc(rel);
  return { rel, key: "c" + i, src, reject: expectsReject(src) };
});

// The driver: per file, reset parser + checker state, lex/parse, then run
// `checkProgram` in expression position (the PR#5 codegen gap) and print the parse
// diagnostic count (`P<n>`) and the type diagnostic count (`C<n>`).
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
function runCase(key: string, src: string): i32 {
  P.toks = []
  P.nodes = []
  P.diags = []
  P.pos = 0
  initChecker()
  loadToks(src)
  let root = parseProgram()
  print(key + "\\tP" + i32ToStr(P.diags.length))
  print(key + "\\tC" + i32ToStr(checkProgram(root)))
  0
}
`;
const calls = entries
  .map((e) => `runCase(${JSON.stringify(e.key)}, ${JSON.stringify(e.src)})`)
  .join("\n");

// Compile + run the typecheck pipeline ONCE (memoized); return per-key {parse, check}.
let results: Promise<Map<string, { parse: number; check: number }>> | undefined;
const runAll = (): Promise<Map<string, { parse: number; check: number }>> =>
  results ??= (async () => {
    const source = lexer + "\n" + ast + "\n" + parser + "\n" + typecheck + "\n" +
      driver + "\n" + calls + "\n";
    const { wasm, diagnostics } = await compileCached(source);
    const errs = diagnostics.filter((d) => d.severity === "error");
    if (errs.length > 0 || !wasm) {
      throw new Error(
        "corpus conformance driver failed to compile: " +
          errs.map((d) => d.message).join("; "),
      );
    }
    const { logs } = await runWasm(wasm);
    const byKey = new Map<string, { parse: number; check: number }>();
    for (const line of logs) {
      const tab = line.indexOf("\t");
      if (tab < 0) continue;
      const key = line.slice(0, tab);
      const v = line.slice(tab + 1);
      const e = byKey.get(key) ?? { parse: -1, check: -1 };
      if (v[0] === "P") e.parse = Number(v.slice(1));
      if (v[0] === "C") e.check = Number(v.slice(1));
      byKey.set(key, e);
    }
    return byKey;
  })();

entries.forEach((e) => {
  Deno.test(
    `corpus ${e.reject ? "rejects" : "accepts"}: ${e.rel}`,
    async () => {
      const r = (await runAll()).get(e.key) ?? { parse: -1, check: -1 };
      if (r.parse < 0 || r.check < 0) {
        throw new Error(`${e.rel}: no result from the VL pipeline`);
      }
      const rejected = r.parse + r.check > 0;
      if (rejected !== e.reject) {
        throw new Error(
          `${e.rel}: VL ${rejected ? "REJECTED" : "ACCEPTED"} ` +
            `(parse=${r.parse}, check=${r.check}) but the corpus directive expects it ` +
            `${e.reject ? "REJECTED" : "ACCEPTED"}`,
        );
      }
    },
  );
});
