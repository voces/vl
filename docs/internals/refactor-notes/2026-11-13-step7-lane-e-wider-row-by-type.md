# Step 7 D6: the wider-row find reads no field text, 2026-11-13

This is lane E's D6 work, step (c). Lane D takes `code0SpellingFitsRow`, by lane E's split.

`annShapeWiderRowOf` (D831) lets a row whose field already boxes a query field's type serve the
query too. A field coded alike on both sides is compared by its storage types (`tySame`). Where
either side recorded no storage type, it fell back to comparing the row's element name with
`shapeFieldElemName` of the query's field text.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `1fff67ce`. It put a
distinctive `emitFail` on the text-compare branch. The population was the sweep's 24,204
programs. The function itself is reached in 3,827 programs, by the D6 probe of
`2026-11-13-step7-lane-e-d6-spelling-key-floor.md`.

The text branch was reached in **0** programs: every field the wider-row find compares records a
storage type on both sides.

## Changed

A field with no storage type on either side serves no merge, so the query mints its own row.
Declining to merge is the conservative answer: no program is refused, and at worst a twin row is
kept. The function drops its `texts` parameter.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `1fff67ce` against the candidate: 24,204 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass.

## What reads the interner's field texts now

Two readers are left. Once both read types, the interner's field-spelling split can go:

- `code0SpellingFitsRow` (lane D);
- `iisPushFieldElem`'s `shapeFieldElemName(texts[pi], …)`, lane F's `sFieldElemName` re-key.
