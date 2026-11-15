## Type system (Track A)

- **The pinned mono re-check is a `QuietRun`** (L5 step 3c): `monoRecheckBegin`/`End` open and
  close it through `quietRunOpen`/`quietRunEnd`/`quietRunDrop`, and `MonoSave` is deleted.
  Byte-identical over 20,310 corpus programs and the L2 build; net −24 compiler lines.
