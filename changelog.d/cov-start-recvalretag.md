## Codegen, memory & runtime (Track B)

- **D17672 closed:** the IR's value retag of a struct-literal temp compares the heap of the row it was built at with the destination's heap, not the row number itself, so a right retag is no longer refused (and a wrong one cannot be accepted) once a twin row shifts rows past heaps.
