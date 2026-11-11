# Step 7 slot layer: the map-value bank stores a rep record, and its two value codecs go, 2026-11-11

This is §4 item 5 of `2026-11-10-step7-vkind-census.md`, for the map-value bank. Two codecs in
§1.1 read a second stored encoding, the mv value code:

- `mvScalarValKind` decoded `mvValKind`'s MVK code to a `VKind`;
- `mvListValKind` decoded the vals ref-list's element code (`rlElemListRep(rlElemKindAt(…))`).

`mvValIsMap` read the same element code. Base is the head of #7144 merged with master `12ceb7b4`
(#7139). Its fixpoint seed is 6,616,392 bytes.

## What changed

- **`mvRlSlot: i32[]` becomes `mvValRep: MvRep[]`.** `MvRep` is `{ mrKind: VKind | null, mrSlot:
  i32 }`: the kind the slot's vals list stores, and its ref-list slot, as one value. The mint pushes
  it in the place of the old push, in the same lockstep. The 23 reads of `mvRlSlot[s]` read
  `mvValRep[s].mrSlot`.
- **`mrKind` is read off the value's type** at the mint: `mvValRepKindOfTy(kindTy)`. That is
  `repOfTy(ty).rdKind`, with a nullable list or map at its non-null twin, because the vals element
  carries the null.
- **The codecs become reads of that kind.**
  - `mvScalarValKind` answers `mrKind` when it is `f64`, `i64` or `f32`.
  - `mvListValKind` is `listRepOrNull(mrKind)`.
  - `mvValIsMap` is `mrKind == "map"`.
  - None of the three reads `mvValKind` or a ref-list element code. `emit_mv_slots.vl` no longer
    imports `rlElemKindAt`.

## Measurement

I built a probe compiler (into scratch, never refreshed into `build/`) from the base seed. At
every mint it compared each of the three old decodes with its `mrKind` answer, and it marked a
mint with no type. Over the whole population (`scripts/sweep.vl`, 23,883 programs):

- 23,883 same;
- **0 probe fires** of any of the four markers.

**The probe was checked against a control.** A variant that also fired on any `f64` or `map`
`mrKind` failed on an `{[string]: f64}` map and on a nested `{[string]: {[string]: string}}` map.
Base ran both. So the probe was live at the mint, and the type-derived kind agrees with every
decode the population reaches.

## The price, measured

`sweep.vl diff`, the base's fixpoint seed against the candidate's (23,883 programs):

- **23,883 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## Rulings checked

- **No mint-on-miss in a question reader.** The three readers read the column. They mint nothing.
- **The row stays one row.** The record is pushed where `mvRlSlot` was. The interns it waits on
  (`rlInternName`, `rlInternNameTy`) ran before that push already.
- **No walk replaced by a walk.** `mrKind` is one descriptor read per minted slot. The readers
  read a column.

## Proof

- Refresh ×2 is a fixpoint at 6,616,659 bytes (+267, the column's record allocation). After
  merging master `f50936aa` (#7144 and later) it is 6,614,005 bytes.
- `scripts/gate.sh` passes every row but kind-ladder sets. That row wanted the new `mrKind` field
  in `compiler/lint.vl`'s `klFieldNames`, which this PR adds. `ladder-sets.vl` is then ok, with 24
  sets and 18 fields, and lint-self is clean.
- rep-fuzz is exact. The seed-size, late-demands, plumb-shape, dead-export and render-parse
  budgets are ok, and so are the ladder, comment and sentinel budgets.

## What is left

- **`mvValKind` (the MVK code) still stands beside `mrKind`.** Its other readers branch on MVK
  codes. They include `mvValsWrapOf`, `mvValElemHeapOf`, the `emit_bytes` heap and backing
  readers, and about 18 sites in `emit_classify.vl`. Each one can read `mrKind` instead. Once none
  reads the code, the mint's classification (`mvValKindOfTy`) is the only MVK producer left.
- **The ref-list element codecs:** `rlElemListRep`, `rlElemListRepFrom` and `pushDestVKind`. The
  mv bank no longer calls `rlElemListRep`. Its remaining callers are the ref-list bank's own.
