# Step 7: a typed inline shape finds its struct row by layout id, 2026-11-12

The shape interner's leaf (`internInlineShapeTyGo`) finds a shape's row by type first, through
`structRowOfRecordTy`. When the type has no row, it fell back to a field-set index whose key
hashed each field's ELEMENT NAME (`shapeFieldSetIdOf`). Those names are spellings: a literal
atom's `"circle"`, a union's member text, a nested record's `{p:i32}` against its row's `Inner`.
This change is step 7's "one row per canonical type" applied to that index: a typed shape now
finds its row through a second index keyed by layout, and an untyped shape keeps the spelling key.

The population is the sweep's 23,975 programs, base master `bd129b4d`, with fixpoint seeds on both
sides.

## The layout id

A stored row whose every field records a storage type (`sFieldStoreTy`) is bucketed by
`shapeLayoutIdOf`: the field names, ordered by sid, each with three ints from `layoutFieldPush`.

| field | key |
| --- | --- |
| reference (codes 5, 15, 16, 19, 28, 29) | `repRowId` of the storage type; for a list of functions, also the element's closure signature |
| literal-union atom (codes 0, 3, 4, 30 holding atoms) | `repCanonId` of the storage type |
| any other scalar | the code alone |

A query takes the same key from its own type, with `recFieldStoreTyOf` and `shapeFieldRowOf`. It
walks its bucket in row order and keeps the text scan's other splits: the closure-signature
check, `code0SpellingFitsRow` and `anonRowServes`. A query or row with a field the key needs and
no type for it answers -2, and the spelling index decides.

## Why each rule

Each rule is a family a type-only scan disagreed on before it was added. Probes ran beside
`annShapeIndexOf` and were validated on a known program before and after each rule.

| rule | family it closed | programs |
| --- | --- | --- |
| ref rows are not bucketed | a scan reaching `#ref` rows | ~35 |
| a scalar keys by its code alone | layout-equal rows `repRowId` keeps apart (`((i32)=>i32)[]` stored as `i32[]`, `(string\|null)[]` against `string[]`, D15552) | 11 |
| an atom keys by its union | literal sets `"a"\|"b"` against `"a"`, whose atom encodings differ | 4 |
| a function list keys by its element signature | `(()=>Circle\|Sq)[]` against `(()=>{x:i32,y:i32})[]`, two `$fnsig`s | 2 |
| a reference keys by `repRowId` | `{f: Fn#a}` against `{f: Fn#b}`, one closure cell (w317's four programs) | — |

## Shadow, before the switch

The layout reader ran beside the text index and was tagged against it. It was reached in
4,215 programs:

| result | programs |
| --- | --- |
| both find no row | 4,204 |
| the same row | 29 |
| untyped query, the spelling decides | 7 |
| the layout finds a row the spelling does not | 1 (`d15221_nest_dbl`) |
| the two disagree | 0 |

The 7 untyped queries are the walk's typeless children (D15042, D1578, D4930,
`closure-value-union-array-struct-elem-list-field`, `typaram-list-union-return-keeps-both-arms`,
`nested-union-softening-list-return-twin`). They stay on the spelling key until the walk hands
them a type.

## The one merge

`d15221_nest_dbl` returns `{ a: [{ f: inc0 }, { f: dbl }] }`. Its typed shape `{a: {f:(i32)=>i32}[]}`
now shares the row whose list element is the literal's `#anon0`. The two element records have one
`repRowId`, and the spelling key kept them apart only by name. Built: the module changes in bytes,
and the program prints `6` on both seeds.

## Proof

- Refresh ×2: fixpoint at 6,658,631 bytes (+5,078 on the base's 6,653,553).
- Sweep, fixpoint seeds on both sides: 23,974 same, 1 bytes-only mover (`d15221_nest_dbl`),
  0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `rep-fuzz-check.sh`: exact (0 baselined failures, 0 new).
- Self-compile L2 fuel: 78,890,536,805 against the base's 78,857,443,310 (+0.04%).
- Seed size (+1.1% on its baseline, +0.08% on the base), late demands, plumb-shape cost,
  `vl_scaling_shape`, `cases_wasm` (7,467), `regress.vl`, lint-self, and the comment, ladder,
  sentinel, arena-scan, dead-export (with `--findings`) and render-parse (with `--findings`)
  budgets pass.

## Not done here

The spelling index stays for untyped queries, and so does `annShapeIndexOf`'s text fallback
inside it. Both go with the walk's typeless class. w317's consumer (`monoTagMapRepName`, read
through `structIndexOfTypeName` → `shapeRowScanK`) can ask this reader for "the row of this
layout" by type. Its own scan is not switched here.
