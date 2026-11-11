# Step 7 L2 §7: `annRetNameOf` deleted (60 → 59 parses), and emit_base's other 21 parses named, 2026-11-11

`emit_base.vl` held 22 of the emitter's 60 type-string parses. This note lists each one's callers
on master `765cf650`+. It deletes the one parse whose callers had all moved to a type, and names
the owner of each of the other 21.

The base is master, with a fixpoint seed on both sides. The population is the whole sweep:
23,916 programs.

## Probes

The probe ran in a scratch compiler that was never refreshed into a seed, using the accumulator
of the predicates note. A reach tag on each site served as the control.

- **`internCloSigOfAtomTy`'s skip of a mixed-union `$fnsig`.** This is
  `nulCloMixedUnionUnregistered(atom, ty)`, which cuts the arm spelling's result with
  `annRetNameOf`. It was compared with its typed twin, `nulCloMixedUnionUnregisteredTy(ty)`. The
  site is reached in 90 programs. The type is never missing, and the two answers never differ.
- **`collectATypeRef`'s untyped fallback.** An annotation with no type is a function when its
  spelling has a top-level arrow. That fallback is reached in 25 programs, and it answers
  "function" in 24 of them, all for the generic original's `(T) => T`. That spelling reaches no
  other rung of the ladder, so the arm it chose changes nothing.

## Changed

- `internCloSigOfAtomTy` became `internCloSigOfArmTy(kIn, ty)`. It skips a mixed-union result by
  `nulCloMixedUnionUnregisteredTy(ty)`. The spelled twin `nulCloMixedUnionUnregistered` and its
  helper `cloResultAtomOf` had no caller left, and are deleted.
- `collectATypeRef` asks `tyIsFuncArena` alone. An untyped annotation is not taken for a function
  by its spelling.
- `annRetNameOf` had no caller left, and is deleted (the `annArrowAt` parse at emit_base's old
  :3397).

## The 21 left in emit_base, by owner

| parse sites | predicate | callers outside emit_base | owner |
| --- | --- | --- | --- |
| 3 | `nameIsNulString`, `nameIsNulBool`, `nulLitUnionScan` | `emit_shape_rows` (field codes, mv value kind) | w314 (field-code cut 4) and w311 |
| 5 | `nameIsElemArray`, `nameIsI32ListArray`, `nameIsMapArray`, `nameIsClosureArray` (2) | `emit_shape_rows` ×9, `emit_shape_intern` ×2, `emit_mono` ×2 | w311 (ref-list kind ladder); the shape walk's 2 go with w314's cut 4 (w310); w317 |
| 1 | `nameIsStrLitSet` | `nulLitUnionScan` only | goes with `nulLitUnionScan` |
| 2 | `nameIsMap`, `nameIsMapMemberUnion` | `emit_union_atoms` ×5, `emit_shape_rows`, `emit_shape_intern`; through `nameIsBareMap`, five more files | w309 / w316 for the map arms; the shape walk's goes with cut 4 |
| 4 | `parenUnionArrElemName` | `emit_shape_rows` ×3, `emit_mono`, `emit_fn_scans` | w311; w317. `emit_fn_scans` needs the union-element test from w316's registry (P7 in the predicates note) |
| 1 | `atomsHaveValueAtom` | `emit_union_registry` | w316 |
| 1 | `annFnDecompose` | `emit_mono` ×4, `emit_shape_intern` | w317; the shape walk's goes with cut 4 |
| 4 | `monoTyParamOf` (1), `monoSubstAnn` (3) | `emit_mono` | w317 |

## Proof

- **Local full sweep.** Both sides use `--prove-fixpoint` seeds. All 23,916 programs are the
  same: 0 bytes-only movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** With `--findings` from `render-parse-census.vl`, the count goes from 35
  renders and 60 parses to 35 and 59. `emit_base.vl` goes from 22 parses to 21.
  `--write-baseline` is in this PR. The rewrite also drops one `emit_mono` render entry that
  another lane's PR had already removed.
- **Checks.** lint-self is clean. `cases_wasm` passes 7,442 with 0 failed. The export budget,
  with findings from `dead-exports.vl`, has 0 dead exports.
