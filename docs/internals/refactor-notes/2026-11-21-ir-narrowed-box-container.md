# IR: a union-box local narrowed to a ref list or map arm (2026-11-21, lane IR-N3)

`narrowed read` was the IR's refusal of a local whose rep differs from the rep its narrowing
reads it at, along every arm `narrowedLocalRead` did not own. In tests/cases the largest
sub-shapes, ranked by an instrumented miss over union-box locals, were a box narrowed to a
ref-element list (`identReadArmOf` `reflist`, 115 functions, plus 31 over a boxed `U | null`) and a
box narrowed to a map (`map`, 68, plus 24 at a cell). Legacy reads both the same way: the box, its
payload, and a cast to the arm's list wrapper or map struct (`emitRefArrayUnionUnboxRead`,
`emitMapUnionUnboxRead`).

## The change

- `RBoxNarrow` carries the container `bnCon` (`RC_REF_LIST`, `RC_MAP`, else -1). The builder
  takes it from an exhaustive match over `identReadArmOf` (`boxContainerReadOf`), only at a list or
  map rep, and records the read as the re-read a loop's hoisted receiver writes (`irReadAgain`).
- Legacy's two emitters are split past the box push into `refArrayUnionUnboxTail` and
  `mapUnionUnboxTail`. The lowering writes the box and that tail, past the list overrides
  `emitIdentNode` asks first.
- The verifier admits a boxed `U | null` operand under a container read.

## Witness

`tests/ir-shadow-rows/narrowed-box-container-read.vl`: an element read and a `for` walk over
`Ca[] | i32` narrowed to the list, and a map arm of `{[i32]: i32} | string`. The walk is the
hoisted-receiver spelling. Without `irReadAgain`, twelve `deep-is` cases fell to
`unlowered: hoisted receiver read`.
