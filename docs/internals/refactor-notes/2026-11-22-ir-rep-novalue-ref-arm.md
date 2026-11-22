# `rep novalue`, step 1: a reference join's never arm (IR-C1)

`rep novalue` is the builder's miss at `exprAt` when an expression's type has no rep, which means
a `never`-typed node in a value position. On master 454e5ab9 its tests/cases population is 89
misses, 62 functions blocked by it alone. By node shape: 60 are a never call that is an arm's
value, mostly the checker's synthetic `__trap__()` closing a narrowed `is` chain, 17 are under a
binary (`??`), 5 under a return, 2 in a call argument, 1 in a `let` and 1 in a member read.

`ifArm` already builds a never arm as that call's statement. Each other arm builder was ablated
alone (only that builder taking the never arm, with one or two `unreachable`s after a trap), with
the armed shadow over the class's 41 programs:

| builder | covered | matched with one `unreachable` | matched with two |
| --- | ---: | ---: | ---: |
| `refIfArm` | +20 | +20 | 0 (21 mismatch) |
| `letIfArmBody` | +14 | 0 | 0 |
| `letIfSinkBody` | +3 | 0 | 0 |
| `unionIfArm` | 0 | n/a | n/a |

This step takes `refIfArm`, whose legacy writer stores nothing after a never arm, which is what
`ifArm` builds. The binding arms (`letIfArmBody`, `letIfSinkBody`) mismatch because legacy writes
a dead store after the `unreachable` (`emitNulArmToLocal`'s `local.set`, `emitUnionArmToPair`'s
pair tail). The coordinator ruled that legacy stops writing it, in its own PR, and those arms
follow.

## Readings (base 454e5ab9, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7625, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45225 covered = verified = matched (unchanged) |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45223 corpus functions emitted by the IR, 19522 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED, `ir prepost` included |
| L2 self-compile fuel per PR | +0.00% on 112289849468 |
| tests/cases claimed (`fnc` rows) | 69075 → 69097 (+22, 0 lost) |
