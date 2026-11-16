# Rep hole-instance, step 1: anonymous rows keyed at the literal's own type, 2026-11-16 (lane REP)

The heap shadow (#8722) names 22 struct-row merges in 15 files whose rows are typed at a type
variable: two rows sharing a `tyRepId` while one stores, say, `string` and the other `i32`.
Anonymous rows recorded `anonRowTyIx`, the literal's context rep. For a literal handed to an
un-annotated parameter, that context still names the hole, so every instance's row shared one
identity type. `anonRowStoreTyIx`, which takes the literal's own type where the context names a
type variable, was already the type such a row is built at. It is now the row's identity too
(the mint in `emit_collect.vl`).

This is not D16720's mechanism. D16720 is a field's storage type left at the hole
(`sFieldStoreTy`, `fcKeptHoleRow`); only 3 of its 18 files are among these 15.

## Readings

Heap shadow, armed, over `tests/cases`, `std` and the distilled `cells/` and `named/`
(20,588 files):

| class | before | after |
|---|---|---|
| hole or generic instance | 22 in 15 files | 12 in 9 |
| function field | 5 in 4 | 4 in 3 |
| discriminating arm row | 18 in 16 | 18 in 16 |
| unnamed | 0 | 0 |

The 12 left are function-holding or generic-maker rows minted at the shape-intern mint
(`recordSTyIx(fieldsTy)`). Step 2 there waits on slot-store stage 3, so the two lanes do not edit
function-row identity at once.

## Proof

- `corpuscmp`, master against the branch: 8,416 modules, 2 DIFFER, 0 LOST. Both print the same:
  - `generics/record-literal-built-at-instance-function-field.vl`: prints `1` on both;
    297 → 292 bytes.
  - `structs/nested-record-literal-beside-declared-record-with-another-field-function.vl`:
    prints `2.5 2.5 2.5 3` on both; 545 → 543 bytes.
- Matrix A/B, master L2 against branch L2, over the 147 maker / hole-fn / list-of / fn-record /
  record-field templates: 0 runs → not-runs, 0 → silent, 0 → program trap; 7,600 of 8,766
  graded cells run.
- Seed fixpoint. `scripts/gate.sh` passes but for master's own red
  (`generics/hole-fn-value-unresolved-read.vl`, #8741).
