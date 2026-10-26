# Track A — Type system

The forward items of the type-system track, linked from [`ROADMAP.md`](../../ROADMAP.md). The
rules there apply here, and `tests/roadmap_honest_test.ts` gates this file too.
- A finished item is deleted in the PR that adds its CHANGELOG line.
- A defect is a row in [`inventory/`](../internals/inventory/), and this file cites only open rows.
- A question for the owner is a section of [`open-rulings.md`](../internals/open-rulings.md).

- **A5. Flow narrowing.** Three gaps remain:
  - an index after `?.` (`o?.y[0]`) is a check error;
  - a `?.` call over a map read is declined (re-probe before scheduling);
  - `case` and multi-guard have no grammar.

  Join narrowing slices are ruled in the flow-narrowing ruling and tracked there.
- **A4/A5b. Pruning by negation.** `foo("ok")` infers `i32 | string`, while `foo(true)` infers
  `string`. The else branch does not prune by negation (string minus string = never). A4's only
  consumer is A5b. Whether open-world negation is built at all is an open ruling (open-rulings §E).
- **A5c. Literal-preserving inference for strings.** A function whose every return is a string
  literal infers `string`, not the literal. `let` keeps `string` by ruling (DECISIONS 2026-09-23).
- **A6. `is`.** Add a `ref.test` fast path for ref-vs-ref, which is unmeasured.
- **A6b. Proof-carrying narrowing.** Two stages:
  - **Stage A.** A guard on a call's result narrows its argument (`if bar(x) is null`), via the
    effects summary (function-effects-design.md §G6).
  - **Stage B.** A stored witness narrows too (`const f = bar(x); if f is null` narrows `x`). It
    holds until `callMayWrite` says a call may write `x` or `f`.
- **A6c. Narrowing across calls.** Three cases:
  1. Keep a narrowing when the writer can only write a member it admits. This needs A6b's per-path W.
  2. D2408: a bare-name re-test inside an arm whose condition's call ended the narrowing.
  3. The owner's deferred ideal: keep a narrowing across an escaping closure when no write of the
     path can run first.

  Still open: ban side effects in operator overloads, or let one modify only its operands.
- **A8. Exact/Inexact** (ruled 2026-08-18). Parameters are Inexact, values are Exact, and v1 has no
  annotation surface. No witness shows unbuilt work, so find one or demote the item to ruled-only.
- **A9. Readable/Writable variance beyond lists.** This covers `readonly` on records, maps, fields
  and exports, and inferred read-only parameters.
  - Readonly record covariance is planned as an additive extension (record-covariance ruling).
  - The item is backlogged behind demand.
  - The A9 container-copy diagnostic still says "not yet supported by codegen", but the ruling made
    that refusal DESIGN, so reword it.
- **Width subtyping, the container half.** `Wide[]` into `Narrow[]` still refuses "not yet supported
  by codegen", which was ruled a gap on 2026-09-01. The spread into a rest parameter is D13960.
- **A10. Generics.** Two gaps:
  - `map` and `filter` on `Map`/`Set`;
  - const generics: `type Buf<N: i32>` is a parse error, and they gate Decimal (B2) and the
    fixed-array direction.
- **A12. Soundness corpus.** Keep growing it. The naming contract is in
  `tests/cases/soundness/README.vl`. Harness gap: there is no exact-output directive, so `@run` plus
  `@log` cannot pin a program that exits 0 and prints the wrong output.
- **A13. Operator-constraint inference.** Two gaps: the stored-closure operator case (`vec + vec` via
  a `+` field), and the E7 `any` rendering in these diagnostics. Re-probe before scheduling.
- **A15. Reference identity and equality.** The 2026-09-01 ruling is unbuilt, and a later diagnostic
  (DV-1214) tells users "VL has no `===`". The owner reconfirms the ruling first (open-rulings §E).
  Then:
  1. `===` and `!==` become `ref.eq` on reference reps, and `==` on a function becomes a check
     error. The acceptance is a value table, inside and outside an `is` guard:
     - the same object is true;
     - equal objects are false;
     - values across union arms are false;
     - `null === null` is true.
  2. Struct keys for `Map`/`Set` (A15.2), refused today with "A P-keyed Map isn't supported yet". A
     key is eligible when it is `==`-comparable. Hash and `==` share one lowering, and `-0.0` folds
     into `0.0`.
  3. `IdentityMap` and `IdentitySet` in std, after item 1 (std-api-reviewer).

  The self-host struct/function-value equality remainder could not be verified: confirm it, then
  delete it.
- **A16. Literal unions.** The mixed box (`K | string`, and the `K | K2 | null` niche) has no tag
  scheme for atoms (open-rulings A16-tag-scheme-kind-vs-band); `ref.i31` is ruled out. Optional: O(1)
  ordering for a string literal union's `<`, built only if a profile asks.
- **A-robust.** An unresolved `Infer`/`Unknown` gives "cannot infer — annotate", never a codegen error
  or a crash. Still to audit: an unconstrained `Map()`/`Set()` with no uses
  (`tests/cases/maps/error-uninferred.vl` pins one).
- **`[null]`, the later target** (spec Q3). Infer the element from the first non-null use.
- **Variadics.** A rest parameter is deliberately not part of a function type, and an `extern` cannot
  take one.
- **Deep `is` over Json.** Two open rows:
  - D1198: a recursive JSON shape target has no walker;
  - D1190: a deep `is` arm that rebinds or writes the tested place refuses.

  The `as` trio over Json needs four things: the S4 ruling (open-rulings §E), `"shape"` in
  `JsonError.kind` (std-api-reviewer), a JSON-pointer path in the walker, and a position matrix
  before the checker narrows.
- **Destringify types, the standing check.** Its "How to verify" section in
  [`destringify-types-program.md`](../internals/destringify-types-program.md) shows three live
  rendered-type comparisons:
  - `call_bind_shadow.vl:76`;
  - `check_match_desugar.vl:216`;
  - `check_narrow_flow.vl:1343`.

  Classify each as nominal or diagnostic, or fix it. The migration's L6 work may delete them.
- **A clamp-to-range `std:math` helper** is the ruled substitute for saturating casts (DECISIONS,
  "saturation is a std helper"). Confirm it exists or file it.
- **B21.3, `match` over literal members.** Check which numeric-literal spelling (`n is 0`) still
  refuses. The const-pattern ruling answers part of it.
- **Undeclared-identifier "did you mean".** Reuse `tyEditDist` over the in-scope names.
- **`docs/guide/soundness.md`.** Two changes:
  - replace the stale "silently accepted and emits invalid wasm" example with the current ruled
    refusal;
  - add the clause-1 / clause-2 paragraph.
