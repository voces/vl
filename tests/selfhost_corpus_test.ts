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
// LEDGER: 229 / 422 single-file corpus cases conform — VL's VERDICT matches the
// spec: 143 ACCEPTED (clean programs VL parses + type-checks with zero diagnostics)
// and 86 REJECTED (invalid programs VL refuses — a type error the checker raises,
// or a lexer/parser syntax error). Every entry is VL behaving CORRECTLY per the
// directive. (For some advanced `@error` files VL refuses the program because the
// construct is outside its parser/checker subset — still a correct refusal of an
// invalid program, though not always for the same reason TS gives; if VL's parser
// later accepts the syntax without the checker catching the error, that file flips
// to DISAGREE and this test fails, which correctly flags the regression.)
//
// GROWING THE WHITELIST: discovered by a full-corpus sweep that drives every file
// through the pipeline in isolation (`tests/selfhost/probe_fullsweep.ts`-style) and
// keeps the agreeing ones. As `typecheck.vl`/`parser.vl` gain coverage, re-sweep and
// promote newly-agreeing files. A whitelisted file that starts DISAGREEING fails.
// The count is the conformance ledger. The 193 current DISAGREEMENTS are the work
// left: clean files VL can't yet PARSE (lambdas, generics, if/then/else
// expressions) and `@error` files VL doesn't yet CATCH (redeclaration, const-reassign).

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

