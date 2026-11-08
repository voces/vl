# Step 7: fourteen more declines of `computeRetInference#2` read from the recorded result

Measured 2026-11-08 on master `dc29cbb8` (#6764, fixpoint 6,504,349 bytes), 4-core box, with
`scripts/col-shadow/run.sh` (19,359 files, 13,526 graded) and a debug build that printed each
declined function's recorded type, its values' stamps, the elaboration's held type
(`elabHeldValTy`), the binding facts and the calls reaching it.

## Recorded result has no token (13 → 3)

`fnRecordedRetTy` now asks `frsValuesBuiltTy` where the result still has no token: the one type
every returned value is built at, a record at any record and anything else only where it closes
the result's holes and keeps its closed parts (`frsClosesHoles`).

| shape | n | producer that names the token |
|---|---|---|
| `{f: i32}` returning a call of a function built at `J` (`mkd`, two `mk4`) | 3 | the callee's recorded result (`J`) |
| `{f: i32}` returning a `const` a push builds at `J` (`g`, D15237) | 1 | the binding's build (`recBuildTyIn`) |
| `{f: i32}` whose tail assigns into a call-built binding (D15239) | 1 | the target binding's build |
| list of lists of hole functions (`deliver0`, two `deliver2`) | 3 | the binding's elaboration slot fact (`elabSlotTyAt`) |
| `mk` and its clone `mk$1`, a `const` list of records with a hole-function field | 2 | the `const`'s initializer, held per instance (`x: string` in the clone) |

The clone's Ident still carries the template's stamp; its initializer's held type does not, and
the hole check refuses the template's `x: i32` against the clone's `x: string`. A `let`'s
initializer is not read: the body may reassign it (D14782 moved on that before the guard).

Left (3), all maps of hole functions: `mkMap` and `pick` have no held type, and `mk`'s
(`{[string]: (i32) => i32}`) has no map row. The walk answers `map`, slot -1.

## No result recorded (4 → 0)

`frsHoleLambdaRet`, last: where every value is open, the elaboration's held type, else the one
type every fn-tag call reaching the function is checked at, else the elaboration's unbound
default (`elabUnboundTpTy`, D4551; `elabHoleFnClosed`, D9100). No new default.

| lambda | k | answered by |
|---|---|---|
| `__lambda_8` (captured-cell seed, returns `(_) => void`) | 0 | held type `(boolean) => void` |
| `ks[0] = (x) => …`, `fs[0] = (x) => x + x`, `hs[0] = (x) => …` | -2 | the call's stamp, `i32` (`ks[0](7)`, `fs[0](2)`, `hs[0](5)`) |

The default arm is reached by none of the 4. All 4 record a closed scalar, so
`synthRecordedRetAnnots` annotates them and they leave run #2's population.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,504,349 → 6,507,456 (+3,107, +0.05%), both fixpoints |
| `scripts/sweep.vl` diff, 23,618 cells | 0 `runs → not-runs`, 0 traps, 1 output mover (below) |
| run #2 declined, post settled | 17 → 3 |

The mover: D14782, a loud emit reject before and after. `deliverNested`'s recorded result is now
`((i32) => i32)[][]`, the type of both its writes, so the emitter refuses at the nested list
instead of at the missing interned shape. The row is updated and grades as filed.
