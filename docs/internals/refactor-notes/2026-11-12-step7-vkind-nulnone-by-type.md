# Step 7, lane H, cut 5: a field stored as `null` is the null unit by its rep, 2026-11-12

Lane I's floor audit lists four field-code floors as depending on lane H:

- `fieldRowKind`;
- the order stash;
- `sFieldStoreKind`;
- `fieldCodeCellKind`.

Cut 4's note (`2026-11-12-step7-vkind-ladder-list-arms-by-rep.md`) found that they share one
root: a field row with no covered storage rep. One part of that root is the `nulnone` rep. Each
reader answered a `nulnone` storage from the field code. The stated contract was that "a
`nulnone` storage is a hole's record or the `null` unit, which only the code tells apart". This
cut tests that contract and drops it.

## Census

The probe compiler was scratch, never refreshed into a seed. Its accumulator was emptied per
program and the channel was checked against a control. The population is the sweep's, 24,070
programs.

| site | `nulnone` reached, programs | field code there |
| --- | --- | --- |
| `rowStoreRepIn`: is the storage type the `null` type? | 179 | — (yes in all 179; no other type) |
| `fieldStorageKindOf` | 179 | 37 (`FC_NUL_NONE`) in every one |
| `fieldRowKindIn` (`emit_eq_rows.vl`) | 107 | 37 |
| `armRowIsRecordRef` | 62 | 37 |
| `variantFieldIsNulNone` | 27 | 37 |
| `fieldRowIsNulNone` | 22 | 37 |
| `readCellKind` | 20 | 37 |
| `fieldRowIsRecordRef` | 15 | 37 |

Every `nulnone` storage is the `null` type, and every field code there is 37, the null unit's. The
rep tree also gives `nulnone` to a nullable over an unfilled hole (`?T | null`, `rtOfNullable`).
No field's storage type is one. So no program has the "hole's record", and the code distinguished
nothing.

## What changed

- **`rowStoreRepIn`**, the shared reader, keeps `nulnone` only for the `null` type. A hole's
  `null` as a storage type fails loudly; 0 programs reach that.
- **The readers answer `nulnone` as the unit:**
  - `fieldStorageKindOf` returns `nulnone`;
  - `fieldRowIsNulNone` and `variantFieldIsNulNone` answer yes;
  - `fieldRowIsRecordRef` and `armRowIsRecordRef` answer no;
  - `fieldRowKindIn` (through `rowStoreRepIn`) and `readCellKind` take the rep.
- **The code floor** in each is left only for a row whose storage type is uncovered.
- **`fieldStorageKindOf`** no longer takes the field code.

## Measurement

- **Sweep** (`sweep.vl diff`, master `bc74c717` against this, fixpoint seeds on both sides):
  24,189 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **Seed:** 6,720,295 → 6,720,275 bytes (−20), a fixpoint.

## What is left of lane I's four

The code still answers where the storage type is uncovered. From cut 4's census:

- **A type parameter: 40 programs.** These are generic originals' rows.
- **`T[] | null` with an unresolved element: 4 programs.**

Those are the next grading.
