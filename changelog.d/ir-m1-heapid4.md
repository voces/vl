## Codegen, memory & runtime (Track B)

- IR coverage, heap identity batch 2b part 2 (lane IR-M1): a `T | null` global read narrowed past its null takes its record row's heap, so D1's two d16132 map cells build in IR.
