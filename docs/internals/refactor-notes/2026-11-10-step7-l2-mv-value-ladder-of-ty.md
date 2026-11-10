# Step 7 L2 §7: the mv value ladder asks the type (79 → 71 parses), 2026-11-10

The L2 §7 deviation counts 41 `tyToEmitName` renders and 79 type-string parses in the emitter.
This PR cuts 8 parses in `emit_shape_rows.vl`, all in the mv value ladder. Each of the 8 sites
already held the value's arena type and parsed the spelling anyway. No render moves.

The base is master `e8c87bb0`, with a fixpoint seed on both sides. The population is the sweep's
`cases` population: 7,424 `tests/cases` programs.

## Method

The probes are an accumulator in a scratch compiler, which was never refreshed into a seed. Each
probe site appends an id to a per-compile list. At the end of `emitProgram`, a program whose list
is not empty fails with all of its ids in one message, so one sweep reads every site at once.
This sidesteps `emitFail`'s first-marker-only reporting. A program that master already
emit-rejects is not seen. The positive control is the reach probes: `nr`, `m1r`, `m2r` and `m3r`
fired in 61, 51, 26 and 65 programs. The probes ran on `62b80f09`. `emit_shape_rows.vl` is the
same file at `e8c87bb0`.

Two questions were probed at each site:

- does the site ever run with no type (`ty < 0`)?
- with a type in hand, does the type twin ever disagree with the parse?

## Probed

| site | parse | twin | no type | disagree |
| --- | --- | --- | --- | --- |
| `nulRefMapValInnerOfTy` | `annArrowAt(peelGroupParens(inner))` | `tyIsFuncArena(tyPeelNul(ty))` | 0 | 0 |
| `nulRefMapValInnerOfTy` | `nameIsArray(inner)` | `tyIsArray(tyPeelNul(ty))` | 0 | 0 |
| `nulRefMapValInnerOfTy` | `nameIsRefArray(inner)` | `tyIsRefArray(tyPeelNul(ty))` | 0 | 0 |
| `mvValKindOfNameTy` | `nameIsLitUnionType(v) \|\| nameIsOneStrLit(v)` | `tyIsLitUnionOrLit(ty)` | 4 programs | 0 |
| `mvValKindOfNameTy`, nullable arm | `nameIsRefArray(nin)` | `tyIsRefArray(tyPeelNul(ty))` | 0 | 0 |
| `mvValKindOfNameTy`, function arm | `annArrowAt(v) >= 0` | `tyIsFuncArena(ty)` | 0 | 2 programs, see below |
| `mvValNamesCompat` | `nameIsLitUnionType(ve)`, `(va)` | `tyIsLitUnion(veTy)`, `(vaTy)` | 1 program | 0 |

There are two notes on the table:

- **The no-type reaches agree.** At the literal-union rung, the four untyped values are spelled
  `string`, `A`, `boolean` and `i32`. `i32` and `boolean` return before the rung, and the parse
  says no for the other two, as -1 does. The one untyped `mvValNamesCompat` pair is `string`/`R`
  in `maps/map-get-through-unannotated-parameter.vl` (P6 of `#7090`).
- **The two function-arm disagreements have no emitter name.** In each case the arena type is a
  `TyFunc` and the spelling is `""`. The programs are
  `generics/generic-function-stored-through-parameter-inferred-local-and-map.vl` and
  `generics/lambda-any-position-per-instance.vl`. The type twin is gated on
  `tyEmitNameNonEmpty`, which is `mvValIsRefList`'s rule: a hole or generic function's slot is
  minted once a pin names it.

## Changed

- `nulRefMapValInnerOfTy`: the member's closure, list and ref-list tests read `tyPeelNul(ty)`.
  `nrmInnerArrow` (an index read only as `>= 0`) is now the flag `nrmInnerClosure`.
- `mvValKindOfNameTy`: the literal-union, nullable ref-list and function rungs ask `ty` only, and
  -1 is none of them.
- `mvValNamesCompat`: the literal-union leniency asks each side's type.

## Measured but not cut

These sites hold a type parameter, but the type is missing or disagrees too often to cut.

| site | no type | disagree |
| --- | --- | --- |
| `internShapeDeepTyGo`: `nullablePartOf(nm)` | 707 programs | 162 (the type is not a `TyNullable`) |
| `internShapeDeepTyGo`: `mapValNameOf(nm)` | 44 | — |
| `internFuncTypeShapesTyGo`: `nullablePartOf(nm)` | 7 | 8 |
| `canonLitUnionArms`: `nameIsLitUnionType(atoms[h])` | 251 | — |
| `monoCoerceWrittenLetTys`: `annArrowAt(tname0)` | 17 | 5 |
| `fieldCodeOfSpelling` (`recTy < 0`) → `mapValKindLowerable` | 2 (`{[string]:A}`, `{[string]:boolean}`) | — |

`fieldMapLowerable`'s spelling fallback (`fTy < 0`) and `structElemArrayLowerable`'s
`nullablePartOf` were never reached with no type, and that `nullablePartOf` never disagreed with
`TyNullable`. Neither is cut here. `mapValKindLowerable` keeps the `fieldCodeOfSpelling` caller,
and the element's inner spelling still feeds the shape test.

## Proof

- **Byte sweep.** `sweep.vl record --population cases` with the master fixpoint and with the
  candidate fixpoint: of 7,424 programs, 7,424 are the same. That is 0 bytes-only movers, 0
  output movers, 0 runs → not-runs and 0 new compiler traps.
- **The render-parse ratchet** goes from 79 to 71 parses (41 renders unchanged), with
  `--write-baseline` in this PR.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, and `check-filed-witnesses --strict` on both inventories.
