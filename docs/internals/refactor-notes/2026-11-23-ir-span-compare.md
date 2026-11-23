# IR: an element read's row after a staged operand, 2026-11-23

Lane IR-N4. Base: master d6341e57c. A shadow false positive, not a codegen change: the module's
bytes were identical, and the read-index rows were not.

## Change

When a list literal led by a valued `if` is read as the right operand after a call,
`f(1) + [if c { 20 } else { 0 }][0]`, legacy's `emitIndexBanked` banks the read's row from the
receiver's first byte. The lowering noted the row's start (`rowOpenNote`) when the body walk
reached the opening node, and `stageLead` then wrote the earlier operand, `call f(1)`, below the
`if`. So the IR's row began four bytes early. The opening node is either the `SIf`, or a pending
`SLet` whose temp is written later.

- `valuedIfOpen` notes the row's start again after `stageLead`. When the `if` opens the row, every
  staged lead is an earlier operand, since a lead inside the receiver would open it instead.
- `lwRowOpenTemp` maps a row-opening `SLet`'s temp to its node. `tempOpenNote` notes the start
  where that temp is written, in `irLOpnd` and `stageRoot`.

No new predicate. No legacy tail is newly called.

## Legacy tails the IR calls

- None new.

## Witnesses (master seed, then this branch)

| spelling | master | branch |
| --- | --- | --- |
| `print(f(1) + [if c { 20 } else { 0 }][0])` at start (D17060) | start mismatch | matched |
| the same at a `const` initializer | start mismatch | matched |
| `f(1) * f(3) + [...]` | start mismatch | matched |
| a lead inside the receiver, `f(1) + [f(2), if c { 20 } else { 0 }][1]` | start mismatch | matched |
| either in a function's `return` | claim-fail row | matched |
| `tests/cases/modules/if-expression-arm-merge/entry.vl` @start | start mismatch (baseline row) | matched |

`tests/ir-shadow-rows/index-row-after-staged-operand.vl` holds three of them.

## Readings

Fixpoint seeds on both sides, master d6341e57c against this branch:

- Armed shadow over tests/cases: start matched 6662 → 6663 of 6663 covered; functions 71906
  covered, 71905 matched, the same on both. The fail-row diff is the one read-index row.
- Self-compile: 20232 covered, matched and claimed on both. Modes 1, 3 and 5 build the same
  bytes as the plain build, and the same bytes as master's.
- `ir-identity --names`: identical 9037, fail under both 3267, differ 0; self-compile identical.
  `--claimless`: identical 14034, differ 0. `--cases`: differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7401, differ 0.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- Fuel: L2 +0.02% on the base master's 118897695627.
- The tests/cases shadow baseline loses `mismatch start spans: read index`. The same write drops
  seven rows master's own seed already reads below the baseline.
