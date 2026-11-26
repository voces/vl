## Infrastructure (Track F)

- The IR claims a never-filled `null` read where a `boolean | null` or `string | null` is wanted: the
  read is that type's null, built at its rep (`null unit read rep` 14 → 7, 0 lost; lane COV-CLOS).
