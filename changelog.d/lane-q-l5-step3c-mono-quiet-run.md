## Type system (Track A)

- **The pinned mono re-check is a `QuietRun`** (L5 step 3c): `monoRecheckBegin`/`End` open and
  close it through `quietRunOpen`/`quietRunEnd`/`quietRunDrop`, and `MonoSave` is deleted.
  GATE_SHORT
