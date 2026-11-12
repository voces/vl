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

D3938 (`P<i32> | Q<i32>` as a record field) is code 15 with no resolved struct row, but its
storage type reps as `union`. Before the guard was widened to cover the code's row, that program
wrote the union box and failed later with a different sentence: one output mover, still loud.
With the code's row checked too, it keeps its sentence. This disagreement is reachable only on a
program that is already refused.

## Measurement

`sweep.vl diff`, master `c28961aa`'s fixpoint seed (6,640,097 bytes) against this one (fixpoint,
6,640,563 bytes), over 23,948 programs:

- **23,948 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left

`pushFieldStorage` still has three callers that hold only a code:

- the object-literal order stash (`fbFieldStorageRun`, whose code rides `liBack`);
- `fbIfForSharedPlan` (a shared-read plan's code);
- the fallback above.

`sFieldStorageSlot`, `uFieldStorageSlot` and `structRowIsProperPrefix`'s storage comparison still
dispatch on the code. They go next, with the value deliveries.
