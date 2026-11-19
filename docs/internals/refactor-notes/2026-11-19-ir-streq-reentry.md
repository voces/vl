# The `strEqTail` re-entry: the IR owns a string compare's literal (2026-11-19)

One of §10.1(a)'s `emitExpr` re-entries (`ir-design-2026-11.md`): a claimed string `==`/`!=`
reached legacy's `strEqTail`, whose `emitStrEqLit` wrote the quoted literal through
`emitStrValue`, and so through `emitExpr`, inside an IR function.

## Shape
The seam template (`2026-11-19-ir-seam-frame-model.md`): split around the operand, no callbacks.
- `strEqLitForm(lit)` decides the form:
  - 0: the core over the pushed literal;
  - 1: an empty literal, a length test alone;
  - 2: a short literal compared in place;
  - 3: the `__str_eq__` call under the length test.
- `strEqLitHead` writes everything before the literal; for forms 1 and 2 that is the whole
  compare. `strEqLitTail` writes everything after it. `strEqNegTail` is `!=`'s `eqz`.
- Legacy's `emitStrEqLit` is the head, its own `emitStrValue(lit)` for forms 0 and 3, then the
  tail. Its other callers (the literal-union towers) keep calling it unchanged.
- The IR builder makes the literal the compare's second operand (an `OStr`, written by
  `emitStrLitAt` as every IR literal is). `lowerStr` writes it between the head and the tail
  for forms 0 and 3, and consumes it unwritten for 1 and 2.
- A literal typed as an atom, which legacy widens through `emitAtomToStr`, stays a builder miss,
  so legacy keeps it.
- `emitEqNonNullCore`, the non-literal compare, decides from the AST and writes no operand. The
  IR calls it directly, without `strEqTail`.

## Measured
- The self-compile is identical to master's (93c5fe0f1, both seeds at fixpoint).
- Every `tests/cases` program not `@error` plus every capability probe, master seed vs this one:
  identical 7512, fail under both 68, differ 0.
- `ir-identity.sh --cases` (claiming on vs off on this tree): identical 7512, differ 0.
- `REENTRY=strEqTail scripts/ir-driver-census.sh`, tagging only this re-entry:
  - master: 119 driver functions reached (2,129 lines), 4 of them (73 lines) left only by a claim;
  - this tree: 0 reached.
- L2 self-compile fuel, same box: 99,484,096,211 on master, 99,498,777,286 here (+0.015%).
