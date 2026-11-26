## Infrastructure (Track F)

- The IR claims a boxed `T | null` map read whose computed default makes it non-null: the default
  is boxed into the read's box, the same struct (`map read box default computes` 2 → 0, rep-fuzz
  seeds 31337 case 1 and 88888 case 243 claimed, 0 lost; lane COV-CLOS).
