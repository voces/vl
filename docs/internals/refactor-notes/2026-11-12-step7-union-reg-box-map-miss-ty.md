# Step 7 L6 (step C3b): the map-read miss's box is handed its type; the box path's floors, 2026-11-12

The base is #7443 (C3a).

## Changed

`emitMapGetOrScalarBox` boxed a scalar map read's miss into `<scalar> | null` with no type. It
now passes that type, the scalar's primitive made nullable. `boxDstName` names it by its
spelling, as C3a does for any value union no row keys. This was 2 of the 4 untyped
`emitUnionBoxOwed` entries left after C2 (#7437).

## What is left

- **Untyped entries:** the other 2, in `generics/coalesce-join-at-list-pin.vl`.
  `const r = a ?? 5` at the pin `T := i32[]` is a union only at the instance (D15713's class).
  Where `letBindingUnionTy` asks, the init's node type is not a union, so the box keeps the
  spelling `i32|i32[]`. Per-instance node types are lane w321's (D15710's mechanism). This is a
  floor until the instance's type is read there.
- **Name producers:** after C3a a box ignores its caller's name whenever a type is given. But the
  producers this step meant to free survive as predicates: `rlUnionNameOfTy`'s
  `elemUnionNm != ""`, `boxRecordNameOf(r) != ""` in `boxOwedAt` and `boxDstTyOf`, and
  `emitConstCellInit`'s `gun2 != ""`. Deleting them means asking those predicates of the type,
  for example whether the destination's rep is a union box. That is its own cut.

## Proof

- `maps/coalesce-nullable-default-fused.vl`, the program reaching the changed call, prints what
  the base prints.
- **Local full sweep:** in the PR.
