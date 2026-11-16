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

READINGS
