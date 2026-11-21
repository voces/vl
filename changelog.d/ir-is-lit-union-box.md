## Codegen, memory & runtime (Track B)

- **IR coverage: litArms' box arms.** `v is L` over a value-union box, `L` a literal union of strings or numbers, and a string membership over a box receiver are per literal the box's tag test and its payload compare. Legacy's `emitUnionLitIs` is now a plan (`unionLitIsPlanOf`) and shared tails the IR's `RLitArms` lowers through. A receiver that is not a plain box, or a temp, is a named miss.
