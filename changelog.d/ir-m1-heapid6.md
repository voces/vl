## Codegen, memory & runtime (Track B)

- IR coverage, heap identity 4b (lane IR-M1): a returned record literal whose own type has no heap is retagged at the result's record through the heap its row built it at, so D17083's four d15221 cells build in IR.
