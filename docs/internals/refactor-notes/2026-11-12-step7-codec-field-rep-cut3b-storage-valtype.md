# Step 7 codecs, cut 3b (first part): the type section writes a field's storage valtype from its rep, 2026-11-12

This is the first part of cut 3b in `2026-11-11-step7-codec-field-rep-column-design.md` (#7250).
It is about the type section's field storage. Before this change, `pushFieldStorage` turned the
field code into a valtype through a 27-arm ladder of its own. That ladder repeated what
`fbValtype` already says, VKind by VKind.

## What changed

- **`fieldRowStorageKind(r)` and `variantFieldStorageKind(vi, fi)`** (`emit_atom_kinds.vl`) give
  the kind a struct or arm field is stored at. They are built on the cut-1 storage reps.
  - A variant ref is named as its arm's struct row, because the slot a field passes is already
    that row.
  - The result is null where the field code is the only answer: the type is unrecorded or
    uncovered, or the field reps as `nulnone` with a code other than 37. That last case is a
    hole's record (code 15).
  - The function is an exhaustive `match` over `VKind`.
- **`pushFieldStorageKind(kind, code, refSlot)`** (`emit_bytes.vl`) writes `fbValtype(kind,
  refSlot)`. It falls back to `pushFieldStorage(code, refSlot)` where the kind is null. It also
  falls back where the kind's row or the code's row is unresolved, so the miss is named by the
  same sentence as before.
- `tsStruct` and `tsVariant` (`emit_sections.vl`) call it.

## The one disagreement it met

On master `c28961aa`, D3938 (`P<i32> | Q<i32>` as a record field) was code 15 with no resolved
struct row, but its storage type repped as `union`. Before the guard covered the code's row, that
refused program wrote the union box and failed later with a different sentence. #7357 has since
closed D3938, and on the merged tree it runs and prints `7` then `-1`.

## Measurement

`sweep.vl diff`, master `10033cbe` fixpoint seed (6,645,808 bytes) against this branch merged
with it (fixpoint, 6,646,271 bytes), over 23,962 programs:

- **23,962 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The first measurement, against `c28961aa`, was 23,948 same.

## What is left

`pushFieldStorage` still has three callers that hold only a code:

- the object-literal order stash (`fbFieldStorageRun`, whose code rides `liBack`);
- `fbIfForSharedPlan` (a shared-read plan's code);
- the fallback above.

`sFieldStorageSlot`, `uFieldStorageSlot` and `structRowIsProperPrefix`'s storage comparison still
dispatch on the code. They go next, with the value deliveries.
