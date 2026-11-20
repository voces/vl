# IR: a `__trap__` statement, and a return boxing a call's primitive result (2026-11-19, lane DEAD)

On master 6949b7666 two corpus classes blocked functions alone: `intrinsic none` (348) and
`return of a boxed call` (339). Sized by grid, each is 316 nj2 cells plus small d2567, d16261,
d947 and d3127 groups. In the nj2 cells, each is one std:fmt function compiled in every cell:
- `toFixed`, whose `__trap__("…")` the builder had no arm for;
- `parseF64`, which returns `withSign(...)` (an f64) from a function returning `f64 | null`.

## What landed

- **`trapCallNamed`** (wasmEmit) is the routing `emitCallCoreIdent` uses for `__trap__`: the
  spelling with no binding owning the name. The builder takes such a call statement (with no
  declaration) as its message, then `STrap`:
  - the message is the existing `RPrint` effect at the `str` arm, i.e. legacy's `printStrTail`;
  - so the IR writes exactly `emitCallCoreTrap`'s message stream, then `unreachable`.

  A trap in a function returning `never` stays legacy's (`trap in a never function`): legacy
  gives that function a result and pads it with a second `unreachable`. `--cases` caught that in
  `tests/cases/intrinsics/checker-special-intrinsic-as-value.vl`.
- **`retBoxesCall` narrows to the case it guards.** It used to miss every call returned into a
  boxed nullable; it now misses only a call whose own result is not a primitive.
  - One box struct serves every union, so a call already returning a box is boxed by writing
    nothing, and legacy then rewrites the call to `return_call`.
  - A primitive result is always boxed by a `struct.new` after the call, so legacy returns it
    plainly, and the IR delivers it through the box writer (`RToBox`).

## Coverage

| reading | master 6949b7666 | this step | gained |
|---|---:|---:|---:|
| corpus functions covered = matched (`ir-shadow.vl`, 45,678) | 34,229 | 34,914 | +685 |
| `intrinsic none` alone, corpus | 348 | 0 | |
| `return of a boxed call` alone, corpus | 339 | 0 | |
| self-compile functions the shipped claim emits | 14,163 | 14,163 | 0 |

That is +35 net compiler lines (+40 −5). No legacy line is deleted or moved to `@ir`.

## Bars

| bar | reading |
|---|---|
| `ir-identity.sh` plain, `--names`, mode 3 | 9,037 identical, 3,267 fail under both, 0 differ; self-compile identical |
| `--cases` | 7,513 identical, 68 fail under both, 0 differ |
| armed shadow | 34,914 covered = verified = matched; `--claims` ok |
| seed fixpoint, `regress.vl` | holds; 0 runs → not-runs of 260,828 |
| L2 fuel, seed size | +0.6%; +1.0% |
| late demands, lint-self, phase-state | at baseline; clean; ok |
