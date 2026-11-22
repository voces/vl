# `rep novalue`, step 2: a binding's never arm (IR-C1)

`letIfArmBody` (a nullable or value-union binding's arm, legacy's `emitNulArmToLocal`) and
`letIfSinkBody` (the union binding sink's arm, `emitUnionArmToPair`) take a never-call arm value
as that call's statement. The arm must leave (`irBodyLeaves`), and the miss is named `declaration if
never arm`. This is step 1's shape (`refIfArm`, #9587). It matches legacy only because #9596
stopped legacy writing a dead store after the arm's `unreachable`. No new predicate: the route reads
`callIsNever`.

## Readings (base e9abb848 = master 146cb943 + #9596 + #9587, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| armed shadow over the class's 41 tests/cases programs | 560 covered = 560 matched (master 523; with #9587 alone 543) |
| `ir-identity.sh --cases` | identical 7626, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45231 covered = verified = matched |
| `ir-shadow.vl --claims` | 45229 corpus, 19532 over 4982 filed witnesses; no fallback |
| ci-native (`tests/selfhost_native_*_test.ts tests/vl_*_test.ts`) | 2315 passed, 0 failed, 39 ignored |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) and `lint-self.sh` | passed |
| L2 self-compile fuel per PR | +0.01% on 112357937363 |
| tests/cases claimed (`fnc` rows) | 69143 → 69163 (+20, 0 lost) |

## What `rep novalue` still holds (33 over the class's programs)

- 17 never calls under a binary: 10 are D16023's capture-box `cell ?? __trap__()`, the rest other `??` defaults. The next step adds one helper across the coalesce builders.
- 8 return positions. The IR already writes legacy's dead bare `return` after a returned `__trap__`, and the next step widens that case to every never call.
- 4 in list-union arm builders, 3 call arguments, 1 `let` and 1 member read.
