# D16006(a): a covering test's dead arm reads its operand as `never`

**Ruling** (owner, 2026-11-14): the dead arm narrows the tested operand to `never`, a true bottom
(every use checks), and the arm gets a warning. Making a use an error was not taken.

**Mechanism.** `subtractTy` answers -1 for both "nothing removed" and "nothing remains". The new
`subtractLeavesNothing` (`check_relate_core.vl`) names the second case. The else-narrow
collector uses it at the `is` complement and the `==` complement over a closed operand, and pushes
`never`. `match`'s `_` arm gets it from the same collector, run over each earlier pattern.

* **Bottom.** An operator over a `never` operand is `never` (`check_operators.vl`), and so is a
  member read (`check_access.vl`). The never-slot refusals (an un-annotated binding, a record
  field, a list element) stand down inside a dead arm (`inDeadArm`).
* **Warning.** `checkIfHead` raises `recordDeadTest` at the dead arm: "this `else` can never run
  (`p` is always `i32`)", or "this branch can never run (…)" for the then arm under `!`. `match`
  raises "this `_` arm can never run (every member of `T` is already matched)".
* **Emit.** The dead arm is recorded (`deadArmNote`, `check_side_rows.vl`), and the emitter neither
  collects its locals nor emits it (`collectLocalsIf`, `emitIfLinkStmt`). An expression a dead
  `never` read feeds lowers to `unreachable` (`exprReadsDeadNever`). A call that is itself
  `never` (a function that does not return) is still emitted.
* **Scope.** No narrowing to `never` inside an instance's re-check (`elabCapLive`). An arm dead
  at one pin is live at another, and D932's static guard already folds it at emit. A post-guard
  `never` residue is not applied past the `if` (`ifTailApplyGuards`): an exhaustive chain's
  fall-through stays `ifChainExhausts`'s.
* **Hover** shows `never` for the operand in the dead arm (`tests/lsp_wasm_checker_test.ts`).

**Matrix** (master → now; every "now" case also carries the warning):

| position | master | now |
| --- | --- | --- |
| `if p is i32 {…} else { p + "!" }`, `p: i32` | refused | `5` |
| `else { print(p) }` | `5`, no warning | `5` |
| `else if` chain ending in a dead `else` | refused | `5 s!` |
| nested arm; `needS(p)`; `return p` into `string`; `p.length` | refused | run |
| `{ x: p }`, `const q = p * 2` in the arm | `5` | `5` |
| `==` over `K = "a"`, `else { k + 1 }` | refused | `1` |
| `!(p is i32) { p + "!" }` | refused | `5` |
| `match` `_` after every member | `5`, no warning | `5` |
| another name in the arm (`q + "!"`) | refused | refused |
| live arm (`p: i32 \| string`) | runs | unchanged, no warning |
| lambda in the arm reading `p`, result used | `5` | refused — D16092 |

29 existing run cells now carry the warning, many over a local the checker flow-narrowed to one
member (`const x: i32 | string = 5; if x is i32 … else …`). Each declares it with `@warning`.
