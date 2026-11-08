# Step 7: the import and function entries are written after the bodies

Measured 2026-11-08 on a 4-core box, master `79c00235`. Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,740 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,740 same; 0 bytes-only, 0 output movers |
| seed bytes | 6,570,693 | 6,570,681 (−12) |

## What moved

`emitFunctionSection` wrote each function's functype index (`typeOffset + fi`) before the
bodies, and `emitImportSection` wrote the print and fs functype indices there too. Both are now
built after the code payload. `frameFunctionSection` writes every entry, and the import
section is placed with `wSectionPartsAt` at the type section's chunk. The type section is placed
after it at the same chunk, so the order stays type, import, function.

The bodies read two things the old writer set: `gFuncFixedN` and `gMapSetFnBase`, the first tail
function's index. Neither depends on a type index. `fnSectionCounts` sets them up front.
`gMapSetTyBase` is read only by `frameFunctionSection` and the link section, so it is set late.

The functype base is now read after the bodies (`mNextType`). The type, import and function
sections and `typeOrderRun` all take that late value. Today nothing mints a heap type during
the bodies, so it equals the up-front value, and no program moved.

## What stands for collectA#2's flags

A heap type minted during a body now gets a correct functype base everywhere. Three things still
read a flag's up-front answer, and each flag group must replace them before its setters go:

* **Helper function indices.** `assignSharedHelperIndices` gives map probe and resize helpers
  their indices from `mUsed`, the delete family from `gMapDeletes && mUsed`, and `s.bytes()`
  from `ba8Used`. All of them sit under `aUsed`. Those indices are fixed before the bodies. So
  `mUsed`, `ba8Used` and `aUsed` also need their helpers moved to the tail rows the map-set
  helpers already use (`gTailFnRows`). Doing that moves function indices, which is a bytes-only
  mover outside the reorder ruling.
* **Types that reference a scalar list, minted up front.** `rlElemHeap` copies `fl32TypeIdx`
  (and its f64, i64 and u8 siblings) during `mAssignTypeIndices`. The `emit_bytes` storage
  writers that render map-value structs and variant fields read the index at render time. A
  pair that only the type graph reaches therefore has to mint while the graph is rendered.
  The dry render, run before the bodies, can be that minting pass if the index globals mint on
  read. A pair that is not minted must then read −1, not alias `mNextType`, which today's
  "aliases its slots" fallback does.
* **`svReserve`.** It keeps the checker's scalar-view pairs only where both list types exist
  (`fa32Used && fa64Used`, `lUsed && ia64Used`, `lUsed && fa64Used`). That is an up-front
  answer by construction. The view types subtype the wrappers, so they must mint after them.

`fa32Used`, `fa64Used`, `ia64Used`, `lUsed` and `slUsed` gate no helper index, so they are the
first candidates. `fa32Used` has 14 collect setters and about 60 index reads (29 in `wasmEmit`,
the rest in `emit_bytes` and the section writer). Its body readers are all guards of one shape,
`if !fa32Used { emitFail(...) }`, and become the accessor call.
