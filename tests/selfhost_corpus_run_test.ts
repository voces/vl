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
// files: 71 PASS; 70 emit gaps (lambdas/for-in/…), 77 checker false-rejects, 76 parse
// gaps, 28 scratch-needing top-level statements (emit validly only inside
// functions today), 11 emitter traps (real bugs to pin), 4 log diffs (bool prints
// as 1/0 — needs bool-ness threading per the plan's step 3).
//
// ── CHECK→EMIT SUBSTRATE (formerly selfhost_check_emit_test.ts) ───────────────
// The self-hosted `vl check` substrate — type-check GATES emit, end to end in VL.
//
// This wires the self-hosted TYPECHECKER (`compiler/typecheck.vl`) into the chain:
//
//     lexer → parser → checkProgram → (gate) → emitProgram
//
// — all as one VL-compiled module: a clean program type-checks and then emits a
// valid, instantiable wasm module; an ill-typed program is REJECTED by
// `checkProgram` and NEVER reaches `emitProgram`. That is the substrate of a
// self-hosted `vl check`.
//
// ARCHITECTURE NOTE — why this is pure wiring. The self-host emitter takes ONLY
// the parser arena and re-derives all type info itself (`collectS`/`collectU`/
// `buildFnMap` + its own narrowing stack). So `checkProgram` is a DIAGNOSTICS GATE
// — it does not hand any data to `emitProgram`, and wiring it in does not change
// emit. The five modules concatenate with ZERO symbol collisions beyond the usual
// lexer renames.
//
// SCOPE (Phase 1). `typecheck.vl` today covers a SUBSET — primitives, arithmetic /
// logical / comparison / equality ops, function calls (arity + types), member
// access, `let`/`func`/`if`/`return`/`block`, structural assignability,
// scope/shadowing. These cases stay inside that subset on BOTH sides (check + emit).
//
// CONSOLIDATION NOTE: the check→emit cases ride the SAME single compiled module as
// the corpus-run cases above via a second export set: `srcOfCheckEmit(idx)` /
// `runCheckEmit(idx)` / `checkDiagCount()` / `checkDiagMsgLen(i)` /
// `checkDiagMsgAt(i,j)`. This eliminates one expensive (~50s) cold base compile
// from the CI critical path (2 compiles → 1; lexer+ast+parser+typecheck+wasmEmit
// compiled once for both test sets).

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
  "arrays/annotated-empty-ok.vl",
  "arrays/basics.vl",
  "arrays/boolean-elements.vl",
  "arrays/capacity-and-get.vl",
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
  "functions/early-return.vl",
  "functions/escaping.vl",
  "functions/lambda.vl",
  "functions/closure.vl",
  "functions/forward-call-inferred.vl",
  "functions/forward-reference-needs-return-type.vl",
  "functions/forward-reference-nested-struct-param.vl",
  "functions/forward-reference-struct-array-param.vl",
  "functions/forward-reference-struct-param.vl",
  "functions/forward-reference.vl",
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
  "sets/basics.vl",
  "sets/infer-from-add.vl",
  "numerics/wide.vl",
  "numerics/wide-arith.vl",
  "numerics/widening.vl",
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
  "index/read-trap.vl",
  "index/native-vs-trap.vl",
  "objects/method-shorthand-equiv.vl",
  "objects/method-shorthand-mixed.vl",
  "objects/equality.vl",
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
  "types/not-paren-is-guard-narrowing.vl",
  "types/null-coalesce.vl",
  "types/nullable-boolean.vl",
  "types/optional-chain.vl",
  "types/or-guard-narrowing.vl",
  "types/recursive-array-element.vl",
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

type Entry = { rel: string; src: string; logs: string[] };
const entries: Entry[] = WHITELIST.map((rel) => {
  const src = Deno.readTextFileSync(new URL("./cases/" + rel, import.meta.url));
  const logs = [...src.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);
  return { rel, src, logs };
});

// ── Check→emit cases (ported from selfhost_check_emit_test.ts) ───────────────
// A must-pass case: type-checks clean, emits, instantiates; `run` asserts behavior.
// A must-reject case: `checkProgram` raises a diagnostic CONTAINING `errSubstr`,
// and the gate keeps it OUT of `emitProgram` (no bytes emitted).
type CheckEmitCase =
  | { key: string; src: string; kind: "emit"; run: (call: Caller) => Promise<void> }
  | { key: string; src: string; kind: "reject"; errSubstr: string };

