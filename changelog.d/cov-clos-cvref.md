## Infrastructure (Track F)

- The IR builds a `const x = inner` of a generic nested function called only through `x` as the
  core closure legacy stores, rather than refusing it as a generic value (`closure value
  refused` → 0; lane COV-CLOS).
