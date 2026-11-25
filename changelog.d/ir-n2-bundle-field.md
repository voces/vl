## Codegen, memory & runtime (Track B)

- **IR coverage: a module record's two-signature bundle field read as a value** (D17164): `const v = w.f`, copied or handed on, reads the record at the cell legacy stores it in, byte-identical to legacy; the 5 `start: field read coercion` cells of family B leave the class, and two pre-existing misses they then stop at are filed (D17172, D17173).
