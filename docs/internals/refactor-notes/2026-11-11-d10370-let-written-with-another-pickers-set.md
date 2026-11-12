# D10370: a `let` written with another picker's set decides its initialiser's subset with it, 2026-11-11

Clause-2 close of the one row `scripts/capability-probes/live-sites.json` listed. The list may not
be empty (`tests/vl_live_sites_test.ts`), and the literal is still reached: D15700 (a hole handed
on in a `const` record) is its row now, with the probe
`hole-handed-on-in-const-record-called-at-two-types.vl`. Base is master `5613f704`.

## What was wrong

`let k = pick(5); k = pick3(1)` called at two types. The reads of `k` are typed at the join of
every set written to it (`elabFnLetTy`), here `{id, third, same}`. The check's tag decision
tried that join and refused the `let` node: its initialiser `pick(5)` carries `{id, same}`, and a
subset was admitted only through a read (`ftSubsetRead` took an `Ident`). The wide `let` was then
vetoed back to its initialiser's set, which refused the store of `pick3(1)`, and the binding
stayed a closure called at two types.

## The change

`ftSubsetRead` (check_fn_tag.vl) takes a call whose set's members are all the join's, and pushes
that set onto `ftSubNeed`, so `{id, same}` is decided with the join. A tagged id is its member's
declaration in every set, so the id the call returns is the join's.

## Graded

A scratch grid of 324 programs: the binding's picker {two, three, disjoint two} × the write
{the same picker, wider, disjoint, overlapping, a function by name} × three call patterns × top
level or inside a function × three write arguments. Master 192 run; this change 324, 0 runs →
not-runs, 0 silent. The 1,728, 2,220 and 768 fn-value grids: no cell moves. Every `@run` case
under `tests/cases`: no output changes except the new fixture.

**Proof run locally.** refresh, the witness and fixture, `capability-probes.vl --live-sites`
(1 of 1, D15700), `tests/vl_live_sites_test.ts`, the corpus oracle (`cases_wasm_0..3`),
`check-filed-witnesses --strict` (D10370 moved), distilled `regress.vl`, lint-self, budgets, seed
size, late demands.
