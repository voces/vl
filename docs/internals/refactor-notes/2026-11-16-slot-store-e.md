# Slot store part E: the delivery walk is deleted (lane SLOT, 2026-11-16)

Row [D16768](../inventory/D16768.md). After D2 (#8792) no function outside `elabSlotDeliveries`'
own callee closure referred to it. This change deletes the walk and everything only it reached.

## What goes

- 61 functions: 60 in `compiler/emit_elab.vl` (`elabSlotDeliveries`, `elabSlotDeliveriesAt`,
  `elabSlotDeliveriesInto`, `elabSlotClimb`, `elabSlotReadDeliveries`, `elabSlotAliasOn`,
  `elabReadOn`, `elabRetSlotOn`, `elabCallDeliveryAdd`, `elabRetsAdd`, `elabValueCalls` and the
  helpers only they called) and `placeStepOf` in `compiler/check_lam_chain.vl`.
- The state only they read: the walk's memo, nest and key registers (`elabDlv*`), the climb's seen
  markers, the read index, the path ids, `elabCallsSeen`, `elabRetSink`, `ekTwinBase`, and
  `check_lam_chain.vl`'s place steps (`lcPlaceSteps` and its notes).
- Seven imports only the walk used.

The live set is what every function outside the walk's callee closure reaches; the walk's
functions outside it are the deleted set.

## What stays

The classes (`eplBuild` and its readers) answer every question the walk answered. The
scaling-shape axes that measured the walk now name the classes in their hints; their programs and
bars are unchanged.

## Readings

All against master `2a0b71c1a` (D2 merged); both seeds reach their fixpoint on the second refresh.

- `tests/cases`, 8,137 programs with the module entries, built by both seeds (exit code, refusal
  text, wasm bytes): no difference.
- Distilled regress: 0 runs → not-runs, 0 → silent (of 260,747 census cells); per-cell output
  identical to master's.
- Capability matrix A/B over the 153 templates matching `maker|hole-fn|list-of|fn-record|closure|
  captured|generic-relay`: 0 runs → not-runs in every template, no REGRESS line. The one non-zero
  exit is `maker-calls-handed-on-at-two-signatures`, whose `one_instance` cells are invalid wasm on
  both seeds ([D16851](../inventory/D16851.md)).
- L2 self-compile fuel 96,383,880,667 against master's 97,687,913,071: −1.30 G, −1.33%. The flip
  (#8731) cost +2.34 G on its own parent; with D2's +0.16 G, the walk's replacement nets about +1.2 G.
- The seed is 2,050 bytes smaller: the build already left out most of the walk, which no export
  reached; the fuel is the cost of checking and elaborating its source.
- Walk-limit: `emit_elab.vl` falls from 94 to 82.
