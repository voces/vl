# D17092: a `Z | null` result bound at `never` (2026-11-24, lane IR-D1)

An express clause-1 fix that #9802's Q58 position sweep found. It is in legacy's rep layer, not
an IR claim.

## Mechanism

- `rtOfNullable` (emit_rep.vl) reads `never | null` as the `null` leaf, as it reads an unfilled
  hole. A `null` handed to `Z | null` binds `Z` at `never`; the instance's annotated result had no
  rep, so `vtKindOfType` fell back to `i32` while the parameter and every caller held `nullref`.
- `nullInstanceIsResult` (emit_plan_union.vl) takes a `never | null` operand as it takes the `null`
  type (`nullOnlyTy`), so `z is null` in that instance no longer falls to the `noUnion` refusal.

## Readings

Master 8c71cd08 → head, fixpoint seeds:
- Identity: names 9,433, cases 7,763 and claimless 14,454 identical, 0 differ.
- A/B over tests/cases and probes: 2 DIFF, both this PR's fixtures; 7,823 same.
- rep-fuzz-check exact; distilled `regress.vl` loses no `runs`; filed witnesses 5,600 as filed,
  0 MOVED.
- L2 self-compile fuel: -0.00% on the base's own L2.

## Legacy tails the IR calls

None new.
