# A1.3: class T's literal holders decided at check, and class S measured, 2026-11-17

Lane STORE, stage A1.3. Coordinator ruling 2026-11-17: classes S and T, each in A1.2's shape
(`2026-11-17-store-a1-2-class-p.md`). This PR takes the part of T that shape reaches. Class S does
not move in that shape; the measurement is below.

## Class T: why each set was left late

A scratch probe (never refreshed into a seed) tagged each late `T` row with the arrow facts'
exclusion for its set, and, for a set the check retried with facts, the `ftPlan`/`ftScan` site
that refused it. All of `tests/`, master `f4e2f50d0`, 120 `tag T` rows.

| why | sets |
|---|---|
| a lambda member (`arrowNamedMembers`), alone or with others | 61 |
| complete facts, retry refused by `ftHoldCtxOk` (a literal handed to a hole parameter) | 10 |
| complete facts, retry refused: a member with no leaf at check | 7 |
| complete facts, retry refused by `ftCtxOk` | 6 |
| handed sets with no fact | 16 |
| open argument types | 10 |
| a lambda or generic body | 8 |
| split results | 2 |

Giving a lambda member facts (dropping `arrowNamedMembers`) moves no row and makes
`setMemberRetAt` re-check the lambda at argument types it never takes: 5 new check errors in
`generics/hole-fn-list-element-past-zero-own-calls.vl`. Lambda members need the per-instance key.

## What changes

`check_fn_tag.vl`:
- `ftHandedHolder` admits a list or record literal on the check's fact retry (`ftUseArrow`), as it
  did after the elaboration only.
- `ftHoldCtxOk`'s hole-argument arm takes that literal at check only where the callee does not
  hand the argument back (`ftArgHandedBack`, the check's own hand-back reading).

The second condition is the ablation's: without it,
`closures/error-set-in-record-handed-to-hole-param-two-orders.vl` (D16878's refusal) becomes an
invalid module, because `id2([half, inc0])` hands the literal back and the set stays closures there.

The late arm stays: `fnTagRedecide` clears every tag and decides again, so deleting the
`ftLate` half untags all 25 sets after the elaboration (measured: 31 `untag` rows, 6 new emit refusals).

## Residue

`scripts/late-tags-baseline.txt`: 442 → 417. 9 are T sets of the `ftHoldCtxOk` family; the tenth,
`closures/hole-fn-record-list-handed-back-then-called-two-orders.vl`'s `{inc,half}`, is handed back
and stays. The other 16 (4 `J`, 12 `N`) are the one-member and subset sets each moved T set decides
with it.

## Class S does not move in A1.2's shape

Letting the check try a set reaching a stored parameter on the arrow facts (`sbStoredSets` out of
`setBindTrySets`'s exclusion, gated like P) takes 11 rows off the baseline, and every one of the 5
programs they come from then fails to build:
`closed-fn-handed-to-param-written-to-let-called-at-two-types`,
`written-let-fed-by-two-hole-params-called-at-two-types`,
`written-let-seeded-by-hole-param-also-called-directly`,
`written-let-seeded-by-hole-param-handed-through-list-call` (invalid module),
`written-let-seeded-by-hole-param-written-with-named-fn` (`a function-value call has no interned
signature`). The rows leave because the check tags the parameter's set (`{add}`) while the written
`let`'s set (`{add, mul}`, an `N` row) exists only in the instance the elaboration makes; neither
decision then covers the binding. `late-demands.vl --check` passes on this build, since it reads
rows, not build results.

So S needs the written binding's join per instance key, which is the input of the per-(KeyId,
parameter) design, not a class step.

## Grading (fixpoint seeds both sides, master `f4e2f50d0`)

- `@run` A/B: 6,690 programs, 0 wasm movers, 0 exit-code movers.
- `vl check --codegen tests` (7,244 programs): output identical apart from the late rows.
- Late demands 10 (unchanged). Late tag rows 442 → 417, none new.
- L2 self-compile fuel: 95.0485G against master's 95.0449G (+0.004%).
- `emit_mono.vl` functions 908 (unchanged); phase-state census ok, no rise; seed +0.5% on baseline.
