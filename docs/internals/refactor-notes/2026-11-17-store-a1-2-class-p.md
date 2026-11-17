# A1.2: the check tries a partial set on the arrow rule's facts, 2026-11-17

Lane STORE, stage A1.2 of the per-instance key. Coordinator ruling 2026-11-17: class G stays in the
late residue until storage is decided per (KeyId, parameter) (a design note, the stage after P, S
and T), and A1.2 takes class P.

## What changes

- `check_set_bind.vl` `setBindTrySets`: a partial set (one reaching a place also reached through a
  parameter the rows cannot follow) is no longer left out of the check's try list.
- `check_fn_tag.vl` `fnTagDecide`: such a set is tried only when
  - the arrow rule has facts for it and no call reaches it at open argument types, and
  - no parameter it reaches belongs to a function that is itself a member of a set some call goes
    through (`ftParamOwnerCalledThroughSet`): the rows do not follow a call through a set, so
    another value may reach that parameter unseen.
- `setBindSetPartial` and `setBindParamDeclsOf` expose the two facts the condition reads.

## The ablation that fixed the condition

| variant | late rows gone | new `untag` rows |
|---|---|---|
| partial sets tried unconditionally | 22 | 1 |
| plus the arrow rule's facts required | 20 | 1 |
| plus no parameter owner called through a set | 18 | 0 |

The one `untag` was `functions/hole-and-closed-function-handed-to-one-slot-through-a-list-runs.vl`'s
`{id}`: the check tagged it, and the decision after the elaboration refuted it. Minimal shape:
`function onceF(h) { print(h(2.5)) }` called through a set (`const g = if c { onceF } else { onceF }`
or `const gs = [onceF]`) with both `id` and an annotated `dbl`: `dbl` reaches `h` through the call
through `g`, which the rows do not follow. Called directly (`onceF(id); onceF(dbl)`), the check now
decides `{id}` itself, a row master left to the late decision.

Dropping the two sharing tests tried in between (a parameter taking two sets, by the arrow rows and
by the set-binding rows) moved 9 more rows and added no `untag`; the owner test subsumes them.

## Residue

`scripts/late-tags-baseline.txt`: 460 → 442 rows. Each row gone is a P-class set the check now decides
with every call's facts.

## Grading

See the PR body: `@run` and non-`@run` A/B, the 73 matrix templates, the probe, late demands, phase
state, seed size, fuel.
