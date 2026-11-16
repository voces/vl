## Codegen, memory & runtime (Track B)

- **D16844 closed:** a copy of a closure-written type-parameter binding stored into a record
  builds at 19.7M guest fuel, was 175.6G (its fixture 26.1M, was 420G and 130 s): the slot
  walks apply their cycle rule at every path length. Residue D16724 (cost still grows with the
  record's fields).
