# L2 S3.4b, part 2: a type-bound member call meets a hole's demand, 2026-11-16

The member rule's graded change (`2026-11-16-l2-s3-plan.md`, S3.4b), on part 1's walk.
- **The change.** An un-annotated parameter's member call grows the hole's demanded shape, and
  the argument was judged against that shape, so a member its type answers by a type-bound
  `self`-function was refused as a missing field (D16384). `holeDemandOk` now judges the argument
  against the shape less those members (`shapeLessTypeBound`). An empty remainder passes without
  an assignment, since the argument is not converted at the call. D4033's rung already resolves the
  call per instance, in the checker and in mono's pin.
- **What stays refused.** A shape does not record whether a member was called or read as a value.
  A value read of a type-bound function (`const f = b.loadI32`) is therefore still refused, now at
  the read, as `no field 'loadI32' on Buf`. Master refused it at the call, as
  `argument 1: expected {loadI32: _}, got Buf`. An argument with neither the field nor the function
  is refused as before.

## What moved

- Fingerprint against part 1's fixpoint seed, both from one worktree: 0 of 20,684 programs move.
  No corpus program reached the refusal.
- `type-bound-call-in-generic-body.matrix.vl` runs all 54 graded cells, including the un-annotated
  `argument` cell D16384 was found in. 0 runs → not-runs.
- New case `modules/ufcs-type-bound-at-hole-parameter/` covers:
  - two modules' `grow` through one hole, declared before and after;
  - `Buf.loadI32`;
  - a field read beside the type-bound call.

  Master refuses it at the first call.

## Rows

`check-filed-witnesses --strict`:
- D16384 closes.
- D4033 stays as filed (runs).
- D3818 stays as filed. Its alias receiver needs the per-instance re-dispatch the emitter gives
  only to a parameter receiver, the same alias ingredient as D16807. An attempt to resolve an
  alias read through its declaration in the elaboration changed neither row.
