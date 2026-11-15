## Codegen, memory & runtime (Track B)

- **Slot store, stage 2b part 2b(i):** a slot's delivered signature reads the place classes
  (`eplSlotSig`, `eplSlotOneCall`, `eplSlotCallsAt`). `monoSlotDeliveryTy` and
  `elabHoleGenFlowTy` read them in place of the delivery walk, and `elabSlotOnlyCall` is deleted.
