# `break` and `continue` out of a `for` walk (2026-11-19)

The builder missed every `break` or `continue` that targeted a plain walk (`SForIn`) or crossed one
(`for in break`, `for in continue`): the walk held a placeholder label on the loop stack, since
legacy's `forInLoopOpen` owns the blocks around the body.

## Shape
- `SForIn` carries `xfBrk` and `xfCont`, fresh labels the builder pushes for the walk like a
  `while`'s.
- The lowering already pushed one anonymous frame per block legacy opens around the body. Now the
  frame at legacy's break depth (`loopBrkDepth`'s top after `forInLoopOpen`) carries `xfBrk`, and
  the one at its continue depth (`loopContDepth`'s top: the continue block when the body
  continues, else the loop) carries `xfCont`. A branch's depth is then counted as for any label,
  which is the same `ctrlDepth - depth` legacy's `break`/`continue` writes.
- The verifier scopes both labels over the walk's body.

## Measured
See the PR body.
