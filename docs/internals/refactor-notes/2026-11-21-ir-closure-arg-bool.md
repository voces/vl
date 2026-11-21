# IR: a boolean or vector argument of a closure call, 2026-11-21

Lane IR-N6, the first slice of `call of a non-declaration` (518 `tests/cases` rows). A call
through a function value was refused whenever an argument was a `boolean` going into an `i32`
parameter or a `v128` going into a `v128` one. Legacy's `emitCallRefArg` writes both through its
general arm with nothing owed, so the IR's plain-argument build already produces the same bytes.

## The change

- `callRefArgPlain` (wasmEmit.vl), legacy's own predicate for that general arm, accepts a `boolean`
  width at an `i32` parameter and `v128` at a `v128` one.
- `closureArgRepIs` (ir_build.vl) accepts the `bool` prim at an `i32` slot and `v128` at a `v128`
  slot, which it refused before.

The new row `tests/ir-shadow-rows/closure-call-bool-arg.vl` has covered and matched floors of 4
(base: 3, with `go` refused as `call of a non-declaration`).

## Readings (base: master `7211b9921`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 63,285 | 63,346 (+61) |
| armed `tests/cases` covered / matched | 63,285 / 63,284 | 63,346 / 63,345 |
| `tests/cases` `call of a non-declaration` (any / alone) | 518 / 434 | 460 / 383 |
| corpus functions with no blocker | 44,439 | 44,440 |
| corpus `call of a non-declaration` (any / alone) | 64 / 61 | 60 / 59 |
| self-compile functions with no blocker | 19,502 | 19,502 |
| L2 self-compile fuel | 106,716,683,708 | 106,714,258,190 (−0.002%) |

The armed fail and mismatch rows are the same three on both seeds. Identity: `--names` 9,037
identical with 0 differing, `--cases` 7,588 identical with 0 differing, and `--claimless` 14,014
identical with 0 differing. Late demands stay at 9 and late tag rows at 307.
