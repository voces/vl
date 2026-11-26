## Infrastructure (Track F)

- The IR claims a union-valued map read narrowed to a map or list member: the probe, then legacy's
  narrowed tail unboxes the container (`map get union box rep` 3 → 1, 0 lost; lane COV-CLOS).
