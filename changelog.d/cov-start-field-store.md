## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): a field store through a field narrowed to one record member (`if q.h is B { q.h.w = 5 }`), and a store into a parameter instanced at a field's stored record, are built by the IR.
