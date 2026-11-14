## Codegen, memory & runtime (Track B)

- **A shared field read boxes members that store the field differently beside `null` (D16048,
  D16049).** A string set at the atom niche beside `i32 | null`, and nullable lists of different
  element types, read through an un-narrowed union of records into the read's union box instead of
  refusing with `field access receiver is not a struct`.
