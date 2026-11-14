## Codegen, memory & runtime (Track B)

- **D16321 closed (clause 1):** a union of records every member of which a record contains, delivered where that record is declared (`function g(b: B | D): A { return b }`), is unboxed into the record's slot at every position, where 28 of 46 positions built an invalid module.
