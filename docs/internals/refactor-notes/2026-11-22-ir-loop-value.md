# IR: a scalar loop value, 2026-11-22

Lane IR-N4, control flow; stacked on the void labelled block. A loop value is a labelled block or
a `while` the checker gives a result binding (`whileLv`). Legacy types its frame by that binding
(`lvFrameOpen`), and every `break v` stores the binding and then reads it back onto the branch.
A labelled block's tail falls out with the binding when it assigns it (`lvTailAssigns`), else
`unreachable`. A `while`'s frame is left only by its breaks, so `unreachable` follows the loop.
`end` is followed by a `local.set` of the binding.

## Change

- The frame is an `SBlock` whose out is the result binding, a declared variable rather than a
  helper's stack temp. `ibLvOf` maps the frame's break label to it, and a `break v` to that label
  is a valued `SBr` carrying it. The verifier admits a valued block or branch outside a helper
  only when its out is a declared binding.
- The labelled block's tail is a valued `SBr` to its own label when `lvTailAssigns` (exported) holds,
  else an `STrap`. The lowering writes the tail branch as the bare read that falls out, as legacy
  does. A `while`'s frame ends with an `STrap` after its loop. Its `while true` writes no test
  (`condLitTrue`), and any other condition is a named miss.
- `loopValueBlock` writes the typed `block`, the body, `end` and the `local.set`, inside the
  loop's list-header hoists as legacy orders them.
- A reference binding stays a named miss, `loop value rep`, because its blocktype is not built
  here. That covers 32 of the 50 functions.

The shadow row is `tests/ir-shadow-rows/loop-value-scalar.vl`. The run case is
`tests/cases/loops/loop-value-scalar-frames.vl`.
