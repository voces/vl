# IR coverage: the wide memory accesses (2026-11-21, lane IR-N7)

#9310 built the i32 loads and stores through one access plan and left every other width as the
named miss `memory access wide value`. On master 4b5d638e that was the census's first class in
`tests/cases`, at 926 functions (most are std's `Buf` helpers, counted once per test that imports
them).

## Change

- **The plan names the value's prim.** `MemAccessPlan` gains `mxPrim`: a store's from the kind its
  value widens to (`mxWiden`: 3 i64, 5 f32, 4 f64), a load's from its opcode (`memLoadPrim`: the i64
  loads and the zero-extending `__load_u*_i64__` are i64, the float loads f32 or f64).
- **The builder** drops the wide-value miss. It holds the address at i32 and a store's value at
  `mxPrim`, which legacy's widening then leaves as it stands; a value not yet at that prim stays the
  named miss `memory access operand coercion`.
- **The verifier** (`memAccessCheck`) reads the same plan: the address at i32, a store's value at
  `mxPrim` and no result, a load's result at `mxPrim`.
- The lowering is unchanged: the operands, then `memAccessTail`.

## Measured

On `tests/cases/memory`, `std` and `simd` against master's seed, covered = matched rises 5,800 →
6,507, `memory access wide value` falls 708 → 0, and one `memory access operand coercion` remains,
with no mismatch. The full census is in the PR body. The row `tests/ir-shadow-rows/mem-access-wide.vl`
has 6 functions, one load and one store per width (one at an offset); all 6 miss on master's seed.
