# A per-argument delivered type (design, 2026-11-04, for review; not built)

Group B of [mono-pin-survey-2026-11.md](mono-pin-survey-2026-11.md) found that no elaboration fact
equals mono's argument pin (`monoArgPinTyIx`). The elaboration has two stores, and both are joins.

- **The instance's parameter** (`elabCallParamTy`) is the type the instance settled for the
  parameter: an output of the solve.
- **The call's binding row** (`callBindNote`, read by `callBindRowOf`) binds once per *type
  variable*. It is joined over every argument that mentions the variable, and widened numerically
  (`callNumJoin`, D2459).

A pin is neither. It is *this argument's* type, an input to the instance key. With `f(a: T, b: T)`
called as `f(1, 2.5)`, the row binds `T = f64` and the instance's `a` is `f64`, while the first
argument is delivered as `i32`. The 1,332 elab-wider calls in the survey are this shape.

## The fact

`elabArgDeliveredTy(arg, k)`: the closed type argument node `arg` is delivered at, in the instance
`k` of the function that contains the call. It is defined as:

1. the argument's type in the caller's instance (`elabNodeTyAt(arg, fnIx)`), or its checked type
   where the caller is not generic and that type is closed;
2. then that type's rep where the rep column built the value elsewhere. Today these are separate
   mono rungs:
   - a literal the record solve built (`monoLitBuiltTy`);
   - a call copied back (`recCopyTyOf`, and since #6242 the call's stamp `nodeRepStamped`);
   - an adopted variant (`litRetArmRow`);
   - the closure-pin annotation (`monoCloPinAnnNodeOfExpr`).

It is -1 when step 1 is still open. Mono then keeps today's ladder for that argument, so the switch
can land reader by reader.

## Key and store

The key is `(argument node, caller instance)`. The argument node already fixes the call and the
index, so a separate `(call, i)` key is not needed. The store is a pair table like `elabNodeReps`
and `elabNodeNarrowed` (`elabPairIn(table, arg, k)`). The root frame uses `k = -1`.

## Producer

The producer is the elaboration's call walk, at the point that already builds a call's key:
`elabRowEntries(call, decl, names, tys)`, called from the key builders at `emit_elab.vl` lines
1647, 2564 and 7035. That walk runs once per call per instance, and it holds the caller's key.

For each argument it writes step 1 and step 2 into the table. `#r.<i>` (D15173) is the
record-only special case: it writes a key entry only where the delivered record differs from the
hole's binding. That entry stays a key entry. The new fact sits beside it and is not part of the
key.

**One producer, readers read only.** Step 1 reads group A's per-instance node type, and step 2
reads the rep column. The fact adds no decider. It records, in one place, a composition that mono
currently recomputes at each of the 12 call sites. Group B is therefore downstream of group A: it
lands after the column lane's `elabNodeTyAt` second producers are gone.

## How it differs from the binding row

| | binding row | per-argument fact |
|---|---|---|
| unit | one per call, per type variable | one per argument, per caller instance |
| when | after the call's solve | before the instance is keyed |
| `f(1, 2.5)` at `(a: T, b: T)` | `T = f64` | `a` at `i32`, `b` at `f64` |
| role | the instance's binding (output) | the instance key's input |

## First reader

The first reader is `monoArgPinTyIx`'s `repRow` rung (`monoArgRepRowTy`). Today it reads the call's
binding row, substituted into the parameter (`callArgRepTy`), which is a join-shaped store answering
an argument-shaped question. It reads EQ against both stores in all 71 calls (20 files), so the
first slice should be 0 movers. Its deletion is also the first proof that the fact's step 2 covers
a rep rung.

The next readers would be `litBuilt`, `copy`, `variant` and `cloAnn` (step 2), then the `own`
fallthrough. `own` is the large one: 21,547 EQ, 2,163 EQEXACT and 403 mono-open calls, where the
fact answers with a closed type and mono today keeps `T`.

## A second reader of the same confusion

`litRepTyAt`'s second rung, `elabArgTyAt`, answers a literal argument with the parameter type its
call closes. That is the instance's settled parameter: an output. It used to rank above the
literal's own rep stamp, which is where the literal is built. D15288 was that ordering. A list
literal spread into a push took `push`'s parameter `{f: i32}[]` over its `J[]` stamp. Since
D15288's fix, a closed stamp ranks first, and `elabArgTyAt` answers only for an open stamp.
`elabArgTyAt` should become a reader of the per-argument fact once that fact exists.

## Not decided here

- **`fnOwn`.** The argument names a function value: 739 NE, mostly `(T) => T` against an
  instance's closed signature. Function identity is group C/step 3 territory, and it may need
  `Fn#d` rather than this fact.
- **Callback-position misalignment.** About 800 "other" NE calls remain, `(i32, i32) => boolean`
  against `i32[]`. They need their own probe, keyed by argument node rather than `cwIxUpAux`,
  before anyone reads them as disagreements.
