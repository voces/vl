# Producer slice N2: a set a hand-back call hands to a `const` is decided at check, 2026-11-16

Lane STORE, the N step's second producer slice (coordinator ruling 2026-11-16: one PR per
producer shape, counted first). N2 is the identity hand-back, `const p = fw(add); p(1, 2)`,
6 programs by the shape count.

## Why these sets were late

- `sbThroughNote` looked for a hand-back only when the `const`'s type named no set. When it did name
  one, it added member rows and left the set to the check's own call list, which never lists a call
  through a hand-back result. So the set was tried by no one at check.
- Once tried, the check refused at `ftNodeOk`'s hand-back arm: `ftHandsBack` read the elaboration's
  hand-back facts (`mintRetParamsOf`), so only the late decision could accept it.

## What changes

- `sbThroughNote` notes the handed-back set whatever the `const`'s type says.
- In the check's retry (`ftUseArrow`), `ftRetParamsOf` reads the check's own hand-back
  (`check_hand_back.vl`, the producer `setBindDiffLine` already grades against the elaboration's
  and finds them agreeing) in place of `mintRetParamsOf`. The hand-back arm admits the retry.
- The retry also runs for a set a hand-back call hands to a `const` (`setBindHandedSets`), not
  only for a set an arrow fact names.

Every decision the check made before is still made first and unchanged; the retry only adds.

## Measurement

ftlate probe, all `@run` programs, fixpoint seeds, against master with step 2b:

| | before | after |
|---|---|---|
| programs whose decision the late pass changes | 290 | 276 |
| N sets / programs | 194 / 96 | 165 / 82 |
| T sets / programs | 82 / 51 | 96 / 54 |
| late drops | 2 | 2 (the same pair) |

Five of the six N2 programs are now decided wholly at check (`rounds=0`). Some sets the producer now
finds are refused by the check for other reasons, so they move from N to T.

## Grading

- A/B, fixpoint against master's fixpoint: wasm and output byte-identical on all `@run` programs.
- The late-outside-exclusions probe fires on none.

## The late branch is narrowed: hand-back refusals count as the facts refusing

In the retry, a callee the check's own hand-back says hands a parameter back, yet not this set's,
is a refusal by the facts (`ftFactRefusal`). So a set refused that way and then tagged by the
late decision fails the probe, as a refusal by the arrow facts does (#8729).

| build | programs the probe fires on |
|---|---|
| a control that counts a callee with no hand-back fact as a refusal by the facts | 1 |
| this build | 0 |
