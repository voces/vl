# IR: nodes written after the check take their type, and a switchable chain stays legacy's (2026-11-19, lane DEAD)

`rep ?` blocked 198 self-compile functions and 176 corpus functions alone on master 5c0fd9a6f.
`?` is `repWhat` of no rep node at all: the expression has no recorded type. Instrumenting the
miss with the node kind gives two mechanisms, each a node written after the check:

| where | node | functions | what writes it |
|---|---|---:|---|
| self-compile | `==` (109), `\|\|` (83) | 192 | the `match` lowering's arm tests (`check_match.vl`, `mkBinary("==", …)` joined by `\|\|`) |
| corpus | `Call` | 169 | a generic instance rewriting an operator to its overload (the d532 grid: `a ^ b` over `T`, calling `"^"` on a record) |

## What landed

- **`exprTyOf` / `exprRepOf`** in `ir_build.vl`:
  - an untyped compare or logical operator (`untypedBoolOp`) is `boolean`;
  - an untyped call of a declaration takes its callee's result type (`resultTy`), resolved as
    `callRhs` resolves the callee;
  - everything else is `nodeTyAt`, as before.

  `irBExprAt`'s rep, `irBLetTemp`'s temp type and `shortCircuit`'s local read them.
- **A statement `if` chain stays legacy's at a link that may lower to a `br_table`**
  (`intSwitchMayLower`, wasmEmit's export of `intMatchHeadAt`; the miss is `if switch`). Before
  this step those chains were blocked by `rep ?`. Once their arm tests had a rep, the IR built
  a dense integer `match` as an if-chain where legacy writes one `br_table`. `ir-identity.sh
  --cases` caught that in `tests/cases/match/int-br-table.vl`; the armed shadow did not, because
  no distilled cell held the shape. `emitIntSwitch` may still decline (a sparse set), so the IR
  leaves every such link to legacy, as its tail and expression paths already did (`tail if
  switch`, `ifExprPlainKind`).
- **The `irbrt` named set** (`distilled/named/irbrt_{stmt,loop,early}.vl`): the three shapes
  that diverged. Each is `runs`. On the build before the guard each shows `mismatch bytes`
  under the armed shadow; on this one, `uncovered if switch`. So every IR step's shadow sweep
  sees the class.
- **#9131's review nits:** `AsCastArm` and `AsWrapArm` gain a named `notCast` arm for a node that
  is no cast (it was `union` / `unionFloor`), and `numCastKindTy`'s comment says -1 for any
  other kind.

## Coverage

| reading | master 5c0fd9a6f | this step | gained |
|---|---:|---:|---:|
| corpus functions covered = matched (`ir-shadow.vl`, 45,678) | 31,176 | 31,345 | +169 |
| `rep ?` alone, corpus blocker census | 176 | 0 | |
| self-compile functions with no blocker | 12,774 | 12,933 | +159 |
| `rep ?` alone, self-compile | 198 | 3 | |
| self-compile functions the shipped claim emits (`$VL_IR_SHADOW=5`) | 12,774 | 12,933 | +159 |

That is +51 net compiler lines (+63 −12). No legacy line is deleted or moved to `@ir`; this is a
coverage step.

## Bars

| bar | reading |
|---|---|
| `ir-identity.sh` plain, master seed against this one | 9,034 identical, 3,267 fail under both, 0 differ; self-compile identical |
| `--names` | 9,037 identical, 0 differ; self-compile identical |
| `--cases` | 7,512 identical, 68 fail under both, 0 differ |
| mode 3 over the corpus | 9,037 identical, 0 differ; self-compile identical |
| armed shadow | 31,345 covered = verified = matched; `ir-shadow: ok`; `--claims` ok |
| seed fixpoint | a second refresh is byte-identical |
| `regress.vl` | 0 runs → not-runs, 0 → silent, of 260,828 |
| L2 fuel | +0.8% on its baseline |
| seed size | +0.7% on its baseline |
| late demands | 9, baseline 9; late tag rows 307, baseline 307 |
| lint-self, phase-state, ladder-sets | clean; ok; 58 sets |
