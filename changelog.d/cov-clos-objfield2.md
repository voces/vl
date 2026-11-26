## Infrastructure (Track F)

- IR object-field deliveries, part 2. A bundle holder read into a one-closure record field is
  the member the field takes (`RHolderPick` now carries its member). A literal-union atom into a
  nullable-string field goes through `deliver`'s atom-to-string conversion. Both match legacy's
  bytes; `object field holder` and `object field nulStrAtom` go to 0.
