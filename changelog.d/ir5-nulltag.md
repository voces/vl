## Codegen, memory & runtime (Track B)

- **IR: `== null` / `!= null` over a union box.** `nulTestArmOf`'s `boxTag` arm (the box's tag against `null`'s) builds when the operand is held as a box (an `RBox`, or a boxed `| null`), through `nulTestBoxTagTail`, which legacy's arm writes through too. A shared field read whose box-local receiver keeps its declared `| null` rep past a `!= null` misses by name (`shared read receiver rep`) instead of reaching the verifier.
