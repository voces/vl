## Infrastructure (Track F)

- The IR calls a `const` lambda's returned bundle record at the member legacy picks after the
  call (`d()(3)`, `closure callee rep` → 0 on the lifted form; lane COV-CLOS). A module-level
  lambda's record-returning call still declines (`call of a non-declaration`).
