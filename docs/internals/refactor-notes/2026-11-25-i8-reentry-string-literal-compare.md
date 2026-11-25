# I8 re-entry: a string-literal compare writes its literal itself (2026-11-25)

Lane COV-CALL. INFRA's dress rehearsal (#10096) listed 37 programs whose first stub was
`reentry emitStrValue` (35 of them unexplained): 25 cases and 12 witnesses, mostly literal
unions, narrowing and `is` over lists.

## Mechanism

Many kept legacy tails the IR asks compare a string against a literal through `emitStrEqLit`,
often with a literal they mint (`mkStr(quoteLex(…))`): a list's `is` over a literal union, a record
arm told by a literal field, and `as!` / `as?` to a literal arm. `emitStrEqLit` wrote that literal
through `emitStrValue`, whose `emitExpr` is a re-entry under the sweep.

For a `StrLit` that is no atom (`exprIsLitAtom`) and that no pre-path arm takes
(`exprPrePathWhy == ""`), `emitExpr` reaches its literal arm, `emitStrLitAt`, and nothing else.
`emitStrLitValue` writes exactly that and keeps `emitStrValue` for every other literal.

## Proof

- **I8 sweep, before:** with master's swept compiler, 5 of 6 sampled programs from INFRA's list
  refuse with `i8 reentry emitStrValue`.
- **I8 sweep, after:** `ir-i8-sweep.sh scripts/ir-i8-census/keep` over all populations (12,700
  distilled, 9,447 cases, 282 probes, 5,122 witnesses) has no program whose first stub is
  `reentry emitStrValue`, and the self-compile is at a fixpoint (step 2).
- **Q58 sweep:** `tests/cases/literal-unions/string-literal-test-positions.vl` covers a list's
  `is` returned, as a condition, as an argument and in a lambda; a record arm told by its literal
  field; `as!` and `as?` to a literal arm; and module scope. Master's swept compiler refuses it on
  `reentry emitStrValue`, and this change's builds and runs it.
- **Byte identity:** the counts are in the PR body.
