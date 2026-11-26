## Infrastructure (Track F)

- A call of a function returning its parameter at two signatures, whose result is bound to a name
  nothing reads, keeps the bundle whole as a dropped call does, instead of being refused (D17670,
  lane COV-CLOS): at module level, inside a function, as a `let`.
