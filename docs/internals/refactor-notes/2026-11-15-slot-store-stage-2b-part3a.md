# Slot store, stage 2b part 2b(iii-a): the place classes learn what the walk delivers, ahead of its deletion (lane S, 2026-11-15)

Part 2b(ii) ([`2026-11-15-slot-store-stage-2b-part2-readers.md`](2026-11-15-slot-store-stage-2b-part2-readers.md))
closed the last walk-only mono delivery. This part teaches the place classes the deliveries the
delivery walk (`elabSlotDeliveries`) makes and they did not, and switches one more reader. It is
reader-neutral otherwise: the deletions it enables are part 2b(iii-b), and the two together are
net-negative in compiler lines (the coordinator's bar for borrowing these lines).

## What changed

Each rule was found by a probe that runs the walk beside `eplSlotSig` at every walk call and logs
where they differ:
- **A read the check stamped at a written destination bounds a place of its own** at that type
  (`eplCtxBound`, `EPL.boundTy`), program-level from `nodeCtxTyIxOf` and per instance from
  `elabNodeCtxs`, as the walk's `elabReadStampsAt` reads them.
- **A function value's flow carries its result** (`eplResultFlows`), and **a call through a value
  yields that value's result** (`eplCallPlace`); a method call keeps its own place.
- **A captured binding's cell element is the binding** (`eplSlotPlace`).
- **A generic's parameter is bounded at its written type substituted at the place's instance**
  (`eplBoundOf`, `elabSubstClosed`).
- **An argument handed to a callee written in place flows into its parameter**: the checker wraps
  a generic function value handed to a typed parameter in an adapter lambda (`fvaLambda`), and the
  edge into the adapter's parameter was not drawn. This was the written-`let` family's cause.
- **An element step names a map's values or a list's elements by the holder's type**, as the walk's
  `elabSlotTyOf` treats `e` and `v`.
- **Calls that agree on a member's own closed signature deliver it** (`eplClosedMemberAt`).
- **Each compile starts its classes afresh** (`elabRun`): in a host that compiles many programs in
  one instance (the cases harness), a program that never marked the classes stale read the previous
  program's.
- **`elabLamGenResultTy` reads the classes** (`eplSlotParams`, the one closed parameter list the
  calls through a slot agree on).

## Parity

The probe over the 134 `tests/cases` files of lane M's 26-site measurement: 169 walk calls with one
closed delivery that `eplSlotSig` answered otherwise, now 146 in 51 files. All three
`elabLamGenResultTy` rows and 22 of the 44 written-`let` roots agree. What is left, by shape: written
`let`s at the root answering -1 (22), parameter paths (29), record and list paths (21), and 21 where
both answer, differently.

Not switched: `elabLamDeliveredParams` ([D16580](../inventory/D16580.md): the walk call has an effect
the classes do not reproduce, still unnamed).

## Deletion ledger (part 2b(iii-b))

A static call graph of the walk from its two entry points; a function counts as walk-private when
every caller is in the walk. It does not see functions read as values, so it is an upper bound.

| deleted in iii-b | functions | lines | unblocked by |
|---|---|---|---|
| the walk's entry points: `elabSlotDeliveries` (118), `elabSlotDeliveriesOmitting` (14), `elabSlotClimb` (123), `elabSlotHeldIn` (65), `elabCallDeliveryAdd` (45), `elabPlaceUp` (8) | 6 | 373 | every reader below |
| walk-private helpers, called only from inside the walk | 60 | 1470 | the entry points above going |

Total: 66 functions, 1843 lines.

The readers whose switch frees the entry points: `elabLamDeliveredParams`, `elabSlotAnnRets`,
`elabSlotCallTysOpenFns`, `elabSlotPerInstance`, `elabSlotUncalled`, `elabSlotUncalledOmitting`,
`elabValueAgreedCallTys`, `elabValueOnlyCall`, `elabValueReturnsFrom`, `elabLamParamTyAt`,
`elabSlotFlowFns`, and lane M's `monoDeclPathKeysIn`, `monoPinFnParamTys` and `monoFlowSlotPins`.

## Readings

¶READINGS
