## Infrastructure (Track F)

- The IR claims a union-valued map read narrowed to a record member: the value's box is read whole
  and narrowed (`map get union box rep` 4 → 3, 0 lost; lane COV-CLOS).
