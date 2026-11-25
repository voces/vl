# COV-CALL: a `K | null` read narrowed out of a wider box (2026-11-25)

Lane COV-CALL, class `print nulLitPin`. Its sibling `print nulAtom from a box` closes too, as does
the delivery position `pre-path nul atom niche` (another class's first miss, same mechanism).

## Mechanism

Take a place typed `i32 | K | null` (`K` a literal union) and narrowed to `K | null`. Legacy reads
it at its storage, the box, and converts it to the atom niche (`emitNarrowedNicheRead`, kind
`NICHE_NUL_LIT`): the null tag gives `-1`, any other tag its string decoded to the member id.
`print` then streams that id through the nullable atom tail.

- **Builder:** `nulLitNicheRead` reads the place under `storageReadEnter` and wraps it in the
  existing `RNicheRead`, at kind `NICHE_NUL_LIT` and the read's nullable atom rep. `printStmt`
  takes it for the `nulLitPin` arm and for `nulAtom` over such a read. `exprAtPre` takes it for
  the `pre-path nul atom niche` delivery.
- **Verifier:** a kind-`NICHE_NUL_LIT` niche read is at a nullable atom rep (discipline 3).
- **Lowering:** `RNicheRead` already ends in legacy's `emitNicheReadTail`. The print tail
  (`printAtomTail`) takes the `nulLitPin` arm.
- **One producer for the texts:** `printAtomTexts` gains the `nulLitPin` arm
  (`nulLitMemberTexts(instanceReadTyOf(..))`). Legacy's dispatch now asks it as well, so the IR's
  tail and legacy's decode at the same members.

## Legacy is byte-identical

The master seed and this branch's fixpoint seed build every program to the same bytes, with equal
exit codes: `tests/cases` 0 of 9,422, distilled + capability probes + class witnesses 0 of 18,150.
The self-compile is identical too.

## Census (class programs, `CENSUS_CLASS=classes/print-nullitpin.txt`)

| row | before | after |
|---|---:|---:|
| `print nulLitPin` | 19 | 0 |
| `pre-path nul atom niche` | 2 | 0 |
| newly exposed first misses | | 3 |

The 3 newly exposed are other mechanisms, each one function: `is literal arms receiver`, `map get
union box rep` and `is member storage rep`. There is no claim fallback, and every claimed function
verifies under `VL_IR_STRICT=1 VL_IR_SHADOW=6` with bytes identical to master.

## Proof

- Q58 sweep: `tests/cases/literal-unions/narrowed-literal-niche-positions.vl`. A local, parameter,
  field, list element, global and hole-instance read is printed and delivered to a `K | null`
  parameter, with both a member and `null`. On master the IR claims 1 of its 6 functions and not
  the start body; with this change it claims all 6 and the start.
