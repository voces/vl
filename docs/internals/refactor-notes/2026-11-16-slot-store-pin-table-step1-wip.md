# Slot store, pin table step 1: engine parity for mono's slot questions (lane SLOT, WIP, 2026-11-16)

Work in progress on branch `slot-2b3-d`; not for merge as is. Design: the pin-table note
(`2026-11-16-slot-store-pin-table-design.md`); row [D16768](../inventory/D16768.md).

## What step 1 turned out to be

The classes are not rebuilt during mono. `eplBuild` runs at or before the end of the elaboration,
measured on the failing witnesses. Mono's readers fail on the classes because of *engine gaps*:
cases the delivery walk answers and the classes never reach. The pin table is then a cache of the
classes' answers, filled before mono. So step 1 is mostly engine parity, gated by every one of the
7,811 `tests/cases` programs building byte-identical against master's seed.

**Method.** Merge master in and rebuild master's seed before every reading. Twice, a stale master
seed made master's own new commits look like this branch's regressions.

## Readers switched (from the walk)

`monoDeclPathKeysIn`, `monoSlotDeliveryTy`, `monoPinFnParamTys` and `monoFlowSlotPins` read
`eplSlotDeliveredTys` / `eplSlotAnnRets` / `eplSlotPerInstance`. The pin chooser and the pin
speller must read one source.

## Engine rules, each measured over all 7,811

| rule | failing builds | changed bytes |
|---|---|---|
| (first measurement) | 8 | 10 |
| a declaration minted after the write index is keyed as its source (`eplKeyFor`) | (fixes compiler traps in the corpus: 143 classes → 0) | |
| a call's delivery needs closed arguments and a closed result; read for every instance, it takes the instances' agreed types (`elabCallArgTysAgreed`, `elabNodeTyAgreed`) | | |
| a slot in an instanced function read at -1 gathers each instance's bounds | | |
| loop and labelled-block exit values (`break v`, a block's tail) flow to the loop, read from the checked tree (`eplLoopExits`). The rewrite's `lvExitLoops` is filled after the classes | 4 | 10 |
| a value the loop rewrite mints for a loop to hand out, and a loop's carrier, answers as the loop (`eplSrcHolder`) | 3 | 10 |
| capture cells: a shared cell's binding is placed as written, its leading `e` dropped; a closure's write temp answers as its cell's binding; a shared cell's own bound is read at its element | 3 | 4 |

Tried and reverted:
- A hole-typed value copies instead of unifying: 32 programs differ. Containers need union.
- A written function's closed signature as a delivery: fixes `…-widens`, breaks 3 others.

## Open: 7 programs

| program | gap |
|---|---|
| `closures/nested-generic-written-into-capture-cell-at-two-instances` (bytes) | `elabSlotPerInstance` answers per-instance where each instance's deliveries are equal under the classes' frame keys; the walk compares on the write cell with an `e` prefix |
| `closures/capture-cell-annotated-written-with-generic-by-shared-closure` (bytes) | the same per-instance gap, and the classes deliver nothing at `(i32)`/`(f64)` there |
| `closures/generic-choice-in-generic-body-at-each-instance` (bytes) | the classes deliver per instance (string, i32) where the walk delivers nothing |
| `closures/fn-record-returned-to-two-bindings-one-written` (bytes) | over-merging: two bindings of one returned record share calls |
| `closures/list-seeded-by-hole-param-slot-written-with-named-fn` (build fails) | a hole-typed parameter seeding a list unifies with its element, so the parameter's own calls leak in |
| `closures/generic-record-holding-joined-fn-list-at-two-instances` (compiler trap) | the classes deliver per instance where the walk delivers nothing |
| `closures/generic-list-written-fixed-fn-called-in-generic-body-widens` (build fails) | needs the written function's closed signature under a narrower condition than tried |

The distilled corpus was per-cell identical to master at the loop-exit step. Re-run it once
`tests/cases` reaches 0/0.
