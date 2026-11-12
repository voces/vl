# Step 7 L2 §7: a bare map annotation is found by its type where one is held, 2026-11-12

Lane w310, item (d), second part. `nameIsBareMap` (a `nameIsMap` spelling that is not a
map-member union) has ten callers in five files. The four that hold a type now ask it, through
`tyIsBareMap` (`emit_union_registry.vl`). An alias wrapper and a union of twin maps (D15540) are
a bare map. A nullable map and a union with a map member are not.

The base is master `0921d19f`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,941 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator. At each site it compared `nameIsBareMap(spelling)` with the type's answer,
and tagged a disagreement and an untyped site. The reach tag is the control. `tyMapHeld` was
tried first and is wrong for this question: it peels `| null`, so 104 programs disagreed.

| site | reach | disagree | untyped |
| --- | --- | --- | --- |
| `collectATypeRef` (`emit_collect.vl`) | 18,054 | 6 | 25 |
| `monoAnnPinName` (`emit_mono.vl`) | 640 | 0 | 635 |
| `fieldCodeOfSpelling` (`emit_shape_rows.vl`) | 247 | 0 | 31 |
| `arrLitMapElemName` (`emit_shape_rows.vl`) | 1,069 | 0 | 0 |

The 6 collect disagreements are three kinds. Three are a union of twin maps spelled as two
members (`{[i32]:i32}|{[i32]:i32}`), which the spelling takes for a member union. Two are a
record with a `"[]"` method (`index/generic-trap.vl`), which the spelling takes for a map with
an empty key. One is the recursive alias `WMap`. None changes a byte: the slot each one would
intern, or not intern, is interned at another site. None of the 25 untyped collect sites is a map.

## Changed

- `collectATypeRef` and `arrLitMapElemName` ask the type alone.
- `monoAnnPinName` and `fieldCodeOfSpelling` ask the type when they hold one, and keep the
  spelling for an untyped pin or field.

## Left

`nameIsBareMap` keeps five callers with only a spelling: `nulMapInnerName`
(`emit_map_value_slots.vl`), and in `emit_shape_rows.vl` `nulRefMapValInnerOfTy`'s inner atom,
`mvValKindOfSpelling`, `refArrShapeKindGo`'s paren-union rung and `refElemArrName`. The untyped
legs of `monoAnnPinName` and `fieldCodeOfSpelling` read it too. With them, `nameIsMap`'s parse
stays.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,941 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 28 renders and 58 parses, with `--findings`, on both sides.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,448 with 0 failed. lint-self
  is clean. The export budget, with findings, has 0 dead exports.
