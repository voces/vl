## Codegen, memory & runtime (Track B)

- **Slot store, stage 2b part 2b(ii):** a call keyed nowhere reaches its callee's instances in the
  place classes, closing the last walk-only delivery at `monoSlotDeliveryTy`, and
  `elabRetFnListLitTy` reads the classes.
