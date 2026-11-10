# An `if` or `match` arm calling a kept maker is refused at its own type, 2026-11-10

D15653 closes as the owed check reject, the refusal `??` already gets (D15380). D15654 is filed
for a join whose every arm is the kept call, beside a declared `{f: i32}` row. That join is still
invalid wasm, as it was on master.

**The gap.** `const dA: J = mk2()` keeps `mk2` at `J`. A join arm that reads a binding was queued
as a delivery (`adoptArmAt` → `recPend`), so `if … { { f: 4 } } else { q }` was already refused.
A call arm was never queued, so `recKeptConflicts` never asked it. The join was typed
`{f: i32}`, and the arm handed over a `J`.

**The change.**

- check_fit_rules.vl:
  - `adoptJoinArmAt`, the `if` and `match` arms' entry (check_node_rules.vl, check_match.vl),
    queues a call leaf stored as the join as an own-storage delivery (`recOwnPend`). `recPend`
    cannot do it: it drops a pair whose two types are the same index, which is the case when the
    call is in the first arm. A list literal's element keeps `adoptArmAt`: queuing its call part
    turned 12 running fixtures (D15372's list parts) into refusals.
  - `recArmLandsAt` says when a call leaf is built at the kept record and not at its own type.
    Either the join is delivered whole there (its context type, `const b: J = if …`), or it is
    assigned into a binding built there (`z = if …` after `let z = mk2()`, D15280's fixture), or every
    leaf of the join is a call of a maker kept there (`recCallKeptAt`, through
    `recHandOnMakerOf`).
- check_program.vl: `recKeptConflicts` spares such a leaf, in both the kept arm and the relay
  arm.

The exemption takes only a call. A bound read in a join delivered at `J` (`const q = mk2()`,
then `const b: J = if … { { f: 4 } } else { q }`) keeps master's refusal. Exempting it too
turned that program into an emit error.

**Graded** (master `e7ebdb52` → now):

| spelling | master | now |
| --- | --- | --- |
| the repro, the call in the else arm | invalid wasm | check reject |
| the call in the then arm | invalid wasm | check reject |
| the arm a relay `mk4()` | invalid wasm | check reject |
| a `match` arm | invalid wasm | check reject |
| the join inside a function | invalid wasm | check reject |
| the arm a binding holding `{ f: 4 }`, read later | invalid wasm | check reject |
| the arm a bound read of `mk2()` | check reject | check reject |
| `const b: J = if … { { f: 4 } } else { mk2() }` | runs | runs |
| `let z = mk2()`, then `z = if … { { f: 4 } } else { mk2() }` | runs | runs |
| both arms `mk2()`, or both `mk4()` | runs | runs |
| `{ f: null }` beside `mk2()` (the join is `J`) | runs | runs |
| a maker no binding keeps | runs | runs |
| `[{ f: 4 }, mk2()]` | runs | runs |
| both arms `mk2()` beside a declared `{f: i32}` (D15654) | invalid wasm | invalid wasm |

**Proof run locally.**
- refresh ×2 (fixpoint)
- lint-self, rep-fuzz, seed size, late demands (6)
- dead-export, render-parse and pin-helper budgets
- cases_wasm, inventory refs/rows, scaling shape, probe rollback, fn-ret shadow
- check-filed-witnesses `--strict` on both inventories
- distilled regress
