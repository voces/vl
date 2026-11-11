# Step 7 L2 §7: the layout constant and the D6090 guard read the binding's type, 2026-11-11

Item 1 of the #7125 handoff covers `monoBindOf`'s three value reads. This PR moves two of them,
and part of the third, to the type `tvT` records. The rest are measured below and stay as they
are.

The base is master `97a3d03c`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,875 programs. The probes ran on the #7125 branch (`b8498ccd`), whose sweep held 23,873.

## Probed

The probes ran in a scratch compiler that was never refreshed into a seed. It used #7119's
accumulator: a program that fires a probe fails at the end of `emitProgram` with the ids it
fired. A program that fails for another reason first hides its probes.

| site | reached in | type answer differs | type missing |
| --- | --- | --- | --- |
| `monoLayoutConstOf`, `flatConstOfNameProp(spelling)` vs the type's layout | 4 | 0 | 0 |
| `monoPinAnnotatedParam`, `bind == b` vs "`tp` was bound before" | 873 | 0 | — |
| `monoPinAnnotatedParam`, D6090 guard `b != an2`, as type index `!=` | 873 | 1 | 2 |
| the same guard, as `tyEq` (an untyped binding counts as a mismatch) | 873 | 0 | 2 |
| `monoBindSeededTyParams`, `nm` vs `monoPinAnnSpelling(t)` | 11 | 11 | 0 |
| `monoSubstAnnNode`, `sub == ""` vs `monoParamTyOpenAt` | 194 | 0 | 0 |
| `monoSubstLetType`, `sub == ""` vs `monoParamTyOpenAt` | 618 | 0 | 1 |

- **Layout constant.** In all 4 programs, the instance being built (`monoInstBindN`/`T`) binds
  the same parameters as the fold's `tvN`.
- **Index compare.** It is too strict.
  `closures/shared-type-param-handed-generic-and-concrete-or-closure.vl` binds `F` at `inc`'s
  type and then pins `id` at an equal type, which has another index.
- **The D6090 guard.** Only that program reaches the guard's function-pin conjuncts, and the
  refusal fires in none of the 23,873. D6200's read-elsewhere case now runs. The 2 untyped
  bindings never reach the guard.

## Changed

- `monoLayoutConstOf` no longer reads `tvV`. It tests presence on `tvN`, then takes the type
  from the instance's binding. `flatConstOfTyProp`, new in `check_annot_resolve.vl` next to
  `flatLayoutPinMsg`, finds the `flat` declaration by type index, as the checker's own pin
  check does. A bound but untyped parameter fails loudly. `flatConstOfNameProp` lost its only
  caller and is deleted.
- In `monoPinAnnotatedParam`:
  - the presence test `b == ""` and the pin-type rung `bind == b` both read `bound` (`strListHas`);
  - the D6090 guard compares `boundTy` with `an2Ty` by `tyEq`.

## Not cut

- **`monoPinAnnotatedParam`'s `bind = b`.** It copies an earlier parameter's spelling into
  `pinned`, so it goes when `pinned` stops being spelled.
- **`monoBindSeededTyParams`' `nm`.** The spelling it copies into `tvV` and `monoKeyExtra`
  differs from `monoPinAnnSpelling(t)` in all 11 programs that reach it, so neither column can
  take a render yet.
- **The closure gates of `monoSubstAnnNode` and `monoSubstLetType`.** They agree with
  `monoParamTyOpenAt` everywhere. Both sites still read the substituted text, so swapping the
  gate removes no `tvV` read.
- **`monoFoldTyParamLayout`'s pass-through.** It still carries `tvV`, for the `is` arm, which is
  L6's.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: 23,875 of 23,875 are the
  same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Budgets that do not move:**
  - render-parse: 38 renders, 70 parses;
  - pin helpers: no function added to `emit_mono.vl`;
  - dead exports: 0.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
