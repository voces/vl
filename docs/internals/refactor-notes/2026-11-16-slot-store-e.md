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

Against master `04d2d22d2` (D2 and #8798 merged); both seeds reach their fixpoint on the second
refresh.

- `tests/cases`, 8,137 programs with the module entries, built by both seeds (exit code, refusal
  text, wasm bytes): no difference.
- Distilled regress: 0 runs → not-runs, 0 → silent (of 260,747 census cells); per-cell output
  identical to master's.
- Capability matrix A/B (against `2a0b71c1a`, before the last master merge) over the 153 templates
  matching `maker|hole-fn|list-of|fn-record|closure|captured|generic-relay`: 0 runs → not-runs in
  every template, no REGRESS line. The one non-zero exit is
  `maker-calls-handed-on-at-two-signatures`, whose `one_instance` cells are invalid wasm on both
  seeds ([D16851](../inventory/D16851.md)).
- L2 self-compile fuel 94,520,912,887 against master's 95,809,052,991: −1.29 G, −1.34% (−1.20% on
  the 95.67 G baseline). The flip (#8731) cost +2.34 G and D2 +0.16 G; the walk's replacement
  nets about +1.2 G.
- The seed is about 2 KB smaller: the build already left out most of the walk, which no export
  reached; the fuel is the cost of checking and elaborating its source.
- Walk-limit: `emit_elab.vl` falls from 100 to 82.
