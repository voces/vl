// NATIVE corpus alignment — the self-hosted `vl` binary, end to end, with zero
// TS/deno/V8 in the compile+run path (deno only DISCOVERS cases, parses their
// directives, and ASSERTS the verdict; the brains run in the native tool).
//
// Tiers 1 (verdict) and 2 (runtime) of the corpus already prove the VL pipeline
// AGREES with the spec when driven through the deno-hosted compiler module
// (`tests/selfhost_corpus_test.ts`, `tests/selfhost_corpus_run_test.ts`). THIS
// suite re-drives the same curated corpus slices through the NATIVE path —
// `scripts/vl-host` (Rust + wasmtime) executing `build/vl-compiler.wasm` — and
// asserts the native tool produces IDENTICAL behavior:
//
//   • RUN_CASES   `vl run <case>`  → stdout lines EQUAL the file's `@log` directives,
//                                    AND `vl check <case>` exits 0 (full compile clean).
//   • TRAP_CASES  `vl run <case>`  → exits NONZERO with a wasm runtime trap.
//   • REJECT_CASES `vl check`      → exits NONZERO, rejected at the parse/type STAGE
//                                    (an invalid program is caught by the front end and
//                                    NEVER reaches the emitter — the gate holds).
//
// SCOPE (matches the corpus directives the native binary can already adjudicate):
// `@run`/`@log` runtime parity, `@trap` trap-and-exit, and `@check`/`@error`
// accept-vs-reject WITH stage classification. OUT of scope (host-checker territory
// until span threading + message parity + a lint port land): `@error` message text,
// `@error-at` spans, and `@warning`/`@hint`/`@info` — this suite never pins those.
//
// PROVENANCE: the lists are seeded from the deno-pipeline whitelists (the `@run`
// runtime whitelist; the Tier-1 verdict whitelist's `@error` files). They are kept
// EXPLICIT here (not imported) so this suite is self-contained and does not regress
// when a parallel checker/parser PR grows the other whitelists. NOTE: 59 Tier-1
// ACCEPT files type-check clean but the EMITTER cannot lower yet (lambdas, generics,
// sets, map `delete`, closures); `vl check` (a FULL compile) rejects them at the
// EMIT stage, so they are intentionally absent below — promoting them is the
// emitter-coverage work (queue item 3), not an alignment failure.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed
// wasm; absent either, every case registers as ignored with a one-line how-to-build
// note (so a plain `deno task test` stays fast and green; CI's native job opts in).

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const CASES = new URL("./cases/", import.meta.url);

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = GATED && haveBin && haveSeed;
if (GATED && !ENABLED) {
  console.warn(
    `[native-align] skipped — ${!haveBin ? "missing vl binary" : "missing seed wasm"}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  deno run -A scripts/build-compiler-wasm.ts",
  );
}

const src = (rel: string) => Deno.readTextFileSync(new URL(rel, CASES));
const logsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);

type Run = { code: number; out: string; err: string };
const vl = async (args: string[]): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    // Deterministic, compact stderr (no Rust backtrace) for stage matching.
    env: { RUST_BACKTRACE: "0" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};
const path = (rel: string) => new URL(rel, CASES).pathname;
const stageOf = (err: string) => err.match(/(parse|type|emit) error/)?.[1] ?? "other";

// ── RUN_CASES: `vl run` stdout EQUALS @log, and `vl check` compiles clean ──
const RUN_CASES = [
  "arith/literal-add.vl",
  "arith/ops.vl",
  "arith/typed-add.vl",
  "arrays/basics.vl",
  "arrays/f64-elems.vl",
  "arrays/infer-empty-from-usage.vl",
  "arrays/infer-empty-index-set.vl",
  "arrays/infer-empty-push.vl",
  "arrays/map-filter-f64.vl",
  "arrays/map-filter-inferred-callbacks.vl",
  "arrays/map-filter.vl",
  "arrays/trailing-comma.vl",
  "bitwise/i64.vl",
  "bitwise/precedence.vl",
  "bitwise/shifts.vl",
  "chars/literals.vl",
  "functions/calls.vl",
  "functions/closure.vl",
  "functions/early-return.vl",
  "functions/escaping.vl",
  "functions/forward-call-inferred.vl",
  "functions/forward-reference-needs-return-type.vl",
  "functions/forward-reference-struct-array-param.vl",
  "functions/forward-reference-struct-param.vl",
  "functions/forward-reference.vl",
  "functions/lambda.vl",
  "functions/let-untyped-from-array-call.vl",
  "functions/mutual-recursion-inferred.vl",
  "functions/mutual-recursion-struct-param.vl",
  "functions/mutual-recursion.vl",
  "functions/return-then-statement-same-line.vl",
  "functions/struct-param-mutual-recursion-global.vl",
  "functions/trailing-comma-call.vl",
  "functions/trailing-comma-params.vl",
  "functions/unused-param-inline-call.vl",
  "globals/cross-function.vl",
  "globals/increment-operator.vl",
  "globals/mutate-in-fn-loop.vl",
  "globals/mutate-in-loop.vl",
  "globals/mutate-through-fn.vl",
  "globals/read-through.vl",
  "globals/string-accumulator-through-fn.vl",
  "globals/string-read-through.vl",
  "globals/string-reassign-cross-function.vl",
  "globals/struct-field-through-fn.vl",
  "lexer/soft-keywords-as-function-names.vl",
  "lexer/soft-keywords-as-identifiers.vl",
  "lint/called-function-no-warn.vl",
  "lint/mutual-recursion-no-warn.vl",
  "lint/reachable-no-warn.vl",
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
  "lists/push-struct.vl",
  "lists/struct-field-push-regrow.vl",
  "lists/struct-field-push.vl",
  "lists/struct-pop-get-map.vl",
  "literals/binary.vl",
  "literals/octal.vl",
  "literals/separators.vl",
  "literals/wide-hex.vl",
  "loops/continue.vl",
  "loops/for-in.vl",
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
  "numerics/wide.vl",
  "numerics/wide-arith.vl",
  "numerics/widening.vl",
  "objects/struct.vl",
  "objects/trailing-comma.vl",
  "operators/unary.vl",
  "soundness/boolean-narrowing-if-sound.vl",
  "soundness/equality-boolean-sound.vl",
  "soundness/equality-nullness-sound.vl",
  "soundness/narrowing-and-chain-two-places.vl",
  "soundness/narrowing-null-guard.vl",
  "soundness/narrowing-or-chain-post-guard.vl",
  "soundness/nullable-widen-via-param-sound.vl",
  "statements/call-result-still-consumable.vl",
  "statements/discarded-call-return.vl",
  "statements/pop-as-statement.vl",
  "statements/pop-struct-field-as-statement.vl",
  "statements/struct-call-as-statement.vl",
  "strings/accum-adv-other-read.vl",
  "strings/accum-adv-reads-s.vl",
  "strings/accum-adv-reset.vl",
  "strings/accum-basic.vl",
  "strings/accum-empty.vl",
  "strings/accum-seed-chain.vl",
  "strings/accum-serializer.vl",
  "strings/accum-tostring.vl",
  "strings/basics.vl",
  "strings/from-code-point.vl",
  "strings/from-code-points.vl",
  "strings/print-and-eq.vl",
  "strings/slice.vl",
  "tostring/bool.vl",
  "tostring/concat.vl",
  "tostring/nested-function.vl",
  "tostring/nested-if.vl",
  "tostring/nested-loop.vl",
  "tostring/numbers.vl",
  "types/literal-narrowing.vl",
  "types/or-guard-narrowing.vl",
  "types/struct-union-same-shape.vl",
  "types/union-narrowed-helper-recursion.vl",
  "types/union-two-visitors.vl",
  "variables/assignment.vl",
  "variables/const-field-mutation-ok.vl",
  "variables/definite-assign-both-branches-ok.vl",
  "variables/definite-assign-diverging-branch-ok.vl",
  "variables/definite-assign-initialized-ok.vl",
  "variables/definite-assign-loop-body-ok.vl",
  "variables/definite-assign-then-use-ok.vl",
  "variables/let-increment-ok.vl",
  "variables/let-literal-widens.vl",
  "variables/let-reassign-ok.vl",
];

// ── TRAP_CASES: `vl run` exits nonzero with a runtime trap ──
const TRAP_CASES = [
  "traps/array-oob-read.vl",
  "traps/divide-by-zero.vl",
];

// ── REJECT_CASES (@error): `vl check` rejects at the parse/type stage ──
const REJECT_CASES = [
  "arrays/error-empty-uninferred.vl",
  "arrays/leading-comma-illegal.vl",
  "arrays/render-i32-array.vl",
  "arrays/trailing-comma-illegal.vl",
  "bitwise/float-reject.vl",
  "chars/empty.vl",
  "chars/multi.vl",
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
  "lint/for-step-zero.vl",
  "literals/err-bad-hex-digit.vl",
  "literals/err-doubled-separator.vl",
  "literals/err-empty-hex.vl",
  "literals/err-prefix-separator.vl",
  "literals/err-trailing-separator.vl",
  "loops/for-in-not-array.vl",
  "maps/error-i32-keyed.vl",
  "maps/error-infer-conflict.vl",
  "maps/error-no-annotation.vl",
  "maps/error-object-literal-not-map.vl",
  "maps/error-uninferred.vl",
  "numerics/narrowing-reject.vl",
  "objects/self-method-pollution.vl",
  "objects/trailing-comma-illegal.vl",
  "operators/eq-no-union-mismatch.vl",
  "sets/error-i32-keyed.vl",
  "sets/error-infer-conflict.vl",
  "sets/error-no-get.vl",
  "sets/error-uninferred.vl",
  "sets/error-no-map-methods.vl",
  "soundness/arith-annotated-mismatch.vl",
  "soundness/equality-cross-type-reject.vl",
  "soundness/equality-type-mismatch.vl",
  "soundness/equality-union-field-reject.vl",
  "soundness/exhaustive-is-chain-no-else-reject.vl",
  "soundness/exhaustive-missing-is-case.vl",
  "soundness/exhaustive-missing-literal-case.vl",
  "soundness/is-non-variant-reject.vl",
  "soundness/is-not-variant-of-union-reject.vl",
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
  "types/redeclaration.vl",
  "types/return-mismatch.vl",
  "types/self-alias-still-clean.vl",
  "types/self-alias-unused.vl",
  "types/undeclared-call.vl",
  "variables/const-increment-error.vl",
  "variables/definite-assign-after-loop-error.vl",
  "variables/definite-assign-one-branch-error.vl",
  "variables/definite-assign-use-before-assign.vl",
];

for (const rel of RUN_CASES) {
  Deno.test({
    name: `native-align run: ${rel} — vl run stdout == @log, vl check clean`,
    ignore: !ENABLED,
    fn: async () => {
      const want = logsOf(src(rel));
      const r = await vl(["run", path(rel)]);
      if (r.code !== 0) {
        throw new Error(`${rel}: vl run exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
      }
      const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `${rel}: log mismatch\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`,
        );
      }
      const c = await vl(["check", path(rel)]);
      if (c.code !== 0) {
        throw new Error(`${rel}: vl check should compile clean, exited ${c.code} (${stageOf(c.err)}): ${c.err.trim().split("\n")[0]}`);
      }
    },
  });
}

