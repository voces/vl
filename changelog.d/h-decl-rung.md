## Type system (Track A)

- **Step 7: two `declTyIxOfName` callers stop running the annotation grammar.**
  `declIsVariantArm` reads the declared-name table, since a generic declaration
  or an interface is never stored at a variant row; and a function-set
  nullable's box row is keyed by its scalar's own nullable rather than by
  re-parsing `i32|null`. 0 runs lost over the sweep.
