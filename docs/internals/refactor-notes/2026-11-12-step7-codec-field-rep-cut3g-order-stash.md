# Step 7 codecs, cut 3g: the object-literal order stash is typed by the field's storage kind, 2026-11-12

This continues cut 3b of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250). It stacks
on #7415. Before this change, the order stash (D1510) keyed its slot type on the field code
(`liBack = 100 + code`) and wrote it through `pushFieldStorage`'s code ladder.

## What changed

- **`objOrderStashSlot(kind, code, storageSlot)`** (`emit_if_arm_values.vl`) records the field's
  storage kind in a new column, `liFieldKind` (`emit_state.vl`). The column is indexed by
  lazy-list row and reset with `liKinds`.
  - `liBack` is `100 + code` when the kind is known.
  - It is `200 + code` when only the code answers.
- **`fbFieldStorageRun(kind, code, slot)`** (`emit_bytes.vl`) writes the slot through
  `pushFieldStorageKind`. That is the same writer the type section uses for the field (cut 3b), so
  the stash and the field it feeds cannot disagree.
- **The callers pass a kind:**
  - `emitObj` passes `fieldRowStorageKind(sFieldFlatRow(si, ofi))`;
  - the two variant stashes pass `variantFieldStorageKind`;
  - the shared-field plan's value stash passes its first arm's kind;
  - its three fixed temporaries pass `"str"`, `"i32"` and `"nulstr"`.

`liKinds` stays `ListKind[]`. A stash row pushes the unread `"list"` there, as before.

## Measurement

`sweep.vl diff`, #7415's head merged with master `316836dc` (fixpoint, 6,654,919 bytes) against
this one (fixpoint, 6,655,818 bytes), over 23,986 programs:

- **23,986 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left

- In `wasmEmit.vl`, field codes remain only in the shared-field plan: its plan code,
  `sharedFieldCodeDispatchable`, `fbIfForSharedField` and `fbIfForSharedPlan`.
- The code still rides each stash and storage writer as the floor. Cut 4 moves the writers, and cut
  5 types the floors.
