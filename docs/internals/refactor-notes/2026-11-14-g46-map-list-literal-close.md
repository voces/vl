# D15943: a list literal pushed onto an annotated list of maps takes the holder's type, 2026-11-14

Lane G, stacked on D15941. Mono pins an un-annotated map of hole functions (`monoPinMapValues`)
and retypes its reads. A list literal holding those reads, `xs.push([m2, fnMap])`, kept the
checker's open type `{[string]: (_) => _}[]`, so `arrRefSlotOf` found no list row and refused it.

## Where the type comes from

The literal's type is the holder's: `xs` is annotated `({[string]: (a: f64) => f64}[])[]`, and a
value pushed onto it is delivered at its element type. A probe at the refusal showed that neither
the check nor the elaboration records that delivery on the literal: `nodeCtxTyIxOf` and
`elabNodeCtxAt` are both -1. The elaboration does compute the holder's element type for a pushed
read (`elabReadStampsAt`, D15942), but only to collect function types. It banks no stamp for a
literal argument.

So `monoCloseMapListLits` reads the receiver's checked type rather than inferring anything:
- for each `recv.push(lit)` or `recv.set(k, lit)` whose receiver type is closed, it takes the
  element or value type;
- when that type is a list of maps and the literal is still open, `monoCloseListLitAt` records
  the literal at it, and each open list literal element at the element type.

Nothing is derived from the literal's own elements. A first version did that, and was replaced on
the coordinator's review. The step that makes this unnecessary in mono is for the elaboration to
bank a literal argument's destination, as the check does for a bare argument.

## Grading

- The D15943 witness prints `10`, and its one-map spelling prints `3`.
- `scripts/capability-probes/matrix/map-of-hole-fns-pushed-onto-map-list.matrix.vl`, graded
  against D15941's seed: `array_push` (both faces) and `map_set` (annotated), the three cells the
  row names, moved from the refusal to runs. That is 51 of 58, with 0 runs→not-runs, 0 silent and
  0 traps. The cells still not running were refused before too: `struct_field_init` and
  `array_element` (un-annotated) hit `ref valtype with no interned shape`, and four check
  refusals remain.
