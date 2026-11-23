# The blocker census reports a start's classes (2026-11-23, lane IR-N9)

`irShadowStart` under the census (`VL_IR_SHADOW=4`): `buildStart` records each miss with
`censusGoesOn` and builds on, so it returned "" and the start was counted covered, verified and
dual-emitted with the miss inside it. Its classes were never reported (a function's are, by
`censusRow`). The census's `mismatch start …` and `fail … in @start/@init` rows for such starts were
artifacts: D17076 and D17082 were filed from two of them and close as such.

Now a census start that met a miss is `start uncovered <sorted classes>` (`censusKey`, shared with
`censusRow`), the row the armed shadow (mode 1) writes for its first class. Test: the census's start
rows equal the armed shadow's (`tests/vl_ir_shadow_test.ts`), red on the old seed.

## Measured

`VL_IR_SHADOW=4` over the distilled cells, the named set and tests/cases, master 2037e7e4's fixpoint
against the batch's:

- corpus: start covered 9266 → 9241, matched 9241 → 9241, start mismatch/fail rows 25 → 0;
- tests/cases: start covered 6990 → 6899, matched 6899 → 6899, start mismatch/fail rows 91 → 0;
- the armed shadow (`VL_IR_SHADOW=1`) diff is empty.

The start classes that moved (each count a start that names the class):

| start class | corpus | tests/cases |
|---|---|---|
| coalesce field place | 2 → 2 | 13 → 26 |
| print operand rep | 17 → 22 | 3 → 3 |
| print mapScalar | 0 → 2 | 8 → 13 |
| narrowed read | 0 → 2 | 0 → 4 |
| closure env capture | 0 → 3 | 1 → 2 |
| push receiver payload cast | 0 → 1 | 0 → 5 |
| call of a non-declaration | 0 → 1 | 10 → 14 |
| null test nullty operand | 0 → 3 | 4 → 4 |
| member record | 0 → 0 | 7 → 13 |
| method f | 2 → 4 | 1 → 2 |
| array ref | 0 → 2 | 2 → 3 |
| field read coercion | 0 → 2 | 9 → 10 |
| push nested list element | 0 → 1 | 9 → 11 |
| index element coercion | 2 → 2 | 10 → 14 |
| declaration coercion | 0 → 2 | 0 → 0 |
| string atom part route | 0 → 0 | 2 → 6 |
| method z | 0 → 2 | 0 → 0 |
| is storage rung | 0 → 0 | 4 → 7 |
| map get union box rep | 0 → 0 | 0 → 3 |
| global read coercion | 2 → 2 | 12 → 15 |
| list reserve outside a function | 0 → 0 | 0 → 3 |
| open temp type | 4 → 4 | 4 → 7 |
| atom tower place | 0 → 0 | 0 → 3 |
| print nulLitPin | 0 → 0 | 0 → 3 |
| object field arm unbox | 0 → 0 | 0 → 3 |
| field store arm unbox | 0 → 0 | 0 → 3 |
| for range slot | 0 → 0 | 0 → 3 |
| narrowed field read coercion | 0 → 0 | 0 → 3 |
| method a | 0 → 1 | 0 → 0 |
| field store narrowed variant | 0 → 0 | 0 → 2 |
| narrowed field unbox rep | 0 → 0 | 0 → 2 |
| is arm tag memNarrow | 0 → 0 | 0 → 2 |
| index none | 0 → 0 | 0 → 2 |
| null test nulfold | 0 → 0 | 0 → 2 |
| map iter receiver | 0 → 0 | 2 → 4 |
| pre-path atom hook | 1 → 1 | 5 → 7 |
| is box not a local | 10 → 10 | 6 → 8 |
| for in map receiver | 0 → 0 | 0 → 2 |
| coalesce optional record field | 5 → 5 | 6 → 7 |
| box ladder | 0 → 0 | 15 → 16 |
| store arm write | 0 → 0 | 0 → 1 |
| pre-path niche read | 0 → 0 | 0 → 1 |
| atom string source | 0 → 0 | 0 → 1 |
| indirect call | 0 → 0 | 4 → 5 |
| closure argument box | 0 → 0 | 3 → 4 |
| is arm tag memStruct | 0 → 0 | 1 → 2 |
| atom cell local rep | 0 → 0 | 0 → 1 |
| pre-path nul atom niche | 0 → 0 | 0 → 1 |
| store operand coercion | 0 → 0 | 0 → 1 |
| method cb | 0 → 0 | 0 → 1 |
| for in map element | 0 → 0 | 8 → 9 |
| is member storage rep | 0 → 0 | 2 → 3 |
| map store value variant box | 0 → 0 | 0 → 1 |
| coalesce optional mapField | 0 → 0 | 2 → 3 |
| print nulRefNiche | 0 → 0 | 0 → 1 |
| member atom | 0 → 0 | 1 → 2 |
| print nulNone | 0 → 0 | 4 → 5 |
| object field explicitNull typed null | 0 → 0 | 5 → 6 |
| for in list union | 0 → 0 | 0 → 1 |
| print boxNull | 0 → 0 | 0 → 1 |
| union compare box | 2 → 2 | 20 → 21 |
| optional read base | 0 → 0 | 15 → 16 |

## Legacy tails the IR calls

None.
