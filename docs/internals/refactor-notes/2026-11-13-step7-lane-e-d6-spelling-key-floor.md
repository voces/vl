# Step 7 D6: the interner's field-set spelling key is deleted behind a loud floor, 2026-11-13

This is lane E's D6 work, co-owned with lane F. `internInlineShapeTyGo` finds an existing row in
three steps:

- by type (`structRowOfRecordTy`);
- else by layout (`annShapeLayoutRowOf`);
- else by `annShapeIndexOf`'s field-set key, when the layout answers -2 because a field records no
  storage type.

That last key hashed each field's element NAME (`shapeFieldSetIdOf`), and peeled a struct field's
element spelling twice with `nonNulBaseOf`. It was the spelling floor the layout-id note
(`2026-11-12-step7-shape-layout-id.md`) left for untyped queries.

## Probe

A scratch compiler, never refreshed into a seed, tagged each decision into one accumulator per
program. The accumulator was raised at the end of `emitProgram`, on master `e0d8c7f1`, over the
sweep's 24,203 programs.

| site | programs |
| --- | --- |
| `internInlineShapeTyGo` reached with a record type | 5,787, all with a typed `TyObj` (0 untyped) |
| the layout answering -2, which reaches `annShapeIndexOf` | **0** |
| `annShapeWiderRowOf` asked | 3,827 (3 hits) |
| `code0SpellingFitsRow` asked inside the layout walk | 182 (28 refusals) |

Since #7600 and D6 cut 3, every query reaching the interner is typed, so the spelling key is
unreachable.

## Changed

- **The -2 answer is a loud floor.** It now fails with `an inline record field has no storage type
  to key its row by`, instead of consulting a spelling key.
- **Deleted.** `annShapeIndexOf` goes, with its two `nonNulBaseOf` calls, and so does the index it
  alone read: `shapeFieldSetIdOf`, `elemSid`, `shapeRowSetId`, `sSetSync` and the
  `sSetHead`/`sSetTail`/`sSetNext`/`sSetLen` columns.
- **Kept.** `sSetLim`, which the layout index shares, now scans from that index's own watermark.

## Proof

- Refresh ×2: fixpoint, 6,710,697 bytes. The base is 6,716,949.
- Sweep with fixpoint seeds on both sides, master `e0d8c7f1` against the candidate: 24,203 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass, on the branch and on the tree merged with master `fd1aea03`.
- Render-parse: unchanged at 2 parses. `nonNulBaseOf` still has callers.

## What the probe leaves to the rest of D6

- **`annShapeWiderRowOf`'s spelling compare** is reached only where a row or query field records no
  storage type. It goes with lane F's field-text consumers.
- **`code0SpellingFitsRow`** splits atom fields by their text in 28 programs. That is a key read the
  layout id does not yet carry.
- **`shapeFieldElemName`'s text fallbacks** fire at almost every code. They produce the element
  NAMES `sFieldElemName` records: lane F's key column (D1).
