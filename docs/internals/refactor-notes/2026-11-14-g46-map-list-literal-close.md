# D15943: a list literal of pinned maps of hole functions takes their type, 2026-11-14

Lane G, stacked on D15941. Mono pins an un-annotated map of hole functions (`monoPinMapValues`)
and retypes its reads (`monoRetypeMapReads`). A list literal holding those reads,
`xs.push([m2, fnMap])`, kept the checker's open type `{[string]: (_) => _}[]`. So `arrRefSlotOf`
found no list row and refused it.

`monoCloseMapListLits` runs once a pinned map's reads are retyped. It types each open list
literal in the frame whose elements all carry one closed map type (`monoListOfMaps`) at the list
of that map, then repeats, so an enclosing literal of such literals closes too. It touches only a
literal the checker left open, and only over maps.

## Grading

- The D15943 witness prints `10`, and its one-map spelling prints `3`.
- `scripts/capability-probes/matrix/map-of-hole-fns-pushed-onto-map-list.matrix.vl`, graded
  against D15941's seed: `array_push` (both faces) and `map_set` (annotated), the three cells the
  row names, moved from the refusal to runs. That is 51 of 58, with 0 runs→not-runs, 0 silent and
  0 traps. The cells still not running were refused before too: `struct_field_init` and
  `array_element` (un-annotated) hit `ref valtype with no interned shape`, and four check
  refusals remain.
