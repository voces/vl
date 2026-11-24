# IR: `print` of a scalar-valued map read (2026-11-24, lane S1)

`print(m[k])` over a map whose value is `i32`, `i64`, `f32` or `f64` takes `print`'s `mapScalar` arm
(`mapReadScalarBoxKind`): the probe, then the stored value on a hit and the word `null` on a miss.
The IR builds it as `RMapGet` with `mtPrint` (the scalar kind), an effect statement.

## Legacy tails the IR calls

- `printScalarMapTail(k)`: after the probe, the entry's branch, the hit's value through its
  kind's sink, and `null` on the miss. `emitPrintScalarMapRead` writes `emitMapPrep`, then it; the
  IR writes `mapProbeHead`, then it. The split is byte-neutral.

## Verifier

`RMapGet` under `mtPrint` must read a map whose value is a scalar `print` streams and yield
nothing (rule 2). Self-tests `map-print-of-i32` (holds) and `map-print-of-string` (rule 2).

## Readings

| run | before (master `738713676`) | after |
|---|---|---|
| `ir-only-census.vl`, `print mapScalar` + `start: print mapScalar` (base tree at `738713676`, head tree at this PR) | 17 | 0 |
| `ir-only-census.vl`, programs fully IR-only (same trees) | 6169 of 7212 | 6185 of 7213 |
| the 17 programs under `VL_IR_SHADOW=6` | 17 `print mapScalar` rows | 0, no mismatch |
| `scalar map compare route` (new miss, head tree) | | 0 in `tests/cases`; the corpus cells `d16846_makergen_map_value_place_{ann,unann}` |

The position sweep is `tests/cases/maps/print-scalar-map-read-positions.vl`: start body, function,
map parameter, closure and generic instance; `i64`, `f64` and `i32` values at `string` and `i32`
keys; `m[k]` and `m.get(k)`; hits of a stored zero, a negative `i64` past 2^32 and a fractional
`f64`, and misses. It covers and matches, and prints the same under both seeds.

## A guard the coverage exposed

A bare scalar map read compared with `==`/`!=` after the read was narrowed (`if m[k] != null {
if m[k] == 41 { print(m[k]) } }`) was built by the IR as a plain operator over `__map_get_0__`,
while legacy writes the probe's compare there. Uncovered until this PR (by the `print`), the start
bodies of the two `d16846_makergen_map_value_place` cells would have shipped those bytes; in a
function the shadow fell back. Such a compare now misses as `scalar map compare route`.
