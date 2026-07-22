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
      "  scripts/fetch-seed.sh",
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
    // VL_STD pins the std dir to THIS tree: agent worktrees symlink the cargo
    // target into the main checkout, so the binary's exe-relative std/
    // fallback (/proc/self/exe resolves symlinks) would point at the WRONG
    // checkout there. The env override is the first hit in the host's std-dir
    // resolution either way.
    env: { RUST_BACKTRACE: "0", VL_STD: `${ROOT}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};
const path = (rel: string) => new URL(rel, CASES).pathname;
const stageOf = (err: string) => err.match(/(parse|type|emit) error/)?.[1] ?? "other";

// ── Batched `vl run` (RUN_CASES + TRAP_CASES) ─────────────────────────────────
// One `vl run --batch` process runs MANY cases: the per-spawn fixed costs
// (process + two wasmtime engine builds + loading the multi-MB compiler module)
// are paid once per batch instead of once per case; each case still gets a fresh
// isolated Store (same protocol scripts/fuzz-vl.sh drives). Per input file the
// host writes `<basename>.out` (print output, always) and `<basename>.err` (the
// SAME rendered error a failing `vl run` prints — compiler diagnostics / trap
// text — only on failure), so the per-case assertions below are unchanged in
// strength: stdout still must equal `@log` exactly, and a trap still must render
// "wasm trap". The `vl check` legs stay per-spawn (`vl check` has no batch mode).
//
// Outputs are keyed by BASENAME, and the corpus reuses basenames across dirs
// (13× `entry.vl`, 4× `basics.vl`, …) — and module imports resolve relative to
// the REAL entry path, so inputs cannot be renamed/symlinked flat. Instead the
// cases are partitioned into WAVES with unique basenames per wave: wave k holds
// each basename's k-th occurrence, so wave 0 carries ~95% of the cases and the
// handful of extra waves only re-pay the fixed cost a dozen times, not ~300.
//
// The batch is LAZY (first test to need it kicks it off, everyone awaits the
// same promise) so filtering/ignoring never pays for it, and per-case test
// granularity + names are untouched.
type BatchResult = { out: string; err: string | null };
let batchP: Promise<Map<string, BatchResult>> | null = null;
const batchResults = (): Promise<Map<string, BatchResult>> =>
  batchP ??= (async () => {
    const rels = [...new Set([...RUN_CASES, ...TRAP_CASES])];
    const waves: string[][] = [];
    const mult = new Map<string, number>();
    for (const rel of rels) {
      const base = rel.split("/").pop()!;
      const k = mult.get(base) ?? 0;
      mult.set(base, k + 1);
      (waves[k] ??= []).push(rel);
    }
    const results = new Map<string, BatchResult>();
    await Promise.all(waves.map(async (wave) => {
      const dir = await Deno.makeTempDir({ prefix: "vl-native-align-batch-" });
      try {
        const { code, stderr } = await new Deno.Command(VL, {
          args: [
            "run",
            "--batch",
            "--out-dir",
            dir,
            ...wave.map(path),
            "--compiler",
            COMPILER,
          ],
          stdout: "piped",
          stderr: "piped",
          env: { RUST_BACKTRACE: "0", VL_STD: `${ROOT}/std` },
        }).output();
        // Nonzero exit = the BATCH itself could not run (per-case failure is a
        // `.err` file, never a batch abort) — surface it in every awaiting test.
        if (code !== 0) {
          throw new Error(
            `vl run --batch exited ${code}: ${new TextDecoder().decode(stderr).trim()}`,
          );
        }
        for (const rel of wave) {
          const base = rel.split("/").pop()!;
          const out = await Deno.readTextFile(`${dir}/${base}.out`);
          let err: string | null = null;
          try {
            err = await Deno.readTextFile(`${dir}/${base}.err`);
          } catch {
            // no `.err` file — the case ran clean.
          }
          results.set(rel, { out, err });
        }
      } finally {
        await Deno.remove(dir, { recursive: true }).catch(() => {});
      }
    }));
    return results;
  })();

// One-time fixture, registered FIRST: build the batch here so its cost (the
// dominant per-suite cost — process spawns + wasmtime engine builds + running
// every RUN/TRAP case through the seed) is attributed to THIS named step
// instead of silently landing on whichever per-case test happens to run first
// (it used to make `arith/literal-add.vl` look ~17s slow in CI). The batch
// stays lazy, so a filtered run that never touches RUN/TRAP cases still never
// pays for it; per-case assertions are untouched.
Deno.test({
  name: "native-align setup: vl run --batch waves (one-time fixture; whole-batch cost lands here)",
  ignore: !ENABLED,
  fn: async () => {
    const results = await batchResults();
    if (results.size === 0) {
      throw new Error("vl run --batch produced no per-case results");
    }
  },
});

// ── RUN_CASES: `vl run` stdout EQUALS @log, and `vl check` compiles clean ──
const RUN_CASES = [
  "arith/literal-add.vl",
  "arith/ops.vl",
  "arith/typed-add.vl",
  "arrays/annotated-empty-ok.vl",
  "arrays/basics.vl",
  "arrays/concat.vl",
  "arrays/equality.vl",
  "arrays/boolean-elements.vl",
  "arrays/capacity-and-get.vl",
  "arrays/index-len-bounds-ok.vl",
  "arrays/f64-elems.vl",
  "arrays/infer-empty-from-usage.vl",
  "arrays/infer-empty-index-set.vl",
  "arrays/infer-empty-push.vl",
  "arrays/infer-empty-string.vl",
  "arrays/map-filter-f64.vl",
  "arrays/map-filter-inferred-callbacks.vl",
  "arrays/map-filter.vl",
  "arrays/push-pop-clear.vl",
  "arrays/trailing-comma.vl",
  "bitwise/i64.vl",
  "bitwise/precedence.vl",
  "bitwise/shifts.vl",
  "chars/literals.vl",
  "conditionals/expressions.vl",
  "conditionals/statement-and-bool.vl",
  "conditionals/tail-if-else-value.vl",
  "functions/calls.vl",
  "functions/doc-comments.vl",
  "functions/recursion.vl",
  "functions/structural-generic.vl",
  "functions/closure.vl",
  "functions/early-return.vl",
  "functions/escaping.vl",
  "functions/forward-call-inferred.vl",
  "functions/forward-reference-needs-return-type.vl",
  "functions/forward-reference-nested-struct-param.vl",
  "functions/forward-reference-struct-array-param.vl",
  "functions/forward-reference-struct-param.vl",
  "functions/forward-reference.vl",
  "functions/lambda.vl",
  "functions/function-equality.vl",
  "functions/generic-return.vl",
  "functions/indirect-polymorphic.vl",
  "functions/indirect.vl",
  "functions/inferred-compare.vl",
  "functions/let-untyped-from-array-call.vl",
  "functions/mutual-recursion-inferred.vl",
  "functions/mutual-recursion-struct-param.vl",
  "functions/mutual-recursion.vl",
  "functions/named-args.vl",
  "functions/return-then-statement-same-line.vl",
  "functions/struct-param-mutual-recursion-global.vl",
  "functions/trailing-comma-call.vl",
  "functions/trailing-comma-params.vl",
  "functions/unused-param-inline-call.vl",
  "functions/void-tail-statements.vl",
  "generics/first.vl",
  "generics/generic-array-foreach.vl",
  "generics/generic-array-passthrough.vl",
  "generics/generic-is.vl",
  "generics/identity.vl",
  "generics/last.vl",
  "generics/swap.vl",
  "generics/trailing-comma.vl",
  "generics/type-alias-box.vl",
  "generics/type-alias-in-fn.vl",
  "generics/type-alias-nested.vl",
  "generics/type-alias-pair.vl",
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
  "index/nested-2d-array.vl",
  "intrinsics/array-copy-overlap.vl",
  "intrinsics/array-copy.vl",
  "intrinsics/array-new-bool.vl",
  "intrinsics/array-new-default-zero.vl",
  "intrinsics/array-new-f64.vl",
  "intrinsics/array-new-fill.vl",
  "lexer/soft-keywords-as-function-names.vl",
  "lexer/soft-keywords-as-identifiers.vl",
  "lint/called-function-no-warn.vl",
  "lint/exhaustive-is-chain-dead-else.vl",
  "lint/exhaustive-is-chain-needed-else-no-info.vl",
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
  "lists/build-fusion-f64.vl",
  "lists/build-fusion-range.vl",
  "lists/build-fusion-ref.vl",
  "lists/build-fusion-seeded.vl",
  "lists/push-struct.vl",
  "lists/struct-field-ops.vl",
  "lists/struct-field-pop-statement.vl",
  "lists/struct-field-push-nested.vl",
  "lists/struct-field-push-regrow.vl",
  "lists/struct-field-push.vl",
  "lists/struct-pop-get-map.vl",
  "literals/binary.vl",
  "literals/hex.vl",
  "literals/long-literal-chunked.vl",
  "literals/octal.vl",
  "literals/separators.vl",
  "literals/wide-hex.vl",
  "loops/break.vl",
  "loops/continue.vl",
  "loops/for-in.vl",
  "loops/for-range-bound-named-step.vl",
  "loops/for-step.vl",
  "loops/for-sum.vl",
  "loops/single-line-block.vl",
  "loops/while-sum.vl",
  "loops/while-true-return.vl",
  // Free-function `self`-UFCS on NON-STRUCT receivers (string / i32 / value
  // union): `o.f(args)` rewrites to `f(o, args)` PRE-COLLECT for every receiver
  // kind, so a string/union arg keeps its rep through the scratch-frame sizing.
  // The field-precedence regression asserts a callable struct field still wins.
  "methods/array-receiver-ufcs.vl",
  "methods/field-wins-over-self-fn.vl",
  "methods/i32-recv-scalar-arg.vl",
  "methods/named-arg-ufcs.vl",
  "methods/string-recv-mixed-args.vl",
  "methods/string-recv-string-arg.vl",
  "methods/union-recv-args.vl",
  "methods/union-recv-no-args.vl",
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
  "maps/object-values.vl",
  "maps/string-values.vl",
  // H3 native modules: multi-file entries — `vl run` resolves the sibling
  // imports through the driver's fetch loop (relative to the entry path).
  "modules/basic/entry.vl",
  "modules/generic-export/entry.vl",
  "modules/generic-isolation/entry.vl",
  "modules/generic-shadow/entry.vl",
  "modules/inferred-exports/entry.vl",
  "modules/name-isolation/entry.vl",
  "modules/rename/entry.vl",
  "modules/solo/entry.vl",
  "modules/std-basic/entry.vl",
  "modules/std-fmt/entry.vl",
  "modules/transitive/entry.vl",
  "modules/ufcs-import/entry.vl",
  "modules/ufcs-import-field-precedence/entry.vl",
  "sets/basics.vl",
  "sets/infer-from-add.vl",
  "numerics/wide.vl",
  "numerics/wide-arith.vl",
  "numerics/widening.vl",
  "numerics/f64-literal-subnormal.vl",
  "numerics/f32-literal-overflow-subnormal.vl",
  "numerics/float-runtime-inf-nan.vl",
  "objects/method-shorthand.vl",
  "bitwise/and-or-xor.vl",
  "chars/string-index.vl",
  "functions/nested.vl",
  "lists/push-struct-regrow.vl",
  "objects/inline-method.vl",
  "objects/member-call.vl",
  "run/print.vl",
  "soundness/not-is-exhaustive-union.vl",
  "soundness/narrowing-is-null-sound.vl",
  "types/guard-narrowing.vl",
  "soundness/nullable-access-guarded.vl",
  "soundness/nullable-chain-double-guard.vl",
  "soundness/nullable-field-guard-sound.vl",
  "soundness/struct-width-subtyping-sound.vl",
  "soundness/union-field-narrowing-sound.vl",
  "strings/literal-length.vl",
  "types/else-chain-narrowing.vl",
  "types/guard-function.vl",
  "objects/pass.vl",
  "objects/self-method.vl",
  "objects/operator-self-method.vl",
  "objects/operator-overload.vl",
  "index/read-trap.vl",
  "index/native-vs-trap.vl",
  "index/nested-trap.vl",
  "index/write-trap.vl",
  "index/generic-trap.vl",
  "objects/method-shorthand-equiv.vl",
  "objects/method-shorthand-mixed.vl",
  "objects/equality.vl",
  "objects/equality-function-field.vl",
  "objects/struct.vl",
  "objects/trailing-comma.vl",
  "operators/unary.vl",
  "operators/union-eq.vl",
  "operators/union-eq-reversed.vl",
  "run/load-roundtrip.vl",
  "run/log-i32.vl",
  "soundness/boolean-narrowing-if-sound.vl",
  "soundness/coalesce-chain-sound.vl",
  "soundness/equality-array-nested-sound.vl",
  "soundness/equality-boolean-sound.vl",
  "soundness/equality-nullness-sound.vl",
  "soundness/exhaustive-is-chain-no-else-returns.vl",
  "soundness/exhaustive-union-sound.vl",
  "soundness/guard-function-post-guard-sound.vl",
  "soundness/is-across-boundary-sound.vl",
  "soundness/object-field-value-sound.vl",
  "soundness/intersection-param-sound.vl",
  "soundness/is-generic-param-sound.vl",
  "soundness/is-multi-narrow-recursive-visitor.vl",
  "soundness/is-multi-narrow-union.vl",
  "soundness/is-struct-union-dispatch.vl",
  "soundness/is-struct-union-sound.vl",
  "soundness/is-union-array-element-narrow.vl",
  "soundness/is-value-kind-union-sound.vl",
  "soundness/literal-is-runtime-value.vl",
  "soundness/literal-is-union-param-dispatch.vl",
  "soundness/literal-union-exhaustive-elseif.vl",
  "soundness/literal-union-function-param-sound.vl",
  "soundness/literal-union-narrowing-after-assign.vl",
  "soundness/literal-union-numeric-arith-base.vl",
  "soundness/literal-union-sound.vl",
  "soundness/narrowing-and-chain-two-places.vl",
  "soundness/narrowing-coalesce-sound.vl",
  "soundness/narrowing-is-sound.vl",
  "soundness/narrowing-null-guard.vl",
  "soundness/narrowing-optional-chain.vl",
  "soundness/narrowing-or-chain-post-guard.vl",
  "soundness/nullable-return-widen-sound.vl",
  "soundness/nullable-widen-via-param-sound.vl",
  "soundness/numeric-literal-union-exhaustive-is.vl",
  "soundness/optional-chain-coalesce-sound.vl",
  "soundness/recursive-alias-nullable-arg.vl",
  "soundness/recursive-binary-tree-sound.vl",
  "soundness/recursive-linked-list-sound.vl",
  "soundness/recursive-type-build-traverse.vl",
  "soundness/return-union-narrowed-at-call-site.vl",
  "soundness/struct-union-four-variant-dispatch.vl",
  "soundness/struct-union-null-is-chain-multi.vl",
  "soundness/struct-union-null-is-chain-sound.vl",
  "soundness/struct-union-nullable-member-sound.vl",
  "soundness/struct-union-shared-field.vl",
  "soundness/union-in-array-widen-sound.vl",
  "soundness/union-same-shape-discriminant-sound.vl",
  "soundness/union-triple-variant-boundary-sound.vl",
  "soundness/union-widen-ok.vl",
  "soundness/union-widen-via-return-sound.vl",
  "soundness/union-four-variant-exhaustive.vl",
  "soundness/xfail-mutual-recursive-types.vl",
  "statements/call-result-still-consumable.vl",
  "statements/discarded-call-return.vl",
  "statements/let-call-result.vl",
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
  "strings/escapes.vl",
  "strings/from-code-point.vl",
  "strings/from-code-points.vl",
  "strings/index-of.vl",
  "strings/methods-chaining.vl",
  "strings/print-and-eq.vl",
  "strings/slice.vl",
  "strings/string-method.vl",
  "tostring/bool.vl",
  "tostring/concat.vl",
  "tostring/nested-function.vl",
  "tostring/nested-if.vl",
  "tostring/nested-loop.vl",
  "tostring/numbers.vl",
  "types/and-narrowing.vl",
  "types/boolean-to-i32.vl",
  // Field-rep long tail: union/nullable/nested struct fields with member-path
  // narrowing, `i32[] | null` (kind-15 slots + ref.as_non_null reads), and
  // map-typed fields with a recursive map-value back-edge.
  "types/field-union.vl",
  "types/guard-function.vl",
  "types/infer-null-conditional-assign.vl",
  "types/infer-null-reassign.vl",
  "types/infer-null-unconstrained.vl",
  "types/intersection-annotation.vl",
  "types/intersection-object-merge.vl",
  "types/is-monomorphic-param.vl",
  "types/literal-narrowing.vl",
  "types/mixed-rep-union.vl",
  "types/literal-union.vl",
  "types/literal-union-exhaustive.vl",
  "types/literal-union-dedup.vl",
  "types/mutual-recursive-type.vl",
  "types/never-narrowing-legit.vl",
  "types/not-is-narrowing.vl",
  "types/not-paren-is-guard-narrowing.vl",
  "types/null-coalesce.vl",
  "types/nullable-boolean.vl",
  "types/nullable-list-index.vl",
  "types/optional-chain.vl",
  "types/or-guard-narrowing.vl",
  "types/recursive-array-element.vl",
  "types/recursive-map-value.vl",
  "types/recursive-tree.vl",
  "types/ref-union.vl",
  "types/struct-union-same-shape.vl",
  "types/union-narrowed-helper-recursion.vl",
  "types/union-narrowing.vl",
  "types/union-two-visitors.vl",
  "types/value-union.vl",
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
  "intrinsics/trap.vl",
  "traps/array-oob-read.vl",
  "traps/divide-by-zero.vl",
  "traps/list-index-slack-read.vl",
  "traps/list-index-slack-read-ref.vl",
  "traps/list-index-beyond-cap-read.vl",
  "traps/list-index-slack-write.vl",
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
  "intrinsics/error-array-copy-not-list.vl",
  "intrinsics/error-array-new-arity.vl",
  "intrinsics/error-array-new-bad-length.vl",
  "intrinsics/error-trap-args.vl",
  "lint/empty-intersection.vl",
  "lint/for-step-zero.vl",
  "literals/err-bad-hex-digit.vl",
  "literals/err-doubled-separator.vl",
  "literals/err-empty-hex.vl",
  "literals/err-prefix-separator.vl",
  "literals/err-trailing-separator.vl",
  "loops/for-in-not-array.vl",
  "loops/step-out-of-range-reject.vl",
  "maps/error-i32-keyed.vl",
  "maps/error-infer-conflict.vl",
  "maps/error-no-annotation.vl",
  "maps/error-object-literal-not-map.vl",
  "maps/error-uninferred.vl",
  // H3 native modules: graph-resolution errors reject at the parse stage with
  // the host's message texts (cycle / not-exported / unresolvable).
  "modules/err-cycle/entry.vl",
  "modules/err-not-exported/entry.vl",
  "modules/err-undefined/entry.vl",
  "modules/err-unresolvable/entry.vl",
  "modules/std-unknown/entry.vl",
  "numerics/narrowing-reject.vl",
  "numerics/f64-literal-overflow-reject.vl",
  "numerics/f32-literal-overflow-reject.vl",
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
      const r = (await batchResults()).get(rel)!;
      if (r.err !== null) {
        throw new Error(`${rel}: vl run failed: ${r.err.trim().split("\n")[0]}`);
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
      const r = (await batchResults()).get(rel)!;
      if (r.err === null) {
        throw new Error(`${rel}: expected a runtime trap, vl run succeeded`);
      }
      // A genuine RUNTIME trap, not a compile failure: the rendered error names a
      // wasm trap and no compile stage rejected it (a compile rejection renders
      // "parse/type/emit error", never "wasm trap").
      if (!/wasm trap/.test(r.err)) {
        throw new Error(`${rel}: failed but no "wasm trap" in the error: ${r.err.trim().split("\n").slice(0, 3).join(" / ")}`);
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

// ── EMIT_REJECT cases (@emit-error): `vl check --codegen` rejects at the EMIT stage ──
// Discovered by DIRECTIVE, not by list: any corpus file carrying `// @emit-error TEXT`
// is in this tier (the directive itself is the whitelist, so the two runners cannot
// drift). The emit message comes from the same seed both runners drive, so message
// substrings are pinned here too (folded like the corpus oracle's matcher). A plain
// `vl check` skips codegen (exit 0 on these), hence `--codegen`.
const emitErrorsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@emit-error (.*)$/gm)].map((m) => m[1]);
const foldMsg = (s: string) => s.toLowerCase().replace(/`/g, "'");
const walkVl = function* (dir: URL): Generator<string> {
  for (const entry of Deno.readDirSync(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walkVl(child);
    else if (entry.name.endsWith(".vl")) {
      yield child.pathname.slice(CASES.pathname.length);
    }
  }
};
const EMIT_REJECT_CASES = [...walkVl(CASES)]
  .filter((rel) => emitErrorsOf(src(rel)).length > 0)
  .sort();

for (const rel of EMIT_REJECT_CASES) {
  Deno.test({
    name:
      `native-align emit-reject: ${rel} — vl check --codegen rejects at emit`,
    ignore: !ENABLED,
    fn: async () => {
      const wants = emitErrorsOf(src(rel));
      const r = await vl(["check", "--codegen", path(rel)]);
      if (r.code === 0) {
        throw new Error(
          `${rel}: expected an emit-stage rejection, vl check --codegen exited 0`,
        );
      }
      const all = r.out + r.err;
      const stage = stageOf(all);
      if (stage !== "emit") {
        throw new Error(
          `${rel}: rejected at "${stage}" stage, expected emit — an earlier-stage reject belongs in REJECT_CASES/@error\n  ${
            all.trim().split("\n").slice(0, 2).join(" / ")
          }`,
        );
      }
      for (const want of wants) {
        if (!foldMsg(all).includes(foldMsg(want))) {
          throw new Error(
            `${rel}: expected the emit error to contain ${
              JSON.stringify(want)
            }\n  got: ${all.trim().split("\n").slice(0, 3).join(" / ")}`,
          );
        }
      }
    },
  });
}
