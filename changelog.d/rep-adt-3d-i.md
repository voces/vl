## Infrastructure (Track F)

- **Rep ADT stage 3d-i:** every read of the field element-type, literal-set and map-key-kind
  sidecars goes through one reader each. Under `$VL_REP_SHADOW` each reader compares the read
  with the value the row's storage type projects: 416,979 reads agree, and the rest fall into named
  classes. 0 module bytes change:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3d-i-sidecar-shadow.md`.
