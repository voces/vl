## Type system (Track A)

- **The effect-summary rows are one lifetime record** (L5 step 4c): the 34 tables `esReset`
  cleared are fields of `EsRows`, reset by one assignment, and the four importers each import
  `esRows` in place of their lists. Byte-identical over 20,298 corpus programs and
  the L2 build; net −36 compiler lines.
