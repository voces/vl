# `rep unsup`, batch 2: empty literals, shared reads through a hole receiver, open `let` reads and their `==` (IR-C1)

These are the coordinator's batch-2 pieces (C, A3 and the `==` route), built on batch 1 (#9729) in
`exprAtPre` where a node's own type has no rep.

- **C** (`openArrLitRep`): an array literal whose type is open is at legacy's built type, or, where
  that is open too, at the scalar list `arrLitArmOf` writes (`repElemTyOfName("<elem>[]")`). The
  literal's temp is typed by that rep.
- **A3** (`openMemberRep`, `ir_build_ref.vl`, through `irOpenMemberRepHook`): a member read off a
  hole parameter takes that parameter's frame rep as its receiver. Where the receiver is a box,
  legacy's read is plain shared, no tail changes it (`sharedReadTailOf` is `SRT_NONE`), and every
  arm stores the field at one scalar type (`variantFieldTypeAt`), the read is at that type. A
  nullable box receiver (`?.` over `A | B | null`) stays a miss, because the IR's shared read takes
  a box receiver only. That covers 5 of the 7 member cells, a gap of the shared-read path rather
  than of open types.
- **`let` reads and the `==` route**: a read of a `let` the build holds takes that variable's rep.
  That alone sent `r == "a"` down the IR's string compare where legacy compares the atom id
  (`i32.eq`). An operand whose own type is open now routes as an atom operand does, by legacy's
  `atomEqPlanOf`.

B (4 cells: a lambda in a generic body reading a captured instance parameter typed `T`) stays with
IR-C1 for a later batch. N7 confirmed it is outside `capture binding`.

## Legacy tails the IR calls

None.

## Readings (base ed8b84fbf = batch 1's head, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7712, fail under both 68, differ 0; witnesses same 62, differ 0 |
| `ir-identity.sh --claimless` | identical 14040, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45442 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, margin | 417 ok; fail 903 KB / pass 906 KB on both |
| `self ir misses` | ok, 0 missed (baseline 0) |
| `tests/vl_deep_nesting_test.ts` (host linked) | 8 passed, 0 failed |
| `lint-self.sh` | clean |
| L2 self-compile fuel per PR | +0.11% on 120,149,477,009 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| tests/cases `rep unsup` (mode 4 blockers) | 33 → 27 functions |
| tests/cases claimed | functions 78,868 → 78,876, starts 6,788 → 6,793 (0 lost) |

`gate.sh --fast` first failed on the phase-state surface: C's `mkArrayTy` import from the checker.
The list is now named through `repElemTyOfName`, and the census is back at its baseline. The fast
tier and `--cases` were re-run on that change.
