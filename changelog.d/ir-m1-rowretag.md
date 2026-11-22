## Codegen, memory & runtime (Track B)

- **IR coverage: a record argument on its parameter's own struct heap.** A direct call's record argument whose type `recordHeapOfTy` stores on the parameter's heap, and whose fields lower to the same valtypes matched by name (`repsLowerAlike`: any two closures or two boxes lower to one struct each), goes in as an `RRetag` with no bytes; the verifier admits the retag only on that lowering check. All 12 same-heap argument rows are retagged: field reorders, recursive structural twins, a generic's open closure field and a nested union layer.
