# Step 7: eight more declines of `computeRetInference#2` read from the recorded result

Measured 2026-11-08 on top of #6757 (`efdad38b`, fixpoint 6,500,740 bytes), 4-core box, with
`scripts/col-shadow/run.sh` (19,358 files, 13,525 graded). Graded with a debug build that
appended each declined function's walk columns, recorded type, and each returned value's checker,
rep and elaboration type (and, for a call, the recorded result of the function it lowers to).

## No result recorded (10 → 4)

| shape | n | value | closed by |
|---|---|---|---|
| instance returning a call of a hole lambda (`w` returns `lap(id)`) | 4 | checker `_`, elaboration -1; the lambda clone the call lowers to records `string` / `boolean` / `i32` | the callee's recorded result |
| lambda no instance elaborates (`k < 0`), `(x) => x + x` at a closed `x` | 2 | checker `i32` | the value's closed checker type |
| keyless lambdas whose values stay a hole (`_`, `(_) => void`) | 4 | open everywhere | open |

`fnRecordedRetTy` asks the new `frsValuesRet` last, after the template route and
`elabNestedResultOf`. A value that writes (`x = …`, `x += …`) or is `void` answers nothing, so a
closure whose tail is a write keeps its recorded `void` (D14791). The 6 closed record a closed
scalar, so `synthRecordedRetAnnots` annotates them before run #2.

## Own record at a variant (2 → 0)

`mk1` (`const d1: R | string = mk1(7)` beside `const e1 = mk1(3)`) and `mkcall` (`(mkcall()).r`)
each have a call that takes the value as built (`recBuildTyIn` is -1, or a member read). The
columns now read the function's own checker record instead of declining; both agree with the
walk (`agree struct`).

## Left (17)

- no token, 13: unchanged (the lists of lists and maps with open stamps, the 5 `{f: i32}` at row 0,
  and the `mk$1` clone).
- no result recorded, 4: keyless lambdas whose every value is a hole. The emitter lowers them at
  `i32` by default; no fact names that.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,500,740 → 6,502,028 (+1,288, +0.02%), both fixpoints |
| `scripts/sweep.vl` diff, 23,615 cells | 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 traps |
| run #2 declined, post settled | 25 → 17 |
