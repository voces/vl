## Codegen, memory & runtime (Track B)

- **Slot store, stage 2b part 2b(iii) B:** `elabLamGenResultTy` reads the place classes (`eplSlotParams`). A call through a function value now yields its members' results in the classes, and each elaboration run starts with fresh classes, so a compiler instance reused across programs no longer reads the previous program's. The three returned-through-result programs are named corpus cells.
