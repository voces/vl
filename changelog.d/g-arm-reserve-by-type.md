## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** a union `==`'s list-compare and closure-eq frame reservations read the operand's arms as variant rows by member type (`unionArmRowsOfExpr`), not by its union's spelling. Byte-identical across the sweep.
