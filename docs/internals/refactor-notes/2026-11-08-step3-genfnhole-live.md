# Step 3: the `genFnHole*` family is live, and the open rows by lane (2026-11-08)

Lane "end of step 3, part 2". Base: master `9bbf9564` with #6867 merged in, built to a fixpoint.

## The family carries 149 running programs

The six functions are at check_relate_core.vl:4270–4640 today. Five are exported:
`genFnHoleInstance`, `genFnHoleCallInsts`, `genFnHoleSoleInst`, `genFnHoleMovedInsts`,
`genFnHoleOpenInsts`, plus `genFnHoleCalled` at :7551. Together they have 18 call sites outside
the family:

| caller | file | what it decides |
|---|---|---|
| `pinHoleLambdaVals`, `holeLambdaAtEachInst` | check_calls | a lambda literal's parameter types, from the calls the callee makes on its hole |
| `judgeFnArgHoleCalls` (4 sites), `holeOpenCallsWait` | check_calls | whether a named generic, a re-pointed `let` or a choice fits each instance the hole is called at |
| record-field arm (:3419) | check_calls | the same, for a generic in a record field |
| `fsbGenFnHolePins`, `holeParamUse` | check_calls | the instance a generic takes at a marked binding; whether a hole is called |
| `instGenFnHolePins` → `genFnHolePinAt` | check_demands | the pin a generic delivered to a hole takes, forwarded up to 8 declarations deep |
| `genFnHoleBodyRet` | check_relate_core, emit_elab | an instance's result as its body gives it |

Shadow: every answer replaced by its "nothing known" value (-1, no instances, not called), swept
against the candidate:

| | |
|---|---|
| `runs → not-runs` | **149** (97 `cannot infer a type for parameter`, the rest emit refusals and traps) |
| new compiler traps | 18 |
| output movers | 191 of 23,707 |
| by origin | 76 `cases/closures`, 48 inventory witnesses, 17 `cases/functions`, 3 generics, 3 named |

So "nothing reaches it" is false, and the callers cannot move onto `elabIdentityFnTy` or
`elabHeldValTy`. Those facts come from `elabRun`, which runs after `checkProgram`. These callers
produce the checker's own diagnostics and the pins it records, so they need their answer
before any elaboration exists.

What would delete the family: the checker types a hole parameter handed `Fn#d` as `Fn#d`, and
checks each call through it as a call of `d` at that call's arguments. Today it checks the callee's
body once, with the parameter as a hole, and the family recovers the instances from `argCstr`
rows afterwards. Changing that is a checker change to how hole parameters are bound per call. It
is not a consumer switch, and there is no elaboration fact to shadow against. It is step 3's
remaining work, and it is checker-only, so it is not blocked on another lane.

## The open rows

| row | today | lane |
|---|---|---|
| D15565 | **runs** (this PR) | elaboration root seeding, below |
| D15566 | emit reject, new: D15565's spelling at two types | step 4 / w147: a list element read at two instances |
| D10382 | check reject | needs the per-call `Fn#d` binding above; the checker-only half moves it to an emit reject (#6867), so it is blocked on w147 |
| D12211 | check reject, **closed as DESIGN** (its status line) | none; it should not be on the open list |
| D2621 | emit reject, intrinsic `__load_i32__` as a value | wasmEmit; a singleton of an intrinsic, not a checker gap |
| D12218 | emit reject, `[a]` in a recursive generic with swapped arguments | w147 (per-instance) |
| D14883 | emit reject, `fw(lam)` returned then called at two types | w147 (x06's shape) |
| D14888 | emit reject, `fw(lam)` inside a generic at `T` | w147 |
| D15014 | emit reject, a nested generic called from a lambda | w147 |

D15565's mechanism was not the checker's. The checker records `call0([g], 5)` in `run`'s
template with `fs := ?run.0[]`. The elaboration's root pass closes rows it cannot otherwise close
by defaulting each list of a `?` hole to `i32[]` (`elabEmptyElemsAtI32`, meant for an empty
literal). It minted `call0@fs := i32[]` whether or not `run` was ever called, and that
instance's re-check refused `fs[0](x)`. A hole some declaration owns (`elabHoleDeclOf`) is now
left open, as the bare `call1(g, 5)` row already was.

## Can step 3 be marked done?

No. What stands:
1. The `genFnHole*` family (checker; this lane's, and unblocked). It needs the per-call `Fn#d`
   binding of hole parameters, which is a design change with 149 programs riding on it.
2. A singleton through a returned value (`pass(h)`, D14883, D14888): w147.
3. D10382: checker half, then mono's (w147).
