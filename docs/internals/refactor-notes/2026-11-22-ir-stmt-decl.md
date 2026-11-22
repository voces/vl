# IR: body-scope declarations and discarded values as statements, 2026-11-22

Lane IR-N4. `stmtNode` refused every statement its arms did not name (`statement`). A census by
source position over the tests/cases programs holding the class split it in two:

- 42 of 65 statements are a body-scope `type` (or `flat type`) or union declaration. The parser
  hoists it to the program's, and legacy's `emitStmt` writes nothing for it. The IR now does the
  same.
- 23 are a discarded value outside the six node kinds the IR named (a string or `null`
  literal, a record or list literal, a member, an optional member, an index call). Legacy
  evaluates and drops any statement `stmtIsTailValue` accepts. The IR now asks that same
  predicate, so no condition is restated.

On those 21 programs, `statement` falls 56 → 0 and `none` rises 46. The rest moved to misses
inside the value (`expression null` 3, `expression optional member` 1, `rep ?` 1,
`store element` 1), and to the switch rows #9576 closes. Covered = matched throughout.

The shadow row is `tests/ir-shadow-rows/body-type-decl-and-discarded-value.vl`.
