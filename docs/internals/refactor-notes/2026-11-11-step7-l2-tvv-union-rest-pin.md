# Step 7 L2 §7: the union-rest pin is decided by type, 2026-11-11

`monoPreBindPastUnionRest` pins an open union parameter at its argument's own spelling when the
union, at the call's bindings, cannot hold the argument. It decided that twice:

- by type, `assignable(at, st)` for the argument's checked type `at` and the substituted type
  `st`;
- by text, substituting `tvV` through the annotation (`monoSubstAnn`) and asking whether every
  atom of the pin's spelling is an atom of the result (`monoAtomsCover`, over two
  `canonEmitName` parses).

This PR asks the text question of the type instead. It removes one of the `monoSubstAnn` callers
listed in the #7125 handoff.

The base is master `97a3d03c` (`c893ca66` adds only docs), with a fixpoint seed on both sides.
The population is the whole sweep: 23,875 programs.

## Probed

The probe ran in a scratch compiler that was never refreshed into a seed, using #7119's
accumulator. A program that otherwise fails hides its probes.

| question | programs |
| --- | --- |
| reach the union arm | 76 |
| `sub != ""` differs from "`st` is closed" | 0 |
| the pin's type `ats[k]` is missing or open | 0 |
| the text test pins (`sub != ""`, not `holds`, not covered) | 2 |
| the type test (`st` closed, not `holds`, not `assignable(ats[k], st)`) differs | 0 |

The 2 programs that pin are `generics/pin-inferred-from-union-argument.vl` and
`generics/pin-union-param-binds-open-member.vl`. Every other reach is decided by `holds` before
the cover test, so the type form is graded on those 2.

## Changed

- The arm asks one closed `st` whether it holds the argument's checked type or the pin's type.
  If it holds neither, the parameter is pinned at the argument's spelling.
- `monoAtomsCover` has no other caller and is deleted. The pin-helper baseline goes from 916
  to 915.

The function still writes `tvV` for its elaboration rebinding (`tvV[ek] = esp`), so its `tvV`
parameter stays.

## Not cut

`monoSubstAnonShapes` rewrites `tvV`'s `#anon` handles into shapes before substituting. It was
reached in 936 programs and changed the pin in 7: the D641, D681 and D5083 witnesses and their
named cells. It is live, and it goes when the pin is no longer spelled.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: 23,875 of 23,875 are the
  same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Budgets:**
  - render-parse is unchanged (38 / 70); `canonEmitName` is not one of its parsers;
  - the pin helpers go from 916 to 915, with the baseline lowered here.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
