# D2772 (a): a generic call over a union of lists, split by type at run time — design

Lane F2, 2026-11-18. Design only; no code yet. Ruling: DECISIONS, "A union of lists handed to a
generic is split by type at run time (D2772 ruling (a), 2026-11-18)".

## Today

`openArgTyParamRefused` (check_calls) refuses a call whose argument is a closed union reaching a
type parameter under a list, record or map (#9015, D16959), including a numeric list and its
literal twin (D16963). The ruling keeps that refusal past two such arguments and makes the rest run.

## Where the split happens

**1. Check: one binding per member combination, at the call.**
At the point `openArgTyParamRefused` fires, the checker builds a *split plan* instead, when:
- at most two arguments are such unions (more keeps #9015's refusal);
- every member is a list or map type (a union of records keeps the refusal; not in the ruling);
- each member combination binds every open type parameter cleanly. Binding is re-run per combination
  with the argument typed at the member. A combination that leaves one open, or fails the body's
  demands, keeps the refusal, naming that member.

Each combination is solved as a call of its own: bindings `bNames/bTys`, its demands re-asked
through `ifaceSolveAt` (so `glen<string>`'s body constraints are checked as a direct call's are), and
its result type. The call's type is the union of the combinations' results (`glen` → `i32`;
`first<T>` over `string[] | i32[]` → `string | i32`). The plan is recorded by call node:
`callSplit[ix]` = per combination, the member index of each split argument and its bindings.

**2. Rows and instances: one bind row per combination.**
`callBindNote` today is one row per call node. A split call gets one row per combination
(`callSplitRows[ix]`). The elaboration enqueues an instance per row; instance keys differ by
bindings, so this needs no new keying. Mono instantiates the callee per combination
(`monoInstantiateCallIn` with that row's bindings) and records `splitInstFe[ix][c]`.

**3. Emit: a dispatch at the call site.**
The split arguments are evaluated once into locals; the other arguments are evaluated once in order,
as the call would. Per combination, in plan order, the emitter:
- tests each split argument with the `is` machinery for that member: the box tag, or the content
  test where the member shares a tag (D16894's `i32[]`/`K[]` twins, D16970's cross-rep lists);
- unboxes or casts each argument to the member's rep;
- calls that combination's instance;
- coerces the result to the call's union rep, as a join arm does.

The last combination is the `else`, so no trap arm is needed. The list object is handed whole, not
copied, so writes through the instance reach the caller's list.

Lowered like `emitFnTagDispatch`, but keyed on value tags, not a function set.

## How it composes

- **#9015 / D16959.** Stays the refusal for more than two union arguments, a non-list/map union, and
  a combination that binds `T` uncleanly. Its sentence gains "each member would bind `T` differently,
  and more than two such arguments are not split" where the cap is the reason.
- **D16963, a numeric list and its literal twin (`i32[] | K[]`).** Both members bind cleanly (`T = i32`,
  `T = K`) and share a box tag. The plan orders the narrower member first and dispatches on the
  content test (D16970's ruling: `is K[]` tests contents). An `i32`-stored list holding only `K`s
  takes the `K` instance, which writes only `K`s, so D16963's unsoundness (an `i32` written into a
  `K[]`) cannot arise. Its refusal is deleted.
- **D16970 / the in-arm view.** Independent. The split hands each instance the list as its own member
  type, so no view is needed. A cross-rep member (`u8[]` beside `K[]`) is tested by contents and
  handed at its own rep to its own instance.
- **Statically known member (backlogged in the ruling).** Not built. A combination whose member a
  narrowing already fixes at the call is left to the general dispatch.

## Scope of stage 1

- Closed unions at the call only: no type variable in the argument type. A call inside a generic
  body whose union is the instance's keeps today's behaviour.
- A grid of argument shapes (`string[] | i32[]`, `i32[] | K[]`, `u8[] | f64[]`, map pairs) ×
  callee results (scalar, `T`, `T[]`, `void` with a write through the list) × one and two split
  arguments, plus three-argument and record-union controls that keep the refusal.

## Costs to measure

- Instance growth: one instance per combination, at most `m1 × m2`.
- Fuel and seed size on the self-compile, which has no such calls today, so it should be flat.
- Late demands and late tag rows: the per-combination rows are new rows.

## As built (stage 1)

The split is a check-time lowering at the call, not a plan the emitter dispatches on. Where
`openArgTyParamRefused` would fire, `openArgSplitAt` (check_calls) rewrites the call node to

    { const $u0 = a0; const $u1 = a1; if $u1 is M1 { f($u0, $u1) } else if $u1 is M2 { … } else { __trap__() } }

with each written argument snapshotted once, in source order, at its checked type, and the call
re-checked. Narrowing binds `T` per arm; mono, elaboration and the join of the arms' results are
the existing machinery's. Named arguments keep their names; a filled default is not snapshotted.

Two things the design did not foresee:

- **D4928 refused every arm.** A list narrowed by `is` was read at the member but never delivered
  at it, even for `string[] | i32[]`, where the test is the box tag: an empty `i32[]` answers
  `is string[]` false at run time. `narFitElems` (check_leaf_steps) now leaves no elements-only
  entry for a declared member whose box tag differs from the test's (`listTagApart`: one-deep lists
  of distinct scalars among `i32`, `f64`, `string`, `i64`, `f32`, `u8`, `boolean`). The plain
  spelling `if q is string[] { g(q) }` now runs too.
- **D16963 keeps its refusal.** A twin's test reads the elements' values. In the soundness cell
  (`f<T>` calls `poke()`, which pushes `9` into the `i32[]` alias of the `K[]`-narrowed argument),
  delivering at `K[]` would read `9` as a `K`. D4928's rule refuses that delivery, so the split
  declines any union with a pair of members that is not tag-apart and keeps #9015's sentence
  (`tests/cases/soundness/error-union-of-twin-lists-callee-writes-alias.vl`).

Caps: at most two split arguments and at most eight member combinations; past either, #9015's
refusal stands. Maps, records and nested lists are not split.

Combination counts:

| population | split sites | combinations |
| --- | --- | --- |
| grid, 1 argument × 2 members (`str_i32`, `i32_str` × len/first/wrap/push; named, default, order, in-generic, loop, result join, nullable-narrowed) | 15 cells | 2 |
| grid, 1 argument × 3 members (`three`) | 1 | 3 |
| grid, 2 arguments × 2 members (`two__len`) | 1 | 4 |
| grid, 3 × 2 members (`cap6`) | 1 | 6 |
| grid, 3 × 3 members (`cap9`) | refused | 9 |
| grid, 3 arguments (`ctl_three`) | refused | — |
| grid, twins (`twin*`, `twin_alias_write`), 13 cells | refused | 2 |
| grid, `u8[] \| f64[]`, 4 cells | refused by `u8`'s own storage-type refusal in the `u8[]` arm | 2 |
| distilled corpus (9,032 modules) | 0: regress output identical with the split disabled | — |

Cost against master `e7861b6fd`, both sides fixpoint seeds on one box:

| | master | head | delta |
| --- | --- | --- | --- |
| L2 self-compile fuel | 97,646,420,625 | 97,642,747,273 | -3,673,352 (-0.004%) |
| seed bytes | 6,711,379 | 6,716,165 | +4,786 (+0.07%) |

The bytes are the nine new functions (`openArgSplitAt` 1,303, `openArgSplitArm` 1,044,
`openArgUnionArgs` 707, `rcwPendDrop` 645, `openArgSplitOrder` 406, the rest under 125 each).
A first cut cost +0.36% fuel, by ablation almost all of it `listTagApart` asked once per member
of every declared union an `is` narrows (the compiler's own `Node` and `Ty` unions): it is now asked
only of a member pair already found to be lists, inside `narFitElemsOf`. The refusal's loop runs
only when the split's own scan found a union argument, over the same normalized arguments.
