## Infrastructure (Track F)

- The IR writes a `?.` read off a name only ever `null` as the null its destination seeds, as
  legacy does (`optional read of null`; lane COV-CLOS). A receiver legacy writes for its effect
  first (a field, a chain) still misses.
