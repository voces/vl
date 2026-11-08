# Step 7: the f32 list pair is minted on first read

Measured 2026-11-08 on a 4-core box, master `aba26c15`. Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The population is the sweep's 23,740 programs.

| | base (fixpoint) | candidate (fixpoint) |
| --- | --- | --- |
| sweep | | 23,737 same; 3 bytes-only, 0 output movers, 0 runs lost, 0 new traps |
| seed bytes | 6,570,111 | 6,569,242 (−869), +2.7% of the +3% bar |
| plumb-shape main fuel / RSS | 8,975,636,030 / 318.0 MB (baseline) | 8,816,742,950 / 318.5 MB |
| plumb-shape tail fuel / RSS | 6,579,647,243 / 317.7 MB (baseline) | 6,393,479,040 / 318.1 MB |

## What moved

`fa32Used` is deleted. `fa32Ty()` and `fl32Ty()` (`emit_state.vl`) mint the (backing, wrapper)
pair the first time a reader asks. Until then both indices read −1, and `isFl32Ty(w)` is the
comparison that cannot match an unminted pair. Before this change, an unused pair took the next
two counter positions, so its indices could equal a later type's. `mAllocType` moved to
`emit_state.vl` so the accessor can mint.

* collectA's 20 setters are gone (14 in `emit_collect`, 2 in `emit_shape_rows`, 4 in
  `emit_union_atoms`). Arms that fell through to a later rung keep an empty body.
* The bodies' seven `if !fa32Used { emitFail(".. f32 list type not collected") }` guards are
  gone. The read itself mints the pair.
* The two up-front readers:
  * `rlElemHeap` mints when an `RLK_F32_LIST` row exists.
  * `svReserve` asks only the view's destination (`fa64Used`). `mAssignScalarListPairs` then
    mints the f32 pair before the view, because the view subtypes the pair's wrapper.
* Readers that are only rendered (struct field storage, functype params) mint during the dry
  type-section render, before the bodies. The dry render now counts its rec group against
  `mNextType`. The placed render still has to match the functype base it framed, so a mint
  that came too late is reported, not silent.

Mint order changes the pre-canonical index. `typeOrderRun` sorts the first group by key, so
the final index is the same in every module the sweep holds.

## The three bytes-only movers

`coalesce-hole-nullable-element-default`, `nullable-number-element-list-eq` and
`coalesce-nullable-f32-element-int-default` each lose an f32 pair: 12 or 13 bytes, two types
and the index shift after them. collectA flagged an f32 shape that no lowered body, field or
signature reads. The base module declared the pair and referenced it nowhere. The candidate
validates and prints the same. These are dead-type removals, not reorders.

## What stands

* `fa64Used`, `ia64Used`, `lUsed` and `slUsed` have the same shape. One difference: `svReserve`
  decides helper indices before `mAssignTypeIndices` runs, so the view pairs' list types must
  mint from the checker's `scalarViewPairs` bits, and cannot wait to be read.
* `mUsed`, `ba8Used` and `aUsed` still gate helper indices fixed before the bodies
  (`assignSharedHelperIndices`). Those helpers have to become tail rows first.
