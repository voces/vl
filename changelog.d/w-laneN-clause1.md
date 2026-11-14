## Codegen, memory & runtime (Track B)

- **D16270, D16271, D16280 closed:** three clause-1 regressions of closed rows run again. A
  binding holding a tagged set's id, listed in a list pinned at a closed function type, is its
  member's closure there; a list a write closes keeps that signature only when every element
  names a function; and the null test of a generic read out of a map through an alias reads the
  map's value.
