# B2: the decider reads storage rows where every key agrees — design, 2026-11-17

Lane STORE, after B0 (#8952) and B1 (#8959). The decision is still one bit per set (`fnTagged`), and B3
changes that. B2 lets the check decide a set whenever every per-key row it has agrees, so that set's
late row leaves the baseline. A set whose rows disagree waits for B3.

## Ceiling (B0's join of the 444 late rows)

| late rows | check rows | stage |
|---|---|---|
| 219 | complete, one call shape | B2a, less lambda members and holder refusals |
| 30 | open: written (all 7 S, 14 G, 9 N) | B2b, where every key's join agrees |
| 112 | none (84 have an elaboration row) | B2c, producer gaps |
| 42 | complete, shapes differ | B3 |
| 41 | open: unmatched, args, key, nested | named per PR |

## B2a: facts per key, for a set every row agrees on

- **`check_arrow_facts.vl` builds facts from the B0 rows as well as the arrow rows.** For each call row
  whose key closes, and each call in the callee's body through the parameter (or through a field or
  element path from it) whose callee holds the row's set, it notes a fact: (hole call, set, each
  member's result at the argument types the key substitutes).
- **What these rows close.** The arrow facts exclude open argument types and a generic or lambda
  body. Where the key closes those, the row has the fact.
- **Unanimity.** A set gets facts only if every row reaching it is complete and every hole call has one
  shape across the set's rows. A second shape at one call is today's split, and that set waits for B3.
- **Lambda members are excluded.** `setMemberRetAt` re-checks a lambda at argument types it never
  takes (measured in A1.3: 5 leaked check errors). A lambda member's result needs its own instance,
  keyed by `?#L<decl>`, and that waits for B3.
- **The decider is unchanged.** The fact retry (`ftUseArrow`) reads the larger table. Each PR narrows
  the late arm it makes redundant, per the 2026-11-16 amendment. `ftLateOutsideExclusions`, the
  `emitFail` probe, then also covers sets whose rows were all complete.

## B2b: S, the written-binding join as a set at check

- **Producer:** `setBindWrittenJoin` (B1), per key. If every key of the owner gives the same join, the
  join is interned (an accessor over `fnSetIntern`). The calls through the binding are then noted at
  check with that set (`fnTagCallNote`), and its leaves are the written values. If keys give
  different joins, it waits for B3.
- **One producer:** the decider reads the check's join. Once `mintSeed*` has no reader left, B3
  deletes it.
- **Reach:** B1 read all 7 S rows `equal`. The G and N rows among the written ones move only where
  their keys agree.

## B2c: N, the calls the check does not record

84 late rows have an elaboration row but no check row. Their set reaches a parameter through a call
the instance vector does not record: a call through a function value, a member call or a lambda call.
- Closing those means vector rows for those calls. That is L2's table (`instVecAt`).
- The other 28 sets never reach a parameter. B0 names their files, and the producer gap is closed
  where each one is held.

## Grading per PR

As before: late rows leave the baseline with no new row; `@run` A/B and check output identical, or
each mover named; L2 fuel within the tier; `emit_mono.vl` ≤ 908; phase-state census flat; net lines.

## Asked of the coordinator

1. **Unanimity:** a set moves at B2 only when all its rows are complete and agree. Any disagreement
   waits for B3.
2. **B2b's check-time call note** through a written binding, with the interned per-key join, is S's
   producer. The binding's own type at check is not changed.
3. **B2c needs vector rows for calls through function values, member calls and lambda calls.** Does
   L2 add them, or does STORE, with L2's review?
4. **Lambda members** go to B3, keyed by `?#L<decl>`.

Order: B2a, then B2b, then B2c, each one PR or more.
