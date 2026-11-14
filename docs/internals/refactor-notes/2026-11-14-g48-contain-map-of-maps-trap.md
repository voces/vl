# Contain a clause-1 trap that D15941's map-of-maps pin let through, 2026-11-14

Lane G. #7995 (D15941) made `monoPinMapSlot` pin an un-annotated map of maps at the one closed
type its stored maps carry. When the inner map's function is called by nothing the elaboration
sees, it is built at its uncalled stub. If a value read back through the outer map is then called,
that call names a signature no instance has. Without a matching `$fnsig` it refuses (D16121).
With one, for instance from a lambda of that signature elsewhere, it **trapped** on
`indirect call type mismatch`. That program refused loudly before #7995.

## Change

The map-of-maps arm declines, and the old loud refusal returns, when both of these hold:

- **`monoStoredMapFnsUncalled`**: a stored map, followed down through the maps it stores, reaches
  a binding whose function slot is `elabSlotUncalled`;
- **`monoMapValuesRead`**: a value of the outer map is read for its own values, directly or
  through `const` aliases. An index store's target is not a read, and neither is `.length`.

Otherwise the pin stands as before. The D15941 witness, a pinned inner map, three-deep nesting
and `.length` through the outer map all still run.

## Grading

- The trapping cell (`pinned-map-of-hole-fn-one-signature.matrix.vl`, `map_set` un-annotated)
  moves from **TRAP (program)** to the emit refusal.
- `map-of-maps-of-hole-fns.matrix.vl` holds at 57 of 58, and
  `pinned-map-of-hole-fn-read-through-a-holder.matrix.vl` at 73 of 78. Graded against master's
  seed, all three templates have 0 runs→not-runs and 0 program traps. A first cut regressed
  `outer_size` and `three_deep` and was narrowed to the two conditions above.
- The one SILENT cell left in the one-signature template (`return_inferred` annotated) is the
  same before and after #7995. It is filed as D16124.
