## Infrastructure (Track F)

- **The phase-state census leaves the type arena's accessors out of checker surface**: imports of
  the `TY_ARENA_API` list (`tyPin*` today, lane H's child accessors with stage 2b) print as `arena`;
  a listed name `check_types.vl` stops exporting fails the census.
