# D15975 PR 1: `===`/`!==` parse as operators and the checker applies the ruling, 2026-11-14

Lane E. The first of the three PRs in `2026-11-13-d15975-identity-design.md`: parser and checker.
The emitter (PR 2) and `==` on functions (PR 3) follow.

## What changed

- **Lexer.** `===` and `!==` lex as one `EQ`/`NE` token with three-character text, so they bind
  at equality's precedence. There is no new token kind, so the exhaustive token ladders are
  untouched.
- **Parser.** `strictEqTail` and its JavaScript-reflex diagnostic are deleted; the `BinExpr`
  op is the text the user wrote, and `fmt` reprints it.
- **Checker** (`compiler/check_identity.vl`, dispatched from `checkBinExprNodeReal` before the
  operator rules):
  - An operand with no identity (a scalar, `string`, a literal, or a union with any arm that is
    not a record) is refused at the operator: "`===` compares identity, and `i32` has none —
    use `==`". It keeps the `strict-equality` code, so `check --fix` still writes `==`.
  - Operands no value can share (neither assignable to the other, or mixed brands) are refused
    as `==` refuses them: "cannot compare P and Q".
  - Every accepted compare (records, lists, maps, functions, a nullable of one, a union of
    records, `null`, a type parameter) passes `vl check`.
- **Emitter: the bridge.** `emitBinExprNode` refuses `===`/`!==` at the compare with one
  `emitFailAt`, "emitProgram: reference identity (`===` / `!==`) is not lowered yet". It goes
  through the counted channel: `emit-refusal-sites` sees it, it has a `live-sites.json` row
  (D15975), and the probe `scripts/capability-probes/identity-eq-record.vl` reaches it.
  `===` is a parse error on master, so nothing regresses. Per the orchestrator, this refusal
  is a bridge only: PR 2 (the lowering) is lane E's next PR, and it deletes this site and adds
  the `x === null` hint and narrowing.

## Measured

- **Witness.** `check-filed-witnesses --strict`: D15975 is `emit_reject`, as filed. The row's
  status and repro now name the emit refusal.
- **Position matrices.** All six `identity-eq-*` matrices: 0 `runs → not-runs`, 0 silent, 0
  program traps. Every cell is still refused, now by the emitter's bridge site.
- **Tests.**
  - The DV-1214 parser case moves to
    `tests/cases/operators/error-identity-eq-no-identity.vl` with the ruled message.
  - `error-identity-eq-operands.vl` is new.
  - The `check --fix` case keeps its output and is renamed.
- **Sites.** `emit-refusal-sites`: +1 call site (the bridge). `--live-sites`: 2 of 2 LIVE.
- **Sweep.** SWEEP.
