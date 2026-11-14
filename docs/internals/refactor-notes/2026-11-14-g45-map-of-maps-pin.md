# D15941: an un-annotated map of maps of a hole function is pinned, 2026-11-14

Lane G. `monoPinMapValues` pins an un-annotated map whose value is still open at a function, or
at a list or record of functions. A map whose value is itself such a map had no arm.

What happened: `m4` (holding `half`) was pinned, but the outer `mm` (`mm.set("k", m4)`) kept the
value type `{[string]: (_) => _}`. `mvValKindOfTy`'s map arm mints no slot for an inner map
still open at a type variable ("a pin mints its slot"), so `mm`'s `Map()` was refused as an
unsupported map value type. That held even when `half` was never called: mono pins `m4` at the
uncalled default, and only the outer map stayed open.

## Change

- **`monoPinMapSlot`** gets a `TyMap` arm. When every stored value carries one closed map type,
  that type is the outer map's value. The existing tail records the outer map's type and retypes
  its reads.
- **`monoRetypeMapReads`**: a `const` bound to a read of the outer map retypes its own value
  reads, the way it already does a record value's fields. A function read back through the two
  maps is then called at its pinned type.

Both are in `emit_mono`. The emit-side mint (`mvShapeOfMapNodeTy`) is unchanged, because once
pinned, the outer map's value type has a name.

## Grading

- The D15941 witness prints `1`.
- `scripts/capability-probes/matrix/map-of-maps-of-hole-fns.matrix.vl` delivers the pinned map
  everywhere. Its cells cover a `set` and an index store into an un-annotated map of maps,
  `.length` through it, three-deep nesting, and the outer map held in a record and in a list.
  Before and after: 14 cells moved from refused to runs, now 57 of 58. The remaining cell is the
  un-annotated `argument` check refusal, unchanged. There were 0 runs→not-runs, 0 silent and
  0 traps.
- `pinned-map-of-hole-fn-read-through-a-holder.matrix.vl`, the row's grading list: `map_value`
  (un-annotated) runs. `map_set` (un-annotated) moves to D15940's `monoPinMapValues` refusal,
  since that template holds `half` at two signatures, and joins the three cells already there.
- A call made only through the outer map, and a `for` loop over it, still refuse. They are
  D16121: the elaboration does not alias the outer map's value slot to the inner map's.
