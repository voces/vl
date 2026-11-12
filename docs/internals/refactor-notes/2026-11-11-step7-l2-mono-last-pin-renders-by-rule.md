# Step 7 L2 §7: six more mono renders take the naming rule's spelling (renders 28 → 22); emit_mono keeps three, 2026-11-11

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

## Dropped after the sweep: `monoPinUnionNameOfTy` breaks D15713

After this PR's sweep, w321's #7302 closed D15713: the `??` that is a union only at an instance.
In that program, `pick` at `J` joins a map read with `J` and returns `i32|null`, through the
registry row #7278 mints. On the merged tree, D15713's witness built an invalid module. The
reader expected `#anon1` and found `J`.

Each registry site was reverted alone:

- reverting `monoPinUnionNameOfTy` alone makes the witness run (`2`);
- reverting `monoPinUnionBoxed` alone does not.

`monoPinUnionNameOfTy` names that instance-only row, and its reader resolves the row by the
render's spelling. The rule's spelling names the box another row. That site goes back to the
render.

## Changed

6 of the 7 survivors call `monoPinSpellShaped`, and their renders are deleted.
`monoPinUnionNameOfTy` keeps its render.

## Floors left in emit_mono

| site | floor | losing cells |
| --- | --- | --- |
| `monoPinAnnSpelling` | the literal-`is` union reader keys a box by the render's spelling: an alias kept by name (`i32\|AB`), a lone string literal widened (`i32\|string`) | D15170, D4203, `generics/literal-test-on-param-joined-with-a-literal.vl`, `unions/generic-param-literal-member-is-runs.vl` |
| `monoSubstAnonShapes` | an `#anon` binding re-spelled as its record for the body's annotations; the rule's spelling of that record traps an `is` over it | `generics/generic-is-over-anonymous-record-pin.vl` |
| `monoPinUnionNameOfTy` | the instance-only union row of a `??` (#7278) is read back under the render's spelling | D15713 (invalid module) |

## Proof

- **Byte sweep.** The master fixpoint (`ea1e3a11`, after #7302) against the candidate fixpoint,
  after the drop: same 23,928, bytes-only 5, output movers 0, runs → not-runs 0, new compiler
  traps 0. The candidate also has this PR's 2 new fixtures.
  - The bytes-only movers are the two `rv3310_nested_fn` cells, `unions/deep-is-json-shape-walk.vl`,
    `unions/deep-is-site-beside-value-union-alias-arm.vl` and
    `unions/deep-is-site-keeps-a-union-alias-arm.vl`.
  - Each moves only a union row's first-registered order (the arm tags), and its output is unchanged.
  - D15713's module is the same as master's.
- **`check-filed-witnesses --strict`** on both inventories: 4,740 graded, 0 moved, 0 output
  mismatches.
- **render-parse** goes from 28 / 59 to 22 / 59, with `--write-baseline` in this PR.
- **Locally:** refresh to a fixpoint, lint-self, and dead exports 0. The other gates are listed in
  the PR.
