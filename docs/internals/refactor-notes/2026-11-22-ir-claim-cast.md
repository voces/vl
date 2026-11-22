# RCast is the box family's, and is claimed (IR-C1)

`RCast` moves from the `other` family to `box`. The builder builds it only for `as!` over a
niche-repped `T | null` operand (`asNiche`, at `asNicheCastWhy`'s answer). The lowering writes the
operand and `ref.as_non_null` (`fbRefAsNonNull`), as legacy's `emitAsNulNiche` does, and neither
reads state that legacy fills while it emits. There is no new admission predicate.

## Readings (base 42ffaa13 = the list constructors' head, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7619, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45099 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45075 corpus functions emitted by the IR, 19346 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED, `ir prepost` included |
| L2 self-compile fuel per PR | +0.00% on 111340360155 |
| tests/cases claimed (`fnc` rows) | 68403 → 68409 (+6, 0 lost) |

## The functions released (tests/cases, file and function)

```
tests/cases/generics/as-cast-over-pinned-nullable-param-runs.vl  first
tests/cases/generics/as-cast-over-pinned-nullable-param-runs.vl  gen
tests/cases/generics/as-trap-union-pin-no-member-traps.vl  count
tests/cases/unions/as-trap-nullable-struct-niche.vl  frame
tests/cases/unions/as-trap-nullable-struct-niche.vl  ret
tests/cases/unions/as-trio-box-and-niche-operands.vl  both
```
