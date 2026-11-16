# Slot store stage 3: mono's pins decided before mono (lane SLOT, 2026-11-16)

Closes [D16768](../inventory/D16768.md) when built; its witness is [D16898](../inventory/D16898.md).
The place classes are frozen when mono begins (#8838), but a class reader asked during mono reads
types and bounds that mono's own pins wrote (refactor-notes/2026-11-16-slot-store-freeze-snapshot.md),
and reading them as of the freeze loses D16898. Stage 3 of the slot-store design ("containers read
the store", 2026-11-14-slot-store-design.md §5) is where those pins stop being mono's decisions.

## 1. The pins mono writes

Twelve writes into a binding's or parameter's annotation in `emit_mono.vl`, by where the type
comes from:

| writer | type written | source |
| --- | --- | --- |
| `monoPinMapValues` | `elabSlotTyAt` | the elaboration's slot fact |
| `monoPinSlotRecordList`, `monoPinSlotRecordMap` | from `elabSlotFieldRecord` | the elaboration's field record |
| `monoPinListElems` (one of two writes) | `elabSlotTyAt` | the elaboration's slot fact |
| `monoPinListElems` (the other) | from `monoFlowSlotPins` / `monoFlowHeldOneGen` | mono's flow table |
| `monoPinNestedListElems` (three writes) | from element types mono reads | mono |
| `monoPinListRecords` | `monoHeldRecordListAt` | mono |
| `monoPinMapSlot` | from the stored values it instances | mono |
| `monoUncalledListElems` | from the uncalled set | mono |
| `monoMakeInstanceHit` (`parType`) | `monoPinRepTyOf` | mono |

D16898's pin is the first row: a probe build that fails at each write names `monoPinMapValues` for
both spellings. The type it writes, `elabSlotTyAt`, is settled before mono; what mono adds is the
write, and the class readers asked after it see the holder's type through it.

## 2. The proposal

**S3a. A closed slot fact bounds its class.** At class build, an un-annotated holder whose
elaboration slot fact is closed bounds its class at that fact, as an annotation would, read from
the slot facts, not from an annotation written early. The facts are computed from the classes, so
this is a rebuild after the facts settle or a step of their fixpoint. Mono's
pin then writes what the class already answers. Prediction, to measure first: with S3a, the
freeze-time reads of B′-1 (`slot-bprime-1`) keep D16898 running.

**S3b. Mono's own pins move into the elaboration.** The rows whose type mono computes (the flow
table, held record lists, a map's stored values, the uncalled set, the representative pin) are
decided in the elaboration's fixpoint (design §3.4), held in a side table, and written onto the
program by one `monoApplyPlaceStore` in mono, per
the design's stage-3 row (G1, G2, G6, X4: D16202, D16280; G9 with stage 5). One writer per PR, each
graded byte-identical or as a named mover.

**S3c. The readers read as of the freeze.** B′-1 lands last: with every pin decided before mono,
reading types and bounds as of the freeze is identical, and D16768 closes on that measurement.

## 3. Boundaries

- **STORE** (answered 2026-11-16). None of these pins is a storage decision, and none feeds
  `fnTagDecide`: it runs at check, its re-run `fnTagRedecide` inside `elabPrepare`, mono after both.
  One coupling: `check_fn_tag.vl` reads `letType < 0` / `parType < 0` as un-annotated, so a pin
  decided earlier must not be written into those fields before `fnTagRedecide` finishes. Stage 3's
  pins therefore live in a side table the classes and mono read; only mono's apply step writes the
  AST field, where it does today. STORE would read the table as a read-only fact if a residue class
  needs it (its S class, through the per-instance key), and is told when it lands.
- **L2.** OPEN (asked 2026-11-16): whether S3b overlaps L2's interface inference, and whether the
  node replacements of §5 are the `monoFlowReadSet` constant-index rewrite L2 is moving for D16881;
  if they are, stage 3 designs nothing for them.

## 4. Acceptance

Each PR: `tests/cases` byte-identical or every mover named with its output compared; distilled
0 runs → not-runs; the design's core matrix set, both faces; D16898's two named cells; the six
programs D16768 names; L2 fuel and plumb-shape cost reported.

## 5. Measured so far

- The probe's firing table and B′-1's grading: the freeze-snapshot note.
- B′-2's narrowed count: 3 `tests/cases` programs and 1 matrix cell, all nodes mono's flow rewrite
  replaced; renames, capture-box names and raw name resolution do not reach a class reader.
