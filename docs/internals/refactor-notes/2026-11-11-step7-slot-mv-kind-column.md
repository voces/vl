# Step 7 slot layer: the map-value bank's MVK code column is deleted, and its readers read the rep record, 2026-11-11

After #7157, the map-value bank kept two kind stores for each slot:

- `mvValKind`, an `MVK_*` code;
- `mvValRep[s].mrKind`, a `VKind` read off the value's type.

This PR deletes the code column, so the record is the slot's one kind.

## Measurement

`mrKind` now gives every niche kind as its non-null twin (`nulstr`, `nulstruct`, `nulvariant`,
`nulclosure`, as `nulmap` and the nullable lists already were). With that, a probe compiler at the
mint compared the stored code with the class `mrKind` names:

- `str`, `f64`, `i64`, `f32`, `union` and `closure` are their own class;
- `struct` and `variant` are `MVK_STRUCT`;
- `map` and the seven non-null lists are `MVK_REF`.

The probe compiler was built into scratch from the base seed, the head of #7163. Over the whole
population (`scripts/sweep.vl`, 23,894 programs) it fired **0** times. The call site is the one
#7157's probe already validated against a failing control.

So the code is a function of `mrKind` at every mint the population reaches.

## What changed

- **`mvValKind` is deleted.** The mint pushes the rep record where the code was pushed, so a
  read between the two pushes still finds the slot. Its `mrSlot` is set once the interns it waits
  on have run.
- **`emit_state.vl`** gains the readers:
  - `mvValKindAt(s)`;
  - `mvClassOfKind(k)`, an exhaustive, `_`-less `match` from a stored kind to its storage class;
  - `mvValClassOf(s)`, `mvValIsRecord(s)` and `mvValIsRef(s)`.
- **The 57 reads of `mvValKind[s]`:**
  - an equality with a string, scalar, union or closure code reads `mvValKindAt(s)`;
  - a struct or ref test asks `mvValIsRecord` / `mvValIsRef`;
  - a site that compares or keys on the whole class asks `mvValClassOf`. These are
    `repMapValSlotsTwin`, the layout-twin check in `mAssignTypeIndices`, `mapShapeCompactable`,
    the compaction tys, `coalesceKeepsScalarBox`, `mapReadNarrowableSlot` and
    `readIndexStoreKind`'s `"mv"` key.
- **`mvValRepKindOfTy`** becomes an exhaustive `match` over `VKind`.
- The `MVK_*` imports nothing reads any more are dropped from four files.

## The price, measured

Under the standing velocity instruction, CI's `sweep` job re-proves identity on the merged tree.
The mover list goes into the PR body from its summary.

## Proof

Checks run on the tree merged with master `2fb114d7` (#7188):

- One refresh, at 6,617,408 bytes (seed-size +0.4% against its baseline).
- `cases_wasm`: 7,440 passed, 0 failed.
- Distilled `regress.vl`: 0 `runs → not-runs` classes; no runs lost.
- rep-fuzz is exact. lint-self is clean (`self-lint + fmt-check clean`).
- `ladder-sets` is ok, with 24 sets and 20 fields. Late-demands is 6 against a baseline of 6.
- The export, ladder, comment, sentinel, scan and render-parse budgets exit 0.

## What is left

The `MVK_*` codes remain the mint's own classification (`mvValKindOfTy`), and `mvClassOfKind`
projects to them for the class compares. Neither is a stored encoding.
