## Codegen, memory & runtime (Track B)

- **IR coverage: a record argument on its parameter's own struct heap.** A direct call's record argument whose type `recordHeapOfTy` stores on the parameter's heap, and whose fields lower to the same valtypes matched by name (`repsLowerAlike`), goes in as an `RRetag` with no bytes; the verifier admits the retag only on that lowering check. Of the 12 same-heap argument rows, 4 are retagged; the other 8 are rep defects, filed as D17051 (a record literal keeps a generic's open closure) and D17052 (a union keeps a union alias as a nested box).
