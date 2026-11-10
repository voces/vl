# Step 7: `arrLitElemNameTpl` keys a list of lists by its inner literal's recorded leaf, 2026-11-10

Group 10 of `2026-11-09-step7-classifiers-remaining.md`. Base is master `d21f4448`, whose fixpoint
seed is 6,595,996 bytes. Counts are post-mono calls over the 23,838-program sweep population,
read from `classifier-census.vl --keep` chunk rows.

`arrLitElemNameTpl` is asked by `arrLitElemName` in the intern pass (`collectA`), which mints
the row a ref-list literal's elements are built at. Every rung but one already answered from a
type the checker or the record solve recorded: the closure render, the union, map, nominal,
nested and nullable element names, the committed annotation, the box variant, and the
object literal's struct or arm row (`structIndexOfObjCtx`, `objVariantRowCtx`, both read
`litRepTyAt`). The one blind rung was a list of lists' scalar leaf: `arrLitIsStr` on the lead
inner literal, ending in a first-element `exprString` probe, then the inner literals' widths,
then `i32[]` by default.

## Whole-function twins (not switched)

Shadowed against the legacy name over 7,030 calls. "Agree" counts a different spelling of the
same row as agreement.

| twin | agree |
| --- | --- |
| A: the row reader, `listRowOfExpr(arrIx, -1)` | 5,460 |
| B: `rlRowNameOfTy` of the literal's recorded build type's element | 5,751 |
| C: the lead element's recorded build type | 3,991 |
| D: the row type the emitter builds the literal at (`arrLitRowTyIn`) | 6,286 |
| D, then A | 6,310 |

D, with a record element named by its struct row, then A, was switched in on a scratch
compiler. Over the 1,743 files where D or A gives a different answer, 1,420 were
byte-identical. 289 built different wasm with the same output, and 1 printed different output.
11 that built became refusals or traps, among them `d15296_nested_list.vl` and
`tests/cases/arrays/nested-nullable-array.vl`. The name has to agree with the kind
`arrLitElemKind` picks, and a whole-function twin breaks that pairing. So the switch was cut down
to the one blind rung.

## Switched: the nested leaf

The leaf is now read off the lead inner literal's recorded rep (`litRepTyAt`). The string list
is used for a string or nullable string element, the f64 list for `f64`/`f32`, and the i64 list
for `i64`. Any other element gets the i32 list: an atom, a boolean, a box, or a hole's tagged id.
A union rep is the box a join built. There, an inner literal the checker typed as strings still
builds the string list, as `arrLitIsStr` asked the checker's string adoption before the box
test.

| twin for the leaf, shadowed at the 1,068 calls that reach it | agree |
| --- | --- |
| the outer literal's recorded element's element | 949 |
| the inner literal's recorded rep | 1,044 |
| the outer literal's checker type | 839 |

Each refinement was A/B-built over the 450 files that reach the rung:

| leaf | byte-identical | different wasm |
| --- | --- | --- |
| inner rep, nullable string → string list | 445 | 5 |
| the inner literal's checker type | 410 | 40 |
| inner rep, a union rep read by checker type | 438 | 12 |
| inner rep, a union rep keyed string only where the checker says string or `string \| null` | **448** | **2** |

The 2 are `scripts/silent-sweep/distilled/named/d581_nest_str_str_{plain,ufcs}_typar.vl`:
`const xs: string[][] = [[self]]` with `self: T`. The template keyed `i32[]` and minted an
`i32[][]` row nothing reads. The inner literal's rep is the annotation's closed `string[]`, so
that row is no longer minted. Both print the same output and are 22 bytes smaller. This is the
`arrLitNumKind` ruling's class (`2026-11-10-step7-arrlitnumkind-rep-width.md`): the emitter
follows the rep it reconciles.

`arrLitElemNameTpl` now reads the arena directly, and its probe is deleted. Its lead-inner gate
still asks `arrLitIsRef(e0x, -1)`, which reaches `arrLitIsRefTpl`, and that stays probed.

## Census (`classifier-census.vl`)

| tree | probed |
| --- | --- |
| base `d21f4448` | 11 |
| this PR | 10 |

**Proof.** The fixpoint seed is 6,596,203 bytes (+207), byte-identical over two
`refresh-compiler.sh` runs. The 450 reached files built by it compare with the base fixpoint as
above: 448 identical, and the 2 named.

* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.1%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`, `vl_probe_rollback`,
  `vl_scaling_shape`: 7,510 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,686 as filed, 0 moved, 0 output mismatch.
