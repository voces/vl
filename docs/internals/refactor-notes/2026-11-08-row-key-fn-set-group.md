# A row keys a tagged function leaf by its set group (D15560)

Measured 2026-11-08 on the branch's fixpoint seed, against master `2da9f410`'s fixpoint seed.

## What changed

* `repRowId` keys a row field that is a list (or a non-union nullable list) of tagged functions
  through `hcRowHeldId`. The leaf is `HC_FNGRP(fnSetGroupRep(set))` instead of the function
  type's canonical id, and that id keyed each hole by its arena index. `fnSetGroupRep` is the
  smallest id among the sets that `fnWidenedSourceSets` links, followed in both directions.
* `structIndexOfObjCtxGo` gets a new rung ahead of the adopted-type rung.
  `objLitTaggedFieldRow` keys a record literal by its field values' recorded types wherever a
  field holds tagged function ids.

## Why the literal rung

In `local() { let q = {f:[inc]}; q = {f:[dec]} }` next to a global `r = {f:[dbl]}`, the
literal `{f:[dec]}` was built at `r`'s row. Probe, one line per call of `structIndexOfObjCtx`:

| literal | rung that answered | row | own record type | field value's type |
| --- | --- | --- | --- | --- |
| `r`'s init `{f:[inc]}` | mint | 0 | set 1 (r) | set 1 |
| `r = {f:[dbl]}` | 4, `structIndexOfTy(adopted)` | 0 | not tagged | set 1 |
| `q`'s init `{f:[inc]}` | mint | 1 | set 3 (q) | set 3 |
| `q = {f:[dec]}` | 4, `structIndexOfTy(adopted)` | **0** | not tagged | set 3 |

The write's widening restamps the list literal with the binding's set, but the record type
around it keeps the literal's own set. The adopted type is the tag-less `{f: i32[]}`.
`repRowOfTyStruct` misses on both, and `structIndexOfTy`'s alias answers row 0. On master both
bindings shared one row by accident, because both widened function types copied `inc`'s
holes. Under group keys they split, which is correct. The field value's recorded type names
row 1. `fnWidenedSourceSets` is not widened.

## Proof

| check | result |
| --- | --- |
| fixpoint (two refreshes) | byte-identical, 6,563,647 bytes |
| seed size | +2.6% against the baseline (bar +3%) |
| sweep, 23,700 programs | 2 output movers, both `compiler_trap → runs` (D15560's witness and its fixture), 31 bytes-only movers, **0 runs → not-runs**, 0 new compiler traps |
| `rep-fuzz-check.sh` | exact, 0 new, 0 stale |
| pin-helper budget | 927, unchanged |
| export budget | 0 dead exports |

A declared `type R = { fs: i32[] }` beside a function-list record keeps its own struct type.

## Shapes still keyed by hole index

* an untagged function list;
* a record nested in a list or map field;
* a widened function type's own parameters.
