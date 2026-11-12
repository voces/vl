# Step 7: the spelled-shape scan's two lenient passes deleted; its strict pass is the floor for typeless spellings, 2026-11-12

The orchestrator moved `shapeFieldTypeCompatK` (3 type-string parses) and `nameIsLitSpelling` (1)
into this lane from w311's census. Both serve the spelled-shape row scan,
`structIndexOfTypeName` → `shapeRowScanK`, which matches a shape spelling `{x: i32, …}` against
the struct table by field names and classifies each field's type *string*. #7183 (w319) left
the scan reachable only for a spelling that resolves no type. Base is master `c28961aa`
(#7345), whose fixpoint seed is 6,641,290 bytes. The population is 23,947 programs.

## The probe

The scan has three passes: strict, then a union-box-lenient pass (D461), then a
literal-widening pass (D733). Each pass was tagged where it answered:

| | programs |
| --- | --- |
| reach the scan | 41 |
| the strict pass answers | 34 (33 with no type for the spelling; 1 whose type's row agrees) |
| the box-lenient pass answers | **0** |
| the literal-widening pass answers | **0** |

The 7 programs the strict pass misses run both lenient passes, and neither answers. That is the
control: both passes are live code, and they decide nothing.

## What changed

The two lenient passes are deleted. With them go `shapeRowScanK`'s `lenient` parameter and its
unique-claimant count, and `shapeFieldTypeCompatK`'s union-box and literal-widening branches
(D461, D733). The strict pass and its field guard stay unchanged.

## What stays, named

The strict pass answers 33 programs where the spelling resolves no type (`fieldElemTyIxOfName`
is -1), so no type is there to read. Its field guard keeps its 3 parses (`nameFieldCode`,
`annArrowAt`, `nameIsLitUnionType`) and `nameIsLitSpelling`'s 1. They retire when those spellings
carry a type: the spelling's producer records one, or the scan's callers pass theirs.

## Proof

- Refresh ×2 is a fixpoint at 6,640,983 bytes (−307).
- Local sweep, fixpoint seeds on both sides: **23,947 same**, 0 bytes-only, 0 output movers.
- `regress.vl`, `lint-self`, `cases_wasm` (7,451), seed size, late demands, plumb-shape cost, ladder
  sets, the dead-export and render-parse budgets (both with `--findings`; render-parse
  `21 tyToEmitName calls, 58 type-string parses`, unchanged) and the memo-generation, live-sites and
  inventory-refs tests pass.
