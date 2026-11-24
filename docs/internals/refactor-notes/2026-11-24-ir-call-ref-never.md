# IR: a function-value call whose result is never, 2026-11-24

Lane IR-N4. Base: master 86dd7914, which holds #9801 (batch 2). Batch 3 of
`call of a non-declaration`, the last: `callRefPlainKey`'s `callEndsNever` refusal.

## Change

- `RCallRef` carries `crNever`, set from `callEndsNever(ix)` at both constructions (`closureCallAt`
  and `capturedCallRhs`).
- `callRef` lowering refuses the tail form under `crNever` and writes `unreachable` after
  `call_indirect`, as `emitCall` follows `emitCallCore`. The statement tail site and `callReturns`
  refuse it too.
- `irNodeEndsPath` returns `crNever`. The verifier's never-temp admission (`neverCallTemp`) admits an
  `RCallRef` temp under `crNever`. In value position a closure call already takes `irBLetTemp`, the
  route `RCall`'s `caNever` takes.
- A call statement through a member or expression callee keeps no never flag
  (`stmtCallRefNever`): legacy's statement ladder writes it through `emitCallRef` directly, not
  `emitCall`, so no `unreachable` follows it. A named callee's statement goes through `emitCall`
  (`emitCallStmtIdent`) and keeps it.
- `callRefPlainKey` drops its `callEndsNever` refusal. `cloTailRefusal` stays: that is legacy's own
  `emitFail` (D2878).

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `callEndsNever` (existing) | `emitCall`'s `unreachable` after `emitCallCore` |
| `stmtCallRefNever` | `emitCallStmt`'s member and expression-callee arms, which call `emitCallRef` |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/closure-call-never.vl` puts the never call in each position the four
tests/cases programs use: a named, field and index statement, an operand, an `if` arm, a `return`
and a field call's value. All 8 functions and the start match. The base seed misses the 4 named
ones (statement, operand, arm, return). Both print `1 2 3 4 arm! 6 7`, and the bytes are
identical. Named calls and value positions write `call_indirect` then `unreachable`; a field or
index statement writes no `unreachable`, as legacy does. A program that reaches the never call
(`const t0: () => never = __trap__`, then `t0()`, and an operand position) exits 1 with the same
`unreachable` trap under both seeds. Self-tests `never-closure-call-value-at-consumer-rep`
(admitted) and `returning-closure-call-temp-typed-never` (rule 3) pin the verifier admission.

Q58 position sweep (`tests/cases/closures/never-function-value-call-positions.vl`, with the
shadow row `closure-call-never-positions.vl`): 9 positions. A never value in a record field or an
un-annotated binding is a check refusal, so those two do not apply. On the base all 9 miss on
`call of a non-declaration`. On the branch, 6 match: scalar argument, nested argument, `return`,
annotated `const`, `if` arm and `??` operand. 3 are declined at a named miss and written by legacy:
the union-parameter argument (`box ladder`), the concat operand (`string operand coercion`) and the
interpolation hole (`box ladder`). Mode 6 reads 0 order rows, and the claimless build is identical.

Fixpoint seeds on both sides, master 86dd7914 against this branch, `VL_STD` the tree's:

| class (tests/cases census, rows summed) | master | branch |
| --- | ---: | ---: |
| call of a non-declaration, functions | 19 | 15 |
| start: call of a non-declaration | 6 | 5 |
| tests/cases armed functions matched | 79431 | 79435 |
| tests/cases armed starts matched | 7036 | 7037 |

`never-result.vl`, `never-paths-end.vl`, `never-operand-ends-the-path-runs.vl` and
`checker-special-intrinsic-as-value.vl`'s start leave the class and match fully.

The class closes here. The rest is released by name: `cloTailRefusal` (legacy's own `emitFail`,
D2878), a hole parameter at `i32` (rides with `open parameter type`), the nullable variant arm
(`RArmUnbox` at a call argument), the user-function route or bundle, the top-level lambda bundle,
and the nullable niche parameter.

Checks:
- No program's covered count fell (per-program `blockers none`, master against branch: 0).
- Self-compile: 20496 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes.
- `ir-identity --names`: identical 9433, fail under both 3267, differ 0, built under one only 0;
  self-compile identical. `--claimless`: identical 14453, fail under both 3267, differ 0.
  `--cases`: identical 7755, fail under both 68, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7468, fail under both 67, differ 0; the moved list is empty.
- Armed shadow: 0 fail or mismatch rows on both. `--claims`: `ir-shadow: ok`.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900.
- Fuel: L2 124967912270 against master's 124967418654 (per PR -0.01% on base 86dd7914).
- Late demands 9/9; late tag rows 307/307. Seed size +0.4% on its baseline.