type Caller = (name: string, ...args: number[]) => Promise<number>;

const assertEq = (got: number, want: number, what: string) => {
  if (got !== want) throw new Error(`${what} returned ${got}, expected ${want}`);
};

const CHECK_EMIT_CASES: CheckEmitCase[] = [
  {
    key: "p_min",
    kind: "emit",
    src: "function main(): i32 {\n  return 42\n}\n",
    run: async (call) => assertEq(await call("main"), 42, "main"),
  },
  {
    key: "p_fib",
    kind: "emit",
    src:
      "function fib(n: i32): i32 {\n  if n < 2 { return n }\n  return fib(n - 1) + fib(n - 2)\n}\n" +
      "function main(): i32 {\n  return fib(10)\n}\n",
    run: async (call) => assertEq(await call("main"), 55, "fib(10)"),
  },
  {
    key: "p_locals",
    kind: "emit",
    src:
      "function f(n: i32): i32 {\n  let acc = n * 2\n  const bonus = 5\n  acc = acc + bonus\n  return acc\n}\n",
    run: async (call) => assertEq(await call("f", 10), 25, "f(10)"),
  },
  {
    key: "p_callchain",
    kind: "emit",
    src:
      "function inc(x: i32): i32 {\n  return x + 1\n}\n" +
      "function main(): i32 {\n  return inc(41)\n}\n",
    run: async (call) => assertEq(await call("main"), 42, "inc(41)"),
  },
  {
    // Structs (Phase 2): two `type` decls, an object literal typed by a `let`
    // annotation, an obj-literal `return` typed by the function's struct return,
    // struct-typed param + field reads.
    key: "t_struct",
    kind: "emit",
    src:
      "type P = { x: i32, y: i32 }\n" +
      "type Q = { a: i32, b: i32 }\n" +
      "function mk(a: i32, b: i32): P {\n  return { x: a, y: b }\n}\n" +
      "function sumXY(p: P): i32 {\n  return p.x + p.y\n}\n" +
      "function main(): i32 {\n  let p = mk(20, 22)\n  let q: Q = { a: 1, b: 2 }\n  return sumXY(p) + q.a + q.b\n}\n",
    run: async (call) => assertEq(await call("main"), 45, "sumXY+q.a+q.b"),
  },
  {
    // Structs + module globals + struct field WRITE across calls.
    key: "t_globals",
    kind: "emit",
    src:
      "type Counter = { n: i32 }\n" +
      "let base: i32 = 40\n" +
      "let C: Counter = { n: 0 }\n" +
      "function bump(): i32 {\n  C.n = C.n + 1\n  return C.n\n}\n" +
      "function main(): i32 {\n  bump()\n  bump()\n  return base + C.n\n}\n",
    run: async (call) => assertEq(await call("main"), 42, "base + C.n"),
  },
  {
    // Unions + `is` (Phase 2.2): a discriminated union, `is`-narrowing in a then
    // branch (param `n` refined to the variant struct, then a field read), union
    // construction by object literal (`{ av: x }` typed by the `Node` return).
    key: "t_union",
    kind: "emit",
    src:
      "type A = { av: i32 }\n" +
      "type B = { bv: i32 }\n" +
      "type Node = A | B\n" +
      "function f(n: Node): i32 {\n  if n is A { return n.av }\n  if n is B { return n.bv }\n  return 0\n}\n" +
      "function mkA(x: i32): Node {\n  return { av: x }\n}\n" +
      "function main(): i32 {\n  return f(mkA(7))\n}\n",
    run: async (call) => assertEq(await call("main"), 7, "f(mkA(7))"),
  },
  {
    // Two distinct unions coexisting; `is`-narrowing on each; union locals built by
    // annotation-typed object literals.
    key: "t_multiunion",
    kind: "emit",
    src:
      "type Lit = { val: i32 }\n" +
      "type Var = { vname: string }\n" +
      "type Node = Lit | Var\n" +
      "type TyInt = { width: i32 }\n" +
      "type TyStr = { len: i32 }\n" +
      "type Ty = TyInt | TyStr\n" +
      "function readNode(n: Node): i32 {\n  if n is Lit { return n.val }\n  return 0\n}\n" +
      "function readTy(t: Ty): i32 {\n  if t is TyInt { return t.width }\n  return 0\n}\n" +
      "function main(): i32 {\n  let n: Node = { val: 10 }\n  let t: Ty = { width: 20 }\n  return readNode(n) + readTy(t)\n}\n",
    run: async (call) => assertEq(await call("main"), 30, "readNode+readTy"),
  },
  {
    // `is`-narrows `n` to A, then reads a field that only B has → rejected.
    key: "r_union_wrong_field",
    kind: "reject",
    src:
      "type A = { av: i32 }\n" +
      "type B = { bv: i32 }\n" +
      "type N = A | B\n" +
      "function f(n: N): i32 {\n  if n is A { return n.bv }\n  return 0\n}\n" +
      "function main(): i32 {\n  return f({ av: 1 })\n}\n",
    errSubstr: "no field",
  },
  {
    // A union naming an undeclared variant → rejected in the pre-pass.
    key: "r_union_unknown_variant",
    kind: "reject",
    src:
      "type A = { av: i32 }\n" +
      "type N = A | Bogus\n" +
      "function f(n: N): i32 {\n  return 0\n}\n" +
      "function main(): i32 {\n  return 0\n}\n",
    errSubstr: "unknown type",
  },
  {
    // Arrays (Phase 2.3): `i32[]` annotation, empty `[]` literal typed by it,
    // `.push`, index read + write, `.length`. (No `while` — loops are a later step.)
    key: "t_array_i32",
    kind: "emit",
    src:
      "function main(): i32 {\n" +
      "  let a: i32[] = []\n" +
      "  a.push(10)\n  a.push(20)\n  a.push(30)\n" +
      "  a[1] = 99\n" +
      "  return a[0] + a[1] + a[2] + a.length\n" +
      "}\n",
    run: async (call) => assertEq(await call("main"), 142, "10+99+30+3"),
  },
  {
    // Arrays of structs (`Tok[]`): push object literals, index + field read.
    key: "t_array_struct",
    kind: "emit",
    src:
      "type Tok = { kind: string, pos: i32 }\n" +
      "function main(): i32 {\n" +
      "  let xs: Tok[] = []\n" +
      "  xs.push({ kind: \"a\", pos: 10 })\n" +
      "  xs.push({ kind: \"b\", pos: 20 })\n" +
      "  return xs[0].pos + xs[1].pos + xs.length\n" +
      "}\n",
    run: async (call) => assertEq(await call("main"), 32, "10+20+2"),
  },
  {
    // `.push` of the wrong element type → rejected.
    key: "r_array_elem_type",
    kind: "reject",
    src:
      "function main(): i32 {\n  let a: i32[] = []\n  a.push(\"hi\")\n  return a.length\n}\n",
    errSubstr: "push:",
  },
  {
    // Indexing a non-array → rejected.
    key: "r_index_non_array",
    kind: "reject",
    src:
      "function main(): i32 {\n  let x: i32 = 5\n  return x[0]\n}\n",
    errSubstr: "cannot index non-array",
  },
  {
    key: "r_struct_field_type",
    kind: "reject",
    src:
      "type P = { x: i32 }\n" +
      "function main(): i32 {\n  let p: P = { x: \"hi\" }\n  return p.x\n}\n",
    errSubstr: "cannot assign",
  },
  {
    key: "r_struct_unknown_field",
    kind: "reject",
    src:
      "type P = { x: i32 }\n" +
      "function main(): i32 {\n  let p: P = { x: 1 }\n  return p.y\n}\n",
    errSubstr: "no field",
  },
  {
    key: "r_undeclared",
    kind: "reject",
    src: "function main(): i32 {\n  return x\n}\n",
    errSubstr: "undeclared identifier",
  },
  {
    key: "r_arity",
    kind: "reject",
    src:
      "function f(a: i32): i32 {\n  return a\n}\n" +
      "function main(): i32 {\n  return f()\n}\n",
    errSubstr: "wrong number of arguments",
  },
  {
    key: "r_assign_mismatch",
    kind: "reject",
    src: "function main(): i32 {\n  let x: i32 = \"hi\"\n  return x\n}\n",
    errSubstr: "cannot assign string",
  },
];