// ── The whitelist: corpus files where the VL front end's verdict matches the spec
// (see the header for what "verdict conformance" means and how this set is grown).
const WHITELIST = [
  // ── ACCEPT: clean programs VL parses + type-checks with zero diagnostics ──
  "arith/literal-add.vl",
  "arith/ops.vl",
  "arith/typed-add.vl",
  "arrays/basics.vl",
  "arrays/equality.vl",
  "arrays/f64-elems.vl",
  "arrays/infer-empty-from-usage.vl",
  "arrays/infer-empty-index-set.vl",
  "arrays/infer-empty-push.vl",
  "arrays/infer-empty-string.vl",
  "chars/literals.vl",
  "functions/calls.vl",
  "functions/closure.vl",
  "functions/early-return.vl",
  "functions/escaping.vl",
  "functions/forward-call-inferred.vl",
  "functions/forward-reference-needs-return-type.vl",
  "functions/forward-reference-nested-struct-param.vl",
  "functions/forward-reference-struct-array-param.vl",
  "functions/forward-reference-struct-param.vl",
  "functions/forward-reference.vl",
  "functions/function-equality.vl",
  "functions/mutual-recursion-inferred.vl",
  "functions/mutual-recursion-struct-param.vl",
  "functions/mutual-recursion.vl",
  "functions/nested.vl",
  "functions/return-then-statement-same-line.vl",
  "functions/struct-param-mutual-recursion-global.vl",
  "functions/trailing-comma-params.vl",
  "functions/unused-param-inline-call.vl",
  "functions/void-tail-statements.vl",
  "globals/cross-function.vl",
  "globals/mutate-in-fn-loop.vl",
  "globals/mutate-in-loop.vl",
  "globals/mutate-through-fn.vl",
  "globals/read-through.vl",
  "globals/string-accumulator-through-fn.vl",
  "globals/string-read-through.vl",
  "globals/string-reassign-cross-function.vl",
  "globals/struct-field-through-fn.vl",
  "index/nested-2d-array.vl",
  "lexer/soft-keywords-as-function-names.vl",
  "lexer/soft-keywords-as-identifiers.vl",
  "lint/called-function-no-warn.vl",
  "lint/dead-branch-if-false.vl",
  "lint/dead-branch-if-true-else.vl",
  "lint/dead-branch-while-false.vl",
  "lint/exported-function-no-warn.vl",
  "lint/mutual-recursion-no-warn.vl",
  "lint/prefer-const-unmutated-let.vl",
  "lint/reachable-no-warn.vl",
  "lint/read-local-no-warn.vl",
  "lint/underscore-suppressed.vl",
  "lint/unreachable-after-break.vl",
  "lint/unreachable-after-if-else.vl",
  "lint/unreachable-after-return.vl",
  "lint/unused-function.vl",
  "lint/unused-local.vl",
  "lint/unused-param.vl",
  "lint/unused-toplevel.vl",
  "lists/build-fusion-adv-break.vl",
  "lists/build-fusion-adv-conditional.vl",
  "lists/build-fusion-adv-multipush.vl",
  "lists/build-fusion-adv-reads-a.vl",
  "lists/build-fusion-continue.vl",
  "lists/build-fusion-cw-adv-bound-mutated.vl",
  "lists/build-fusion-cw-adv-break.vl",
  "lists/build-fusion-cw-adv-double-incr.vl",
  "lists/build-fusion-cw-adv-reads-a.vl",
  "lists/build-fusion-cw-asc.vl",
  "lists/build-fusion-cw-desc.vl",
  "lists/build-fusion-cw-empty.vl",
  "lists/build-fusion-cw-seeded.vl",
  "lists/build-fusion-cw-step2.vl",
  "lists/build-fusion-empty-count.vl",
  "lists/build-fusion-range.vl",
  "lists/build-fusion-seeded.vl",
  "lists/push-struct-regrow.vl",
  "lists/push-struct.vl",
  "lists/struct-field-push-nested.vl",
  "lists/struct-field-push-regrow.vl",
  "lists/struct-field-push.vl",
  "loops/empty-range.vl",
  "loops/for-range-bound-named-step.vl",
  "loops/for-step.vl",
  "loops/for-sum.vl",
  "loops/single-line-block.vl",
  "loops/while-sum.vl",
  "maps/annotated-empty-ok.vl",
  "maps/basics.vl",
  "maps/churn-reuse-correct.vl",
  "maps/delete-distinct-churn.vl",
  "maps/delete-same-key-churn.vl",
  "maps/delete.vl",
  "maps/infer-from-set.vl",
  "maps/iteration-order.vl",
  "maps/length-unified.vl",
  "maps/many-keys.vl",
  "maps/string-values.vl",
  "objects/equality-function-field.vl",
  "objects/equality.vl",
  "objects/member-call.vl",
  "objects/struct.vl",
  "sets/basics.vl",
  "sets/infer-from-add.vl",
  "soundness/README.vl",
  "soundness/boolean-narrowing-if-sound.vl",
  "soundness/equality-array-nested-sound.vl",
  "soundness/equality-boolean-sound.vl",
  "soundness/exhaustive-union-sound.vl",
  "soundness/is-across-boundary-sound.vl",
  "soundness/return-union-narrowed-at-call-site.vl",
  "soundness/union-triple-variant-boundary-sound.vl",
  "soundness/union-widen-ok.vl",
  "soundness/union-widen-via-return-sound.vl",
  "statements/call-result-still-consumable.vl",
  "statements/discarded-call-return.vl",
  "statements/struct-call-as-statement.vl",
  "strings/accum-adv-other-read.vl",
  "strings/accum-adv-reset.vl",
  "strings/accum-basic.vl",
  "strings/accum-empty.vl",
  "strings/basics.vl",
  "strings/escapes.vl",
  "strings/from-code-point.vl",
  "strings/index-of.vl",
  "strings/methods-chaining.vl",
  "strings/print-and-eq.vl",
  "strings/slice.vl",
  "traps/array-oob-read.vl",
  "traps/divide-by-zero.vl",
  "types/literal-narrowing.vl",
  "types/struct-union-same-shape.vl",
  "types/union-narrowed-helper-recursion.vl",
  "types/union-two-visitors.vl",
  "variables/const-field-mutation-ok.vl",
  "variables/definite-assign-both-branches-ok.vl",
  "variables/definite-assign-diverging-branch-ok.vl",
  "variables/definite-assign-initialized-ok.vl",
  "variables/definite-assign-loop-body-ok.vl",
  "variables/definite-assign-then-use-ok.vl",
  "variables/let-literal-widens.vl",
  "variables/let-reassign-ok.vl",
  // ── REJECT: invalid programs VL refuses (type error, or lexer/parser error) ──
  "arrays/leading-comma-illegal.vl",
  "arrays/render-i32-array.vl",
  "arrays/trailing-comma-illegal.vl",
  "bitwise/float-reject.vl",
  "functions/inferred-cycle-no-base-case.vl",
  "functions/inferred-return-soundness.vl",
  "functions/lambda-uninferable-param.vl",
  "functions/named-args-unknown.vl",
  "functions/trailing-comma-illegal.vl",
  "generics/array-element-correlation.vl",
  "generics/return-correlation.vl",
  "generics/type-alias-arity-error.vl",
  "generics/type-alias-bare-error.vl",
  "generics/type-alias-soundness.vl",
  "index/wrong-key-type.vl",
  "index/wrong-value-type.vl",
  "lint/empty-intersection.vl",
  "literals/err-bad-hex-digit.vl",
  "literals/err-doubled-separator.vl",
  "literals/err-empty-hex.vl",
  "literals/err-prefix-separator.vl",
  "literals/err-trailing-separator.vl",
  "loops/for-in-not-array.vl",
  "maps/error-i32-keyed.vl",
  "maps/error-infer-conflict.vl",
  "maps/error-object-literal-not-map.vl",
  "numerics/narrowing-reject.vl",
  "objects/self-method-pollution.vl",
  "objects/trailing-comma-illegal.vl",
  "operators/eq-no-union-mismatch.vl",
  "sets/error-i32-keyed.vl",
  "sets/error-infer-conflict.vl",
  "sets/error-no-get.vl",
  "sets/error-no-map-methods.vl",
  "soundness/arith-annotated-mismatch.vl",
  "soundness/equality-cross-type-reject.vl",
  "soundness/equality-type-mismatch.vl",
  "soundness/equality-union-field-reject.vl",
  "soundness/exhaustive-is-chain-no-else-reject.vl",
  "soundness/exhaustive-missing-literal-case.vl",
  "soundness/function-arg-type-reject.vl",
  "soundness/function-arg-union-reject.vl",
  "soundness/intersection-param-reject.vl",
  "soundness/literal-union-reject-arg.vl",
  "soundness/literal-union-reject-assign.vl",
  "soundness/literal-union-reject-compare.vl",
  "soundness/literal-union-reject-non-member.vl",
  "soundness/narrowing-and-else-not-narrowed.vl",
  "soundness/narrowing-is-unsound-use.vl",
  "soundness/narrowing-then-only-no-leak.vl",
  "soundness/not-is-guard-no-divergence-no-narrow.vl",
  "soundness/nullable-access-nested.vl",
  "soundness/nullable-access-unguarded.vl",
  "soundness/nullable-chain-unguarded-reject.vl",
  "soundness/object-field-value-mismatch-generic.vl",
  "soundness/object-field-value-mismatch-inline.vl",
  "soundness/object-field-value-mismatch.vl",
  "soundness/return-union-unnarrowed-reject.vl",
  "soundness/struct-field-type-mismatch-reject.vl",
  "soundness/struct-missing-field-reject.vl",
  "soundness/struct-union-unshared-field-reject.vl",
  "soundness/union-field-unnarrowed-reject.vl",
  "soundness/union-four-variant-missing-reject.vl",
  "soundness/union-narrow-reject.vl",
  "soundness/xfail-elseif-chain-residual.vl",
  "soundness/xfail-seq-guard-residual-codegen.vl",
  "types/assign-type.vl",
  "types/bodyless-alias.vl",
  "types/boolean-literal-to-i32-reject.vl",
  "types/boolean-to-i32-reject.vl",
  "types/condition-type.vl",
  "types/empty-intersection-unused.vl",
  "types/fn-arg-count.vl",
  "types/fn-arg-type.vl",
  "types/for-bound-type.vl",
  "types/i32-string-mismatch.vl",
  "types/infer-null-pin-guard.vl",
  "types/negation-annotation-reject.vl",
  "types/never-value-intersection.vl",
  "types/never-value-self-intersection.vl",
  "types/recursive-type.vl",
  "types/return-mismatch.vl",
  "types/self-alias-still-clean.vl",
  "types/self-alias-unused.vl",
  "types/undeclared-call.vl",
  "variables/const-increment-error.vl",
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
