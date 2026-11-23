# IR: range loops inside a list reserve region (2026-11-23, lane IR-D1)

`for range in a reserve region` was a blanket skip: the builder left every range loop inside a
list reserve region (D3623) to legacy. Lifting it left 5 of the 10 reserve witnesses differing.
Legacy's `unrollCost` weighs a counted push of an open build region (`listBuildRegionOf`) as
inline, and refuses to unroll over any other call. That region opens only at emit time, in
`listReserveOpen`. The builder, asking `forRangeArm` before then, saw a call, kept the loop rolled
where legacy unrolls it, and the type section's order moved with it.

## Mechanism

- `listReserveOpen`'s sizing decision is now `listReserveSizedOf`. The new
  `listReserveRegionPushes` reads it: the counted pushes of the build region legacy will open,
  or none where it opens none (no sizing, or its last push the block's last statement).
- `lbPlanned` (emit_bytes) holds the pushes of the regions the builder has open. The builder adds
  a region's pushes when it writes `reserve.open` (`lbPlanAdd`), drops them at the region's end
  (`reserveEnds`), and clears them at each function's start. `unrollCost` counts a planned push
  as it counts a live one.
- Legacy never plans, so its bytes do not move; the skip is deleted.

## Readings

On master 4982aa4a → head, fixpoint seeds:

| reading | base | head |
| --- | --- | --- |
| IR-only `for range in a reserve region` (fns/progs/sole) | 28 / 9 / 6 | gone |
| tests/cases fully IR-only, of 7,148 | 5,684 | 5,687 |
| ir-i8 census rows | 28 | 0 |
| ir shadow tests/cases matched | 79,057 | 79,077 |

The shadow row `range-in-reserve-region.vl` covers two functions on the head and none on the
base.

## Legacy tails the IR calls

None new.
