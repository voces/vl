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
| `ir-only-census.vl`, `print mapScalar` and `start: print mapScalar` (master `1e6bf0e0e`) | 4 fns + 13 starts | READINGS_CENSUS |
| the 17 programs under `VL_IR_SHADOW=6` | 17 `print mapScalar` rows | 0, no mismatch |

The position sweep is `tests/cases/maps/print-scalar-map-read-positions.vl`: start body, function,
map parameter, closure and generic instance; `i64`, `f64` and `i32` values at `string` and `i32`
keys; `m[k]` and `m.get(k)`; hits of a stored zero, a negative `i64` past 2^32 and a fractional
`f64`, and misses. It covers and matches, and prints the same under both seeds.
