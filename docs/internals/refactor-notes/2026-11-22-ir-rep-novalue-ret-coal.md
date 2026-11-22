# `rep novalue`, steps 3 and 4: a returned never call and a never `??` default (IR-C1)

**Step 3, return.** Legacy writes `call; unreachable; return` for `return fail()`, and the IR
already wrote that dead bare return after a returned `__trap__`. The case now takes any call
`callIsNever` names (built by `stmtNode`, so a trap still reaches `trapStmt`). A call that does not
end its path (a closure call, whose never-ness `RCallRef` does not carry) is the named miss
`returned never call`. Verifier rule 5's dead-return exemption reads the same query.

**Step 4, `??`.** `coalNeverDefault`, at the default of all six coalesce builders (`coalPopOr`,
`coalBox`, `coalField`, `coalOptLeafBuild`, `coalNulRef`, `coalNicheCell`), builds a default
that never returns as the null arm's statement and stores nothing into the out. At a wider number
legacy writes a dead widening after the `unreachable` (`f64.convert_i32_s`), so that is the named
miss `coalesce never default widened`. A later legacy-only change that drops the dead widening is
the shape that closes it. Rule 5's `exits()` counts a never call as leaving, which an arm left
unwritten needs.

**Shared query.** `irNodeEndsPath` (ir.vl) is an `STrap`, or the effect of an `RCall` with
`caNever` or an `RCallHost` with `chNever`, both set from legacy's `callEndsNever`. It is an
exhaustive match over `Rhs`. Verifier self-test cases 25 to 28 pin it: a returning call's effect
leaves neither a dead return (25) nor an unwritten `??` out (26) valid, and a never call's does
(27, 28).

## Per class (the class's 41 tests/cases programs, armed shadow, measured after each step)

| class | before | after |
| --- | ---: | ---: |
| return position (step 3) | `rep novalue` 33, covered = matched 560 | `rep novalue` 28, covered = matched 564 |
| `??` default (step 4) | `rep novalue` 28, covered = matched 564 | `rep novalue` 14, covered = matched 574, plus 1 `coalesce never default widened` |

## Readings (base 26e961da = #9606's head, fixpoint seeds on both sides, head 5002c817)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7627, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45231 covered = verified = matched |
| `ir-shadow.vl --claims` | 45229 corpus, 19534 over 4982 filed witnesses; no fallback |
| ci-native | 2315 passed, 0 failed, 39 ignored |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED |
| L2 self-compile fuel per PR | +0.07% on 112364979426 |
| tests/cases claimed (`fnc` rows) | 69164 → 69182 (+18, 0 lost) |
