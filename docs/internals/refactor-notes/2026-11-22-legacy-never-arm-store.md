# Legacy writes no store after a never binding arm (IR-C1)

`emitNulArmToLocal` (a nullable or value-union binding's arm) and `emitUnionArmToPair` (the union
binding sink's arm) wrote their store, `local.set idx` or `unionBoxToPairTail`, after an arm value
whose call never returns. After the `unreachable` the stack is polymorphic, so the store is dead and
the arm's block needs no value. Both now write the call alone when `callIsNever` says so, as
`emitUnionCoerce` already does for a never call. The IR's never arm is that call's statement, so the
binding arms can then match it (`rep novalue`, coordinator ruling 2026-11-22: fix legacy rather than
add an operand for a dead value).

## Readings (base master 146cb943, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh <base> <head> --names` | identical 9029, differ 8, built under one only 0; self-compile identical |
| the 8 differing cells | all shrink (2 bytes, 12 for `dord032`); each builds, instantiates and prints the same output under both seeds |
| `ir-identity.sh --cases` | identical 7624, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| armed shadow, corpus | 45228 covered = verified = matched |
| `ir-shadow.vl --claims` | 45226 corpus functions emitted by the IR, 19529 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED |
| seed size | 7,103,285 → 7,103,322 bytes (+37, the four added lines); `seed-size.vl --check` ok |
| `plumb-shape-cost.vl --check` | ok |
| L2 self-compile fuel per PR | +0.00% on 112359035354 |

The differing cells are `named/dord032.vl` and seven `named/rv3310_*__isall__tp.vl` cells, each a
binding whose `if` arm is a never call.
