# D15654: a join of kept-maker calls is built where its arms are, 2026-11-11

Clause-1 close. Base is master `8b88b166`.

## What was wrong

`mk2` is kept at `J = { f: i32 | null }`, so each call hands over a `J`. The value join
`if k > 0 { mk2() } else { mk2() }` was checked at `{f: i32}`. An un-annotated binding of it took
its cell's row from that checked type (`letBindTy` then `repSlotOfKind`). The arms built a `J`.
With no declared `{f: i32}` row, the rung found nothing and fell through to the THEN arm's row,
`J`, so the program ran. With a declared row (`type K`, a parameter type, an annotated binding),
the binding was typed at that row and the module failed to validate.

Step 7's question was why `{f:i32}` and J's arm build differ at all. They are different canonical
types: `{f: i32}` stores `f` as `i32`, and `J` stores it as a boxed `i32 | null`. So two rows is
correct. The defect was the binding taking its checked type's row over its arms' build.

## The fix (emit-side, plus one checker landing)

- `litKeptJoinRep` (emit_elab.vl): a value `if`/`match` whose every tail's kept rep agrees is
  stamped as built there, the way a list literal of kept calls already is.
- `letJoinHeldTy` (emit_classify.vl): an un-annotated binding of a stamped join is held at the
  stamp, beside `letStoreHeldTy`.
- `recJoinLandingIn` (check_fit_rules.vl): `recLandingIn` follows a join of calls, so an annotated
  parameter the binding is handed to is instanced at the build (`recArgRepNote`), as it is for
  `const b = mk2()`. A join with a literal arm is excluded. That literal is built at the join's
  own record, and admitting it moved `if-join-of-kept-maker-calls-runs.vl` to an emit refusal.

## Graded

The repro, an unused `use(x: { f: i32 })`, `const z: { f: i32 }`, `match`, a block arm, the join
inside a function, `use(u)` and a written `let` all run. All but the last are in
`join-of-kept-maker-calls-beside-declared-row-runs.vl`. The no-row spelling still runs.
`if-join-of-kept-maker-calls-runs.vl` passes. Filed: [D15656](../inventory/D15656.md), a list
literal of the join's binding, broken on master with or without a declared row.

Gates: fixpoint ×2 (6,612,650 bytes, seed-size +0.4%), lint-self clean, rep-fuzz exact, late
demands 6, dead-export, render-parse and pin-helper budgets ok, cases_wasm, inventory tests,
witnesses 4704 as filed, scaling shape, probe rollback, fn-ret shadow. Distilled regress: no runs
lost. Two `d15317_d380*` cells move invalid wasm → loud check reject on master's seed as well.
