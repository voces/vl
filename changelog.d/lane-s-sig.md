## Codegen, memory & runtime (Track B)

- **Slot store, stage 2b part 2b(i):** a slot's delivered signature reads the place classes
  (`eplSlotSig`, `eplSlotOneCall`, `eplSlotCallsAt`). `monoSlotDeliveryTy` and
  `elabHoleGenFlowTy` read them in place of the delivery walk, and `elabSlotOnlyCall` is deleted.
- **D16143 closed:** a call result's un-annotated function handed to a generic `(x: T) => i32`
  parameter runs; a holder written in a generic is bounded at its instance.
