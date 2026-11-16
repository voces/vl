## Codegen, memory & runtime (Track B)

- **Union return boxing in one pass:** each arm of a returned union finds its variant row among the rows its type could equal, not by scanning every row, so a function returning a union of 128 record types builds at 1.27G guest fuel, was 2.29G. Self-compile −0.30%. A scaling-shape growth axis (64 record arms against 16) guards it.
