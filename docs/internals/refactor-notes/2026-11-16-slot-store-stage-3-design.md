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

## 2. The proposal: one writer at a time, under its own gate

Each of mono's pin writers moves its decision into the elaboration, one writer per PR. Its gate
moves verbatim, as a moved function, and its type goes into a side table keyed by holder and
instance. Only a holder with a table entry bounds its class at that type. Mono's writer then reads
the table instead of deciding, and writes `letType` / `parType` where it does today (§3). Each PR's
gate: the writer's witness runs under freeze-time reads (B′-1, `slot-bprime-1`), and every other
program is byte-identical, over `tests/cases`, distilled, the capability probes and the matrix. Once
every writer has moved, the class readers read as of the freeze (B′-1 lands), and D16768 closes on
that measurement.

**One implementation.** Each writer's gate moves out of `emit_mono.vl` into a module both mono and
the elaboration import (`compiler/pin_gates.vl` for writer 1), in its own identity-graded PR; the
elaboration's call follows in the next. A second implementation of a gate, on the checker's write
index, was declined: it could disagree with mono's. The residual risk is input, not code: the
elaboration runs the gate over the program before mono, and mono over the program its own rewrites
have changed by then. Each behavioural PR's byte-identity is what measures that.

**Why per writer.** A prototype that bounded every un-annotated holder with a closed slot fact
(branch `slot-s3a`) ran D16898 under freeze-time reads but lost 13 `tests/cases` programs
(`closures/hole-fn-in-unannotated-map`: "a function slot pinned at one signature has no one closed
type"; `closures/uncalled-hole-fn-value`: "call to unknown function";
`closures/maker-result-called-in-place`: "cannot take the generic function `other` as a value"), and
changed the output of 4 more (`closures/uncalled-hole-lambda-stored-runs`,
`closures/list-of-uncalled-hole-fn`, `closures/hole-lambda-uncalled-in-list`,
`closures/generic-bound-unread-in-instanced-function`). A fact bounds a class only where mono's own
gate applies it.

**The sequence**, each gate as its writer states it:

| # | writer | gate | type |
| --- | --- | --- | --- |
| 1 | `monoPinMapValues` (D16898) | a `const` (or closed-written) map whose value the checker left open; the stored functions close at the slot fact | `elabSlotTyAt` |
| 2 | `monoPinMapSlot` | a map initializer or a binding's field map; refused where a value is an unpinned call | the stored values' type |
| 3 | `monoPinSlotRecordList`, `monoPinSlotRecordMap` | a list literal or fresh `Map()` whose slot holds one record at two or more signatures, emit-representable | from `elabSlotFieldRecord` |
| 4 | `monoPinListElems` | an un-annotated list literal the flow table pins at one function type; no capture cell, no re-point but to a list literal | `elabSlotTyAt` or `monoFlowSlotPins` |
| 5 | `monoPinListRecords` | a list of record literals left open at a record of functions | `monoHeldRecordListAt` |
| 6 | `monoPinNestedListElems` | a list of list literals of functions written nowhere, owned by its instance | the inner element pin |
| 7 | `monoUncalledListElems` | a list whose element slot nothing calls, one write | `monoUncalledSlotFnTy` |
| 8 | `monoMakeInstanceHit` (`parType`) | a registry hit filling a value use's hole annotations | `monoPinRepTyOf` |

## 3. Boundaries

- **STORE** (answered 2026-11-16). None of these pins is a storage decision, and none feeds
  `fnTagDecide`: it runs at check, its re-run `fnTagRedecide` inside `elabPrepare`, mono after both.
  One coupling: `check_fn_tag.vl` reads `letType < 0` / `parType < 0` as un-annotated, so a pin
  decided earlier must not be written into those fields before `fnTagRedecide` finishes. Stage 3's
  pins therefore live in a side table the classes and mono read; only mono's apply step writes the
  AST field, where it does today. STORE would read the table as a read-only fact if a residue class
  needs it (its S class, through the per-instance key), and is told when it lands.
- **L2** (answered 2026-11-16). No overlap with schemes or the bounds alphabet: those are type
  bounds per function, and S3b's pins are value-flow facts. The overlap is the instance key: the
  solved instantiation recorded per call (#8836, #8841) and interned by STORE's A0 into a `KeyId`.
  S3b's side table keys a per-instance pin by the elaboration's instance key (`ekIndex`) for now.
  It switches to that `KeyId` once A0, a shadow comparing the check's keys with the elaboration's,
  reports them equal for the instances that hold written slots, or once an A stage makes the
  check's key the one mono builds from (STORE, 2026-11-16).
- **The node replacements of §5** are mono's flow rewrite (`mfrElabFns` / `mfrElabNames`), which
  only gates the rewrite: the answer is already the elaboration's. L2's population table (#8859,
  refactor-notes/2026-11-16-l2-read-resolution.md) holds all four, and every ask on them gives the
  same answer at the end of `elabPrepare` as at mono (1,790 of the 1,792 calls mono asks across the
  corpus). L2 proposes the query move into the elaboration, asked by check; stage 3 then reads that
  query where a class reader meets a replaced node, and designs nothing else for them.

## 4. Acceptance

Each PR: `tests/cases` byte-identical or every mover named with its output compared; distilled
0 runs → not-runs; the design's core matrix set, both faces; D16898's two named cells; the six
programs D16768 names; L2 fuel and plumb-shape cost reported.

## 5. Measured so far

- The probe's firing table and B′-1's grading: the freeze-snapshot note.
- B′-2's narrowed count: 3 `tests/cases` programs and 1 matrix cell, all nodes mono's flow rewrite
  replaced; renames, capture-box names and raw name resolution do not reach a class reader.
