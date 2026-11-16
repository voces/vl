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
| programs whose decision the late pass changes | 334 | 288 |
| T sets / programs | 153 / 98 | 81 / 50 |
| late drops | 2 | 2 (the same pair) |

Before this step, a scratch probe of `ftPlan`'s refusals on the T programs put the innermost
refusal of 98 T sets at `ftCtxOk`, for an argument to a call through a held set (21 sets) or
through an element, field or choice (77). This step moves 72 sets; which of the 98 they are was
not split out.

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
- No `fnTagRedecide` branch is deleted here, because the same late paths still decide T's
  remaining 81 sets. The deletion lands with the PR that moves the last of them.

## One decider per set: the late branch is narrowed to the named exclusions

This follows the coordinator's amendment of 2026-11-16 to the staging. The late T branch may admit
only a set the facts exclude:
- open argument types;
- a lambda or generic body;
- a lambda member;
- split results;
- or no complete facts at all.

The last of these covers two cases: an argument-takes test on a parameter no arrow row reaches,
and a parameter the set-binding rows never bring the set to.

The mechanism:
- The check records each set its retry refused through a test that reads the facts (an
  argument-takes test on a reached parameter, a fact call's arguments, completeness), with no open
  or split row.
- `fnTagLateOutsideExclusions` names such a set the late decision went on to tag, and
  `elabPrepare`'s caller fails on it (`emitFail`).

| build | programs the probe fires on |
|---|---|
| a control that counts open sets as refused by the facts | 10 |
| this build | 0 |

Two earlier drafts of the classification fired on the corpus. In both, the facts were missing, not
refusing:
- first, late-only gates unrelated to the facts (hand-backs, holder contexts);
- then, members no solve reaches, and producer gaps.

The final classification counts only refusals that read the facts.
