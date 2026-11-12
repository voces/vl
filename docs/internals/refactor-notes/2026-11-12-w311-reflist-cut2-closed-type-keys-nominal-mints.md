# Step 7 L6: a ref-list row a nominal spelling names is keyed by its closed element type, 2026-11-12

Lane F's cut 2. Five `ensureRefElemTys` callers withheld the key hint where the element's spelling
was nominal (`elemNameIsNominal`), or had none to give, so their row was keyed by the name.
#7306's census ruled that no row key needs declaration identity. Each of them now hands over the
element type, where that type is closed (`rlKeyTyOf`). Stacked on cut 1
(`2026-11-12-w311-reflist-cut1-list-of-row-by-type.md`).

`rlKeyTyOf(ty)` is `ty`, or -1 when `ty` is -1, holds a type parameter, or holds a function inside
a record or list. That is the gate `rlRowOfTyMinted` already uses: an open type waits for its
instance, and a function-holding record is keyed by its function-value sets.

## The sites

| site | file | the key was | the key is now |
| --- | --- | --- | --- |
| an annotation's element row (`ann`) | `emit_collect.vl` | the name, where nominal | `rlKeyTyOf(raTy)` |
| a pushed shape element (`shapeelem`, D1511) | `emit_collect.vl` | the name | `rlKeyTyOf(rlHintElemTy(i))` |
| a list-of-lists literal's mint (`lit9`) | `emit_collect.vl` | the name, where `arrLitMintHintTy` is -1 | `rlKeyTyOf(arrLitClosedElemTy(…))` |
| a map value's vals row (`mvbare`) | `emit_union_atoms.vl` | the name, where the find's spelling differed | `rlKeyTyOf(bareKindTy)` |
| a kind-9 inner row (`inner9`) | `emit_union_atoms.vl` | the name, where nominal | `rlKeyTyOf(innerKindTy)` |

## Measured

Validated `emitFail` probes over the sweep population (24,170 programs), at each site where the
hint was -1. The probe compared the key the mint used, including an `#anonN` row's record type
(`anonRowTyOfName`), with the element type's. The control fires on every unhinted call. Counts are
the first marker per program.

| site | control: reached | disagree | of them, `rlKeyTyOf` declines |
| --- | --- | --- | --- |
| `ann` | ≥ 748 | 1 | 1 (a record of functions, `d15296_bound_returned`) |
| `shapeelem` | ≥ 325 | 7 | 7 (`R` against `{f: (i32) => i32}`, D9531) |
| `lit9` | ≥ 160 | 5 | 0: the name was a placeholder `i32[]` for a `V[]` element |
| `inner9` | ≥ 125 | 3 | 3 (a type parameter) |
| `mvbare` | 4 | 0 | — |
| `tplfield` (`rlRowOfNameMinted`, a floor, unchanged) | 3 | 2 | 2 |

Every disagreement the gate lets through is the `lit9` placeholder class. There a spelling that
denotes no type keyed the row by accident (`2026-11-11-step7-l2-reflist-row-key-census.md`).

## Sweep

Fixpoint seeds, cut 1 against cut 2, the whole population: 24,165 the same, 5 bytes-only, 0
output movers, 0 runs → not-runs, 0 new compiler traps. The five are the `lit9` class
(`distilled/named/d592_nest_obj_{plain,ufcs}_{decl,infer}.vl` and
`tests/cases/generics/unannotated-return-off-a-hole-typed-element.vl`). Each module is smaller:
`d592_nest_obj_plain_decl` has 416 → 377 bytes and 14 → 8 types, and the generics case has
5,212 → 5,199 bytes and 42 → 40 types. The placeholder `i32[]` rows are no longer minted.

## Floors named

- The gate's declines: a type parameter (it waits for the instance) and a record or list holding
  a function (its function-value sets key it).
- `rlRowOfNameMinted` and `sFieldRefSlot`'s name mint: a template field at an open element type.

## Proof

Refresh to a fixpoint, at 6,735,654 bytes. `lint-self.sh`, `regress.vl` (no runs lost),
`rep-fuzz-check.sh` (exact), `check-filed-witnesses --strict` (4,847 as filed), late-demands,
seed-size (+2.2%), plumb-shape-cost and the render-parse budget pass.
