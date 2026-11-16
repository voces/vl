# S3.4d step 2: class T decided at check from the arrow rule's facts, 2026-11-16

Lane STORE, S3.4d's first consuming step (staging ruling 2026-11-16). Class T is a set the check
tries and refuses because the refusal needs a fact only the elaboration had:
- each member's result at a call an instance makes through the set (the mint facts' `rs`);
- whether a member's parameter takes the set (`mintParamTakes`).

## What the check reads now

`check_arrow_facts.vl` reads the arrow rows (#8686) as facts: one per (hole call, set), with each
member's result at the call's closed argument types (`setMemberRetAt`). A set gets no fact, and is
left to the late pass, when:
- some row reaches it at open argument types;
- the call is in a lambda or a generic body, where an instance is not keyed by the set alone;
- it has a lambda member, which has no instance of its own per argument types;
- two rows give different results at one call (split).

`fnTagDecide` first asks each set exactly as before. Only a set that stays undecided, and that some
check fact names, is asked again with the facts in place of the mint facts (`ftUseArrow`):
- `ftLateArgOfSet` accepts an argument handed to a call through a held set, element or choice
  where every member's parameter takes the set;
- `ftCommit` builds the arms at the facts' calls;
- `ftMintComplete` asks each call through the parameter for a fact of the set.

So every decision the check made before is unchanged by construction: the facts only add decisions.

## Measurement

ftlate probe, all `@run` programs, fixpoint seeds:

| | before | after |
|---|---|---|
| programs whose decision the late pass changes | 331 | 288 |
| T sets / programs | 150 / 95 | 81 / 50 |
| late drops | 2 | 2 (the same pair) |

The 69 T sets now decided at check were the ones refused at `ftCtxOk` for an argument to a call
through a held set (21) or through an element, field or choice (48).

What T still holds:
- lambda members (`ftNodeOk`'s lambda arm, 65 sets on the probe before this step);
- sets reached from generic bodies or at open types.

Both need the per-instance key that S3's solve gives at the call, not one per set.

D16747's 10 matrix cells still refuse. No producer finds their set, and its members' results
differ, so they belong to the slice that covers that population (N).

## Grading

- A/B, fixpoint against master's fixpoint:
  - all `@run` programs: wasm and output byte-identical;
  - the 1,789 other cases: `vl check` output byte-identical.
- The late pass still runs for every class. No `fnTagRedecide` branch is deleted here, because
  the same late paths still decide T's remaining 81 sets. The deletion lands with the PR that moves
  the last of them.