const driver = `
function loadToks(src: string): i32 {
  let r = tokenize(src)
  let i = 0
  while i < r.tokens.length {
    let t = r.tokens[i]
    P.toks.push({ kind: t.kind, text: t.text, pos: i, start: t.start, line: t.line, col: t.col })
    i = i + 1
  }
  // Fold lexer diagnostics into the parse-stage store (mirrors the production
  // driver's vcLoadToks + the host's checkOnly): a LEX error like an empty \`''\`
  // or multi-char \`'ab'\` char literal becomes a parse-stage rejection.
  let d = 0
  while d < r.diags.length {
    P.diags.push({ msg: r.diags[d].msg, at: 0 })
    d = d + 1
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
function srcOfCheckEmit(idx: i32): string {
${CHECK_EMIT_CASES.map((c, i) => `  if idx == ${i} { return ${JSON.stringify(c.src)} }`).join("\n")}
  return ""
}
export function runCheckEmit(idx: i32): i32 {
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
  loadToks(srcOfCheckEmit(idx))
  let root = parseProgram()
  if P.diags.length > 0 { return 1 }
  let nerr = i32ToStr(checkProgram(root))
  if T.diags.length > 0 { return 2 }
  let rc = emitProgram(root)
  if rc < 0 { return 3 }
  0
}
export function checkDiagCount(): i32 { T.diags.length }
export function checkDiagMsgLen(i: i32): i32 { T.diags[i].tmsg.length }
export function checkDiagMsgAt(i: i32, j: i32): i32 { T.diags[i].tmsg[j] }
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
        __print_i64__: (v: bigint) => got.push(String(v)),
        __print_f32__: (v: number) => got.push(String(v)),
        __print_f64__: (v: number) => got.push(String(v)),
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

// ── import functypes are STANDALONE rectypes (wasmtime-portable) ──────────────
// A `print` import's functype must NOT live inside the module's WasmGC rec group:
// a rec-group-member functype carries nominal rec-group identity that a strict-GC
// host (wasmtime) refuses to match against a host-provided function, so the import
// fails to instantiate (V8 is lenient and accepts either). This decodes a real
// emitted print module and asserts every imported func's type index lands AFTER the
// rec group's members — the invariant that keeps self-hosted output portable.
Deno.test("corpus-run: emitted print imports use STANDALONE functypes (wasmtime-portable)", async () => {
  const exp = await getPipeline();
  // LEB128 reader over a byte array, threaded position.
  const uleb = (b: Uint8Array, p: number): [number, number] => {
    let v = 0, s = 0, n = p;
    for (;;) {
      const c = b[n++];
      v |= (c & 0x7f) << s;
      if ((c & 0x80) === 0) break;
      s += 7;
    }
    return [v >>> 0, n];
  };
  // Decode sections → { typePayload, importPayload } (or undefined if absent).
  const sections = (b: Uint8Array): Map<number, Uint8Array> => {
    const out = new Map<number, Uint8Array>();
    let i = 8; // skip magic + version
    while (i < b.length) {
      const id = b[i++];
      let size: number;
      [size, i] = uleb(b, i);
      out.set(id, b.subarray(i, i + size));
      i += size;
    }
    return out;
  };

  let checked = 0;
  for (let idx = 0; idx < entries.length; idx++) {
    if (exp.runOne(idx) !== 0) continue;
    const len = exp.rbyteLen();
    const bytes = new Uint8Array(len);
    for (let j = 0; j < len; j++) bytes[j] = exp.rbyteAt(j);
    const secs = sections(bytes);
    const imp = secs.get(2);
    if (!imp) continue; // no import section → no print → nothing to check

    // Type section: the FIRST rectype is the rec group (0x4e <count>); its members
    // occupy type indices [0, recCount). Anything emitted after is standalone.
    const ty = secs.get(1)!;
    let p = 0;
    [, p] = uleb(ty, p); // section's rectype count
    if (ty[p] !== 0x4e) throw new Error(`${entries[idx].rel}: type section does not start with a rec group`);
    p += 1;
    let recCount: number;
    [recCount, p] = uleb(ty, p);

    // Import section: every func import (kind 0) must reference a type index >= recCount.
    let q = 0;
    let nImports: number;
    [nImports, q] = uleb(imp, q);
    for (let k = 0; k < nImports; k++) {
      let mlen: number;
      [mlen, q] = uleb(imp, q); q += mlen; // module name
      let flen: number;
      [flen, q] = uleb(imp, q); q += flen; // field name
      const kind = imp[q++];
      if (kind === 0) {
        let typeIdx: number;
        [typeIdx, q] = uleb(imp, q);
        if (typeIdx < recCount) {
          throw new Error(
            `${entries[idx].rel}: imported functype index ${typeIdx} is INSIDE the rec group ` +
              `(recCount=${recCount}) — would fail to instantiate on a strict WasmGC host`,
          );
        }
      } else if (kind === 1) { q += 0; // table — not emitted, skip defensively
      } else if (kind === 2) { let f: number; [f, q] = uleb(imp, q); if (f === 1) [, q] = uleb(imp, q); else [, q] = uleb(imp, q);
      } else if (kind === 3) { q += 1; [, q] = uleb(imp, q); }
    }
    checked++;
    if (checked >= 3) break; // a few real print modules is enough to lock the invariant
  }
  if (checked === 0) throw new Error("no emitted print module found to check the import-functype invariant");
});

// ── Check→emit test registrations ────────────────────────────────────────────
// Helper: read a diagnostic tmsg back from wasm as a JS string.
const getDiagMsg = (
  exp: Record<string, (...a: number[]) => number>,
  i: number,
): string => {
  const len = exp.checkDiagMsgLen(i);
  const cps: number[] = [];
  for (let j = 0; j < len; j++) cps.push(exp.checkDiagMsgAt(i, j));
  return String.fromCodePoint(...cps);
};

CHECK_EMIT_CASES.forEach((c, idx) => {
  if (c.kind === "emit") {
    Deno.test(`check→emit: ${c.key} type-checks clean, emits, runs`, async () => {
      const exp = await getPipeline();
      const st = exp.runCheckEmit(idx);
      if (st !== 0) {
        const stage = ["", "parse", "typecheck", "emit"][st] ?? String(st);
        if (st === 2) {
          const n = exp.checkDiagCount();
          const msgs: string[] = [];
          for (let i = 0; i < n; i++) msgs.push(getDiagMsg(exp, i));
          throw new Error(
            `${c.key}: expected a clean type-check, got type errors: ${msgs.join(" | ")}`,
          );
        }
        throw new Error(`${c.key}: VL pipeline failed at ${stage}`);
      }
      const len = exp.rbyteLen();
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) bytes[j] = exp.rbyteAt(j);
      await WebAssembly.compile(bytes); // valid wasm
      const module = await WebAssembly.compile(bytes);
      const instance = await WebAssembly.instantiate(module, {});
      const caller: Caller = (name, ...args) => {
        const fn = instance.exports[name] as (...a: number[]) => number;
        return Promise.resolve(fn(...args));
      };
      await c.run(caller);
    });
  } else {
    Deno.test(`check→emit: ${c.key} is REJECTED by the type-checker (gate blocks emit)`, async () => {
      const exp = await getPipeline();
      const st = exp.runCheckEmit(idx);
      if (st !== 2) {
        const stage = ["ok", "parse", "typecheck", "emit"][st] ?? String(st);
        throw new Error(
          `${c.key}: expected type-check rejection (stage 2), got stage ${stage}`,
        );
      }
      // Verify the gate: no bytes should have been emitted.
      // (runCheckEmit returns early on T.diags.length > 0, so W.bytes stays empty.)
      const byteLen = exp.rbyteLen();
      if (byteLen > 0) {
        throw new Error(
          `${c.key}: the gate LEAKED — an ill-typed program reached emitProgram (${byteLen} bytes emitted)`,
        );
      }
      // Verify the error substring appears in at least one diagnostic.
      // NOTE: if a case's errSubstr is not found, the test notes which diagnostics
      // were actually raised so the substr can be updated.
      const n = exp.checkDiagCount();
      const msgs: string[] = [];
      for (let i = 0; i < n; i++) msgs.push(getDiagMsg(exp, i));
      if (!msgs.some((m) => m.includes(c.errSubstr))) {
        throw new Error(
          `${c.key}: no diagnostic contained "${c.errSubstr}"; got: ${msgs.join(" | ")}`,
        );
      }
    });
  }
});
