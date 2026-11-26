# START-2: a name narrowed to `null`, bound (2026-11-26)

COV-CALL's witness (`global read coercion`): `const q: Rec | null = null; if q is Rec { … } else
{ const z = q }`. Two misses, one commit each:
- the global's seated read narrowed to `null` (`nullReadOwnAt` = stored) was asked at its narrowed
  type; it now reads the cell as it stands, as a local's seated read takes the variable;
- `deliver` then refused `null read storage rep` for locals and globals alike: the binding's type
  is the `null` unit, while legacy declares the local at the source's storage type. At a
  `null`-unit destination the storage read is returned as it stands and the fresh binding takes
  it at that row (`localStoredAt`); every other consumer still checks the rep it gets.

Both spellings (global, local `const`) are claimed and print as claims-off does. A parameter
narrowed to `null` and bound still misses on `declaration coercion` (COV-START's).

Found on master, reported, not fixed here: `z == null` on such a binding of a global refuses at
emit ("struct equality is not supported yet"); the same with a parameter runs.
