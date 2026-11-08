# Step 7: two missing-fact declines of `computeRetInference#2`, narrowed at their producers

Measured 2026-11-08 on master `45817891` (#6748, fixpoint 6,497,485 bytes), 4-core box, with
`scripts/col-shadow/run.sh` (19,358 files, 13,525 compile with no imports staged).

## Recorded result has no token (32 → 13)

Graded with a debug build that printed each declined function's recorded type, its returned
values' stamps and the walk's columns. The class is not one mechanism. It is three:

| recorded type | n | value stamp | walk |
|---|---|---|---|
| record or list of records holding an unclosed hole function, `{fs: ((_) => _)[]}[]` | 13 | the closed `{fs: ((i32) => i32)[]}[]`, which has a row | that row |
| `{f: i32}`, a container read a `??` defaults (D15218) | 6 | `J`, the wider row the container's values are built at | that row |
| map of hole functions, `{[string]: (_) => _}` | 4 | half closed (`m0`), half still `(_) => _` | `map` |
| `{f: i32}` from a call or a binding | 4 | `{f: i32}`, no row | row 0 |
| list of lists of hole functions | 3 | still `((_) => _)[][]` | row 2 or 3 |
| `{v: null}` | 1 | `{v: i32 \| null}` | row 0 |
| mono clone `mk$1`, returned binding | 1 | stamped at the template's instance (`x: i32`), not the clone's (`x: string`) | row 3 |

`fnRecordedRetTy` already read the values' stamps where a record or list has no row (D14901
class D), but only in a function with no elaboration key and only for a literal or call value.
It now runs in every function, covers maps, and in a plain function (`frsIsPlainFn`) reads any
returned value's stamp. Instances keep the literal-or-call rule, because a clone's binding can
carry the template's stamp (the `mk$1` row). 19 functions move to the recorded result.

Left (13): the 3 lists of lists and 4 maps, whose stamps are still open or sit in an instance;
5 `{f: i32}` built at row 0, which neither the value's stamp nor an agreeing set of calls names
(`frsCallsBuiltRow`); and the `mk$1` clone.

## No result recorded (15 → 10)

The function node of every one has no checker type, so the template route returns open.

| shape | n | closed by |
|---|---|---|
| lambda nested in an instance (`k >= 0`), its values stamped at `k` | 4 | `elabNestedResultOf(fd, k)` |
| instance whose values are its own recursive call and a closed one (`r`) | 1 | `elabResultOf` skips the self call |
| instance returning a call of a hole lambda bound to a hole function (`w` returns `lap(id)`) | 4 | open: `elabNodeTy(lap(id), k)` is -1 |
| lambdas with no elaboration key (`k < 0`) | 6 | open: nothing elaborates them |

The 5 closed ones record a closed scalar, so `synthRecordedRetAnnots` annotates them and run #2
never reaches them. Asking the instance AHEAD of the template route made two programs trap: a
closure whose tail is a write records `void` through its template and was handed the write's
value (`recorded-result-bound-tail-write.vl`, D14791). It is asked only after.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical, after each commit |
| seed size | 6,497,485 → 6,497,896 (+411, +0.006%), both fixpoints |
| `scripts/sweep.vl` diff, 23,615 cells | 23,615 same, 0 movers, 0 `runs → not-runs`, 0 traps |
| run #2 declined, post settled | 49 → 25 (no token 32 → 13, no result 15 → 10, own record at a variant 2) |
