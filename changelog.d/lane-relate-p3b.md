## Type system (Track A)

- **The substitution's pin notes no longer depend on quiet mode** (review medium 3, relate P3). A
  quiet level that turns pin notes from kept to dropped marks and rolls back lane Q's
  `RB_ELAB_PIN` family. Six quiet brackets now go through `quietEnter`/`quietLeave`, so the
  `inferQuiet` hidden scopes go from 10 to 4. Byte-identical over 20,434 programs; L2 fuel +0.016%;
  net +29 compiler lines.
