# IR: a walk over a `(boolean | null)[]` or an `f32[]` (2026-11-24, lane IR-N1)

`for in element nulbool` and `for in element f32`, in the same shape as #9830. `forInElemPlain`
(`wasmEmit`) is asked only by the IR through `forInPlainWhy`. It moves `nulbool` and `f32` to the
plain side.

## Why no lowering change

Legacy's `emitForInStmt` reads either element whole into the loop variable at its own rep:
- `nulbool` is the `boolean | null` niche in the `i32` list;
- `f32` is read with `array.get` from an f32 backing.

The walk's only kind-specific setup is the `f64`/`i64` scalar view (`svDstOfKind`), which `f32`
does not take. The builder's variable-rep check already names `f32`. A body that may reallocate
the list takes the non-hoisted walk on both sides; the byte identity of `growB`, `growF` and
`bump` shows the IR takes it too.

The change does not touch the builder's `for in map element` check (D1's PR3 mechanism E), which
admits a map walk's key or value only at `i32` or a string. A map walk asks `forInElemPlain`
first, so the two f32-valued map walks in `tests/cases` (`maps/f32-valued-map.vl`,
`maps/scalar-value-bare-read-boundary.vl`) stopped at that check on base 7bfe6596: in
`tests/cases`, `for in map element` went 16 → 18. #9869 has since removed that check, and on the
merged tree both files are covered and matched (1/1, 4/4).

## Legacy tails the IR calls

- None new.

## Witnesses

- `tests/ir-shadow-rows/for-in-element-nulbool-f32-walks-plainly.vl`: each kind walked plainly,
  with a growing body, as an index pair, breaking and continuing, nested, and at top level.
  Base: 1 of 9 matched, plus a start miss. Head: 9 of 9, start matched. Claims-on is
  byte-identical to claims-off, and the printed output is checked by hand.
- `tests/cases/loops/for-in-nulbool-f32-element-values.vl`:
  - the values that would expose a wrong rep: `true`, `false` and `null`, each printed and
    tested with `== null` and `?? false`;
  - `0.1`, `-0.0`, `3.4e38` and `16777217.0`, printed and summed into an `f32` (`16777217.0 + 1`
    stays `16777216`);
  - a walk that pushes onto its own list.

  The base seed, the head seed and the claimless compiler print the same, and the claim-mode
  build equals the claims-off build.
- Q58 sweeps, one function per position the loop variable is delivered to:
  `tests/cases/loops/for-in-nulbool-list-in-each-position.vl` and
  `tests/cases/loops/for-in-f32-list-in-each-position.vl`. The positions are:
  - a scalar and a union parameter, and a nested call;
  - a concatenation, an interpolation hole, a return and a binding;
  - an `if` arm, a `??` operand, a record field and an index pair.

  Under `VL_IR_SHADOW=6`, nulbool goes from 64/75 matched with 11 misses to 75/75, and f32 from
  63/74 with 11 misses to 74/74. Claims-on equals claims-off, and both print what the `@log`
  lines expect.

## Bytes and coverage

- Self-compile `--names`: identical 9,433, differ 0. `--cases`: identical 7,860, differ 0, with
  2 expected divergences (both listed in the baseline). `--claimless`: identical 14,462, differ 0.
  `tests/cases` A/B: same 8,979, differ 0. The moved list is empty. The mode 3 self-compile is
  byte-identical to legacy.
- `tests/cases` armed shadow, with this PR's witnesses included:
  - `for in element nulbool` 27 → 0 (start 1 → 0) and `for in element f32` 23 → 0 (start 3 → 0);
  - covered = matched 82,875 → 82,923, and start matched 7,234 → 7,238.

  Before the witnesses were added the classes were 15, 10 and 3 (start). The corpus is unchanged:
  46,880 of 46,958 functions with no blocker. The self-compile walks neither kind.

## Fuel

L2 −0.00% per PR on base 7bfe6596.
