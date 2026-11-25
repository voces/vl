## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): field stores built by the IR — through a field narrowed to one record member (`if q.h is B { q.h.w = 5 }`), into a parameter instanced at a field's stored record, and through an un-narrowed union of records (`(A | B).w = v`, legacy's per-member tag dispatch).
