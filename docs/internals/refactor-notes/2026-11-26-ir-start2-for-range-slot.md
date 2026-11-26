# START-2: `for range slot` and the hoist memo (2026-11-26)

`for range slot` is an I8 blocker: it was ci-release-shape's only failure in regeneration 8 (#10096). Graded on master 11296e8e with a probe-patched compiler, using the class list
`scripts/ir-i8-census/classes/for-range-slot.txt`:

| program | before | after |
|---|---|---|
| `arrays/push-reserve-known-size.vl`, `getters/getter-constant-range-loop.vl`, `lists/index-guard-in-range.vl`, `loops/break.vl`, `strings/accum-module-global.vl`, D3623 | for range slot | fully claimed |
| `loops/jump-from-value-arm.vl`, `loops/unrolled-range-loops.vl` | for range slot | `for in literal in an unrolled copy` (legacy's pooled global list) |

`ir-parity --run-all`: byte-identical on all of them, on `bench/arrays/push-known-size/main.vl`,
and on the new sweep. `push-known-size` measures 2034 B at `-O3` (band 2034 ± 61) and 2074 B at `-O` (2100).

Two mechanisms:
- `hoistSafeBlock`'s memo (`hmFn`) restarts when `listReserveOpen` opens a build region and when
  `listBuildClose` ends one. A counted push is hoist-safe only inside its open region. The builder
  asks before the region opens, the lowering asks after, and the memo handed the lowering the
  builder's stale answer: the outer loop opened no hoists, and each copy's inner loop opened them
  again (2117 B). Under the shadow, legacy emitted first and the memo held its answer, so the
  armed shadow matched while the claimed build did not. At I8 the builder's ask is the only one.
- `forRangeStmt`: a copy of the same loop (its declaration's variable on the slot) reuses the slot
  variables. Any other holder of the slot still refuses.
