# Step 7 L2 §7: seven more mono renders take the naming rule's spelling (renders 28 → 21); emit_mono keeps two, 2026-11-11

After #7298, emit_mono held 9 `tyToEmitName` renders. `monoPinAnnSpelling` was tried in #7276
(4 programs lose). This PR tries the other 8, replacing each render with `monoPinSpellShaped`.

The base is #7298 merged into master, with a fixpoint seed on both sides. The population is the
whole sweep: 23,916 programs.

## Trials

Each site was swept alone against the base seed.

| site | same | bytes-only | runs → not-runs |
| --- | --- | --- | --- |
| `monoListUnionRowName` (a member with no list row) | 23,916 | 0 | 0 |
| `monoNarrowedPinName` | 23,916 | 0 | 0 |
| `monoNicheWidenedPinName` | 23,916 | 0 | 0 |
| `monoPreBindNumJoin` (the `tvV` binding of a numeric join) | 23,916 | 0 | 0 |
| `monoInstanceRetSpelling` | 23,916 | 0 | 0 |
| `monoPinUnionBoxed` (the union registry name) | 23,914 | 2 | 0 |
| `monoPinUnionNameOfTy` (the union registry name) | 23,913 | 3 | 0 |
| `monoSubstAnonShapes` | 23,915 | 0 | **1**: `generics/generic-is-over-anonymous-record-pin.vl`, a compiler trap |
| the 7 survivors together | 23,915 | 1 | 0 |

## The bytes-only mover

The bytes-only mover, when all 7 are applied together, is
`generics/join-of-lists-literal-union-beside-string-at-instance.vl`. Its output is unchanged. In
its disassembly, one union arm's tag constant moves (`i32.const 0` → `2`) and the matching
branch is reordered.

That is because the union-registry name is now the rule's spelling, with members sorted. The row
registered under it orders its arms that way. The registry names a union by spelling (L6, w316),
so its tag order follows the name.

The two distilled cells that moved under the registry sites alone (`rv3310_nested_fn__k_p__isall`
and `rv3310_nested_fn__p_k__isall`) do not move when all seven are applied.

## Changed

The 7 surviving sites call `monoPinSpellShaped`, and their renders are deleted.

## Floors left in emit_mono

| site | floor | losing cells |
| --- | --- | --- |
| `monoPinAnnSpelling` | the literal-`is` union reader keys a box by the render's spelling: an alias kept by name (`i32\|AB`), a lone string literal widened (`i32\|string`) | D15170, D4203, `generics/literal-test-on-param-joined-with-a-literal.vl`, `unions/generic-param-literal-member-is-runs.vl` |
| `monoSubstAnonShapes` | an `#anon` binding re-spelled as its record for the body's annotations; the rule's spelling of that record traps an `is` over it | `generics/generic-is-over-anonymous-record-pin.vl` |

## Proof

- **Byte sweep.** The #7298 fixpoint against the candidate fixpoint: same 23,915, bytes-only 1
  (above), output movers 0, runs → not-runs 0, new compiler traps 0.
- **render-parse** goes from 28 / 60 to 21 / 60, with `--write-baseline` in this PR.
- **Locally:** refresh to a fixpoint, lint-self, and dead exports 0. The other gates are listed in
  the PR.
