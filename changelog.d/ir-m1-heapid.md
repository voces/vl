## Codegen, memory & runtime (Track B)

- IR coverage, heap identity batch 1 (lane IR-M1): a record type with no row of its own takes its storage row's heap, a record stands at one whose field is nullable over its own or where its own is `null` on that heap, and a global read notes its struct cell's heap where its fields match the cell row's.
