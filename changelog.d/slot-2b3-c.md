## Codegen, memory & runtime (Track B)

- **Slot store, stage 2b part 2b(iii) C:** the uncalled family (`elabSlotUncalled`, `elabSlotUncalledOmitting`, and through them `elabValueSlotUncalled` and mono's list, nested-list and stored-slot pins) asks the place classes whether a slot is delivered (`eplSlotDelivered`). Each flow edge now carries the read it was drawn from, so an omit can leave out the reads the flow rewrite re-points.
