# D16052: `printUnionPlanCode` counts member types, not atoms, 2026-11-13

Lane G. `printUnionPlanCode` (emit_fn_scans) built an atom list only to count it, from three
sources in turn:

- the read's member set, through `msMemberAtomsOfSet`, which reads `msFreeAtoms` for a row-less set;
- else the store set;
- else, where neither covered it, the D16060 row's atoms, falling back to `unionMemberAtomsOf`
  over the label.

It also appended a `null` atom for the map-miss arm, which only raised the count.

The count now comes from the member types of the same sets (`msMemberTysOfSet`). On the D16060
rung it comes from the row's recorded count (`unionRowMemberCount`), with no label fallback. A
row that records no members is a loud floor. `unionMemberAtomsOf` loses its last caller and is
deleted.

## Probe

A probe compiler compared the old atom count with the new count at every call, and noted any
call where only the label would have answered. Over 24,020 programs, 1,810 programs reach it,
5,895 calls in all: 0 count differences and 0 label-only calls.