for (const rel of TRAP_CASES) {
  Deno.test({
    name: `native-align trap: ${rel} — vl run traps (nonzero exit)`,
    ignore: !ENABLED,
    fn: async () => {
      const r = await vl(["run", path(rel)]);
      if (r.code === 0) throw new Error(`${rel}: expected a runtime trap, vl run exited 0`);
      // A genuine RUNTIME trap, not a compile failure: stderr names a wasm trap and
      // no compile stage rejected it.
      if (!/wasm trap/.test(r.err)) {
        throw new Error(`${rel}: nonzero exit but no "wasm trap" in stderr: ${r.err.trim().split("\n").slice(0, 3).join(" / ")}`);
      }
    },
  });
}

for (const rel of REJECT_CASES) {
  Deno.test({
    name: `native-align reject: ${rel} — vl check rejects at parse/type`,
    ignore: !ENABLED,
    fn: async () => {
      const r = await vl(["check", path(rel)]);
      if (r.code === 0) {
        throw new Error(`${rel}: expected rejection, vl check exited 0`);
      }
      const stage = stageOf(r.err);
      // The front end must catch it — an invalid program must never slip past the
      // type-check gate into the emitter (which would mask an unsound accept).
      if (stage !== "parse" && stage !== "type") {
        throw new Error(
          `${rel}: rejected at "${stage}" stage, expected parse/type — the checker should catch this BEFORE emit\n  ${r.err.trim().split("\n").slice(0, 2).join(" / ")}`,
        );
      }
    },
  });
}
