# `rep novalue`, step 7: a call that never returns, as a value (IR-C1)

The coordinator ruled on 2026-11-23 (DECISIONS.md) that these functions are built, not left to
legacy. A direct call checked `never` (`exprAtPre`, for a Call or BinExpr with no rep of its own) is
built at i32, legacy's rep for `never`. Its RCall temp lowers as `call; unreachable`, and the IR then
writes the consumer as it writes any i32. A typed binding widens it: `const y: f64 = fail()` is
`call; unreachable; f64.convert_i32_s`. An operator with a `never` operand is built only beside an
i32 one, as i32, or as bool for a comparison. Legacy converts an operand of another width, or does
not convert it at all (D17064), so that case is the named miss `never operator over a non-i32
operand`.

Verifier: rule 3 admits a temp's rep only where its checker type has no value
(`repNodeOfTy(vTy)`) and its defining Rhs is a never RCall (`neverCallTemp`). Rule 6 admits the
result rep only for a never call of a callee with no result. New self-tests:
`never-call-value-at-consumer-rep` (holds), `returning-call-temp-typed-never` (rule 3) and
`never-call-value-into-bool` (rule 2 at that consumer). A wrong expectation turned the suite red.

## Legacy tails the IR calls

None.

## Readings (base f812b3da9, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7682, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14033, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45406 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`, corpus and `--cases`) | 0 order rows, base and head |
| R7, deep nesting, margin | 359 ok; 5 ok; fail 896 KB / pass 900 KB on both |
| `gate.sh --fast`, `lint-self.sh`, `deno lint` | passed; clean; clean |
| L2 self-compile fuel per PR | +0.16% on 117,543,306,349 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| tests/cases `rep novalue` (mode 4 blockers) | 16 → 1 function |
| tests/cases claimed functions | 71,606 → 71,608 (`fnc` rows, 0 lost) |

## The 9 programs the ruling named

| program | before | after |
| --- | --- | --- |
| `never-operand-ends-the-path-runs.vl` `d` (`fail() < 2`) | rep novalue | claimed, matched |
| `never-operand-ends-the-path-runs.vl` `a`, `b` (`f() + 1` over a global closure) | rep novalue | `call of a non-declaration` |
| `never-call-ends-path.vl` `a` (`const z: i32 = die()`) | rep novalue | claimed, matched |
| `null-only-type-param-binds-never.vl` (2 instances) | rep novalue | `method f` |
| `hole-guarded-call-through-null-*.vl` (2) | rep novalue | `call of a non-declaration` |
| `nullable-alias-app-type-param-binds.vl` `show$3` | rep novalue | rep novalue: `print(v.v)`, a `never` field read |

Shadow rows: `tests/ir-shadow-rows/never-call-as-value.vl` (6 shapes covered = matched) and
`never-operand-beside-a-wide-one.vl` (the non-i32 siblings and D17064 stay named misses).
