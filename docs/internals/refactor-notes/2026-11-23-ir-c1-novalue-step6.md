# `rep novalue`, step 6: a never `??` default in the last three null-arm builders (IR-C1)

#9623's `coalNeverDefault` builds a never-call default as that call's statement in six coalesce
builders. Three more write a default into a null arm and never reached it: `coalNulStr` (a plain
`string | null`; its atom arm keeps its decode), `coalBoxStash` and `coalBoxFieldScalar`. Each now
calls the helper, and its out is minted after the default, as before. No new admission predicate.

## Legacy tails the IR calls

None.

## Readings (base f3f248cd4 = master with #9623, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7678, fail under both 68, differ 0; witnesses same 63, differ 0 |
| `ir-identity.sh --claimless` | identical 14031, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45373 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`, corpus and `--cases`) | 0 order rows, base and head |
| R7, deep nesting, margin | 352 ok; 5 ok; fail 896 KB / pass 900 KB on both |
| `gate.sh --fast`, `lint-self.sh` | passed; clean |
| L2 self-compile fuel per PR | +0.01% on 117,173,405,327 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| tests/cases `rep novalue` (mode 4 blockers) | 16 → 9 functions |
| tests/cases claimed functions | 71,312 → 71,316, starts 6,471 → 6,471 (`fnc` rows 71,320 → 71,326, 0 lost) |

Witness: `tests/cases/functions/never-default-in-coalesce-builders.vl` (a `string | null`, a shared
field, a shared binding's cell, each read present).

## What `rep novalue` still holds (9 functions)

Each one is a never call used as a value, after which legacy writes the consumer's dead code:
`f() + 1` is `call; unreachable; i32.const 1; i32.add; return`. These are 3 operators in
`never-operand-ends-the-path-runs.vl`, `const z: i32 = die()`, and 5 instances whose type parameter
binds `never`. A map read with a never default (`m.get(k) ?? fail()`) writes `call; unreachable`
in place in its valued `if` and has the same need. To match these bytes, the IR has to build a never
call as a value at the rep its consumer takes, and verifier rule 3 has to admit it.
