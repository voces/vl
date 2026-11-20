# IR: a staged literal at a literal-union parameter (2026-11-20, lane IR5)

#9289 lifted `irBStageLeads`'s `OStr` refusal so a literal lead stages below a valued `if`. A
literal delivered to a literal-union parameter is built as the atom's id (its `OStr` at the atom
rep); staging made it a temp at that rep but at its node's string type, and the verifier's rule
3 (a variable's rep is its type's) refused the function: the self-compile's `encArms`
(`ir_helper.vl`, `test("lt", cp, i32(if … else if …))`) was covered but not verified, so it fell
back to legacy (covered 19,019 vs matched 19,018 at de317fa).

## The change

`stageTyOf` (`ir_build.vl`): a staged operand's type is its node's, or for a literal built at
another rep, its delivery type (`ctxTyAt`) when that is the rep it was built at; a literal at
neither misses as `staged literal type` rather than reaching the verifier.

## Witness

`tests/cases/literal-unions/atom-param-literal-lead-valued-if.vl`: `g`'s `t("lt", if …)` fails
rule 3 under the merge-base seed and is covered, verified and matched after.
