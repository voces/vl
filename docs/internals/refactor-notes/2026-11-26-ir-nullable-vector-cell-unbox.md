# Index element coercion: a nullable vector cell unboxed to the vector (2026-11-26, lane COV-START)

COV-UNION released three `index element coercion` units to COV-START after #10252. A scratch build
printed the pair at each miss:
- two simd programs read `?v128 → v128`: the narrowed re-read inside `??`'s synthesized null-test
  `if` over a list cell;
- `unions/else-complement-after-then-call.vl` read `?box → v128`.

## The mechanism

A list of `F32x4 | null` stores each element as a tagged union box. A cell read past its null is
unboxed by legacy: a tag test, then a cast and `struct.get` of the vector. The builder already has
that read (`refUnboxedAt`). It asks `irBAtomKindRep` whether the unbox's value-atom kind
(`refListReadUnboxOf`) leaves the read's rep. The vector's kind is 14, an atom appended past the list
kinds (`valueAtomKind`; `scalarAtomNameOfKind` names it). But `holeKindRep` read every kind above 5 as a list, so the vector never
matched. It now names the vector's kind first.

## Measured

| program | master | head |
|---|---|---|
| `simd/coalesce-nullable-vector-list-cell-runs.vl` | start and a function uncovered | matched |
| `simd/value-position-spill-of-effectful-place-runs.vl` | start uncovered | start matched |
| `unions/else-complement-after-then-call.vl` | start uncovered | moves to `is box not a local` |

- Each prints the same output on legacy and under `$VL_IR_STRICT=1`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- The sweep `tests/cases/simd/nullable-vector-list-cell-narrowed-read-positions.vl` covers a `??` in
  a function and at the top, a cell tested non-null then read, one returned, one passed on, and a
  loop's cells summed. On master its start body and two functions miss; on the head all are
  matched. Its output is the same on legacy and under strict IR.
