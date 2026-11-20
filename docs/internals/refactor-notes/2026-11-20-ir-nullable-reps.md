# IR: the nullable reps (2026-11-20)

The builder held `string | null`, `K | null` and the boxed nullable as values, but not a nullable
record, list, map or closure (discipline 1, the reference or a null reference) or `boolean | null`
(discipline 2, the i32 with null the sentinel 2). On master `dd317d1c6` the class blocked 141
self-compile and 359 distilled functions (any), as `rep nullable`, `parameter`/`local`/`result rep
nullable` and `callee parameter`/`result rep nullable`; a probe naming the discipline split it:
nullable record 90 / 291, list 32 / 16, map 7 / 2, closure 0 / 15, `boolean | null` 15 / 35.

## One delivery, three legacy decisions
- **The reps.** `valueRep` admits `refNullable` and `boolNullable`. A reference's local run is the
  one legacy declares; `boolean | null` is an i32.
- **Delivery (`deliver`, `widenTo`).** One place, every position (argument, return, assignment,
  field, element): a `null` literal is legacy's own null (`nullOwnAt`, `RNullOf`: the bottom ref,
  or the sentinel 2), and `T` into `T | null` is the same value (`RRetag`). The verifier's
  `nicheRetag` names the niches that hold their inner value unchanged.
- **The null test** takes the `nullRef` arm on a nullable reference, and the `bool` arm through
  `nulTestBoolTail`, which legacy's `emitNulIsNullTest` now calls.
- **The narrowed read** (`RRecover`) recovers where `readOwesNonNullRecover` says, as legacy's
  `emitReadRecover` does after every name read; so a name receiver recovers in its own read
  (`memberReadPlain`).
- **A field read through a nullable struct** recovers its receiver first on
  `memRecvOwesNonNull`, which legacy's `emitMemStructRead` now asks; `structFieldPlain` no longer
  refuses that receiver.

## Measured on fixpoint seeds: master `dd317d1c6` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed | 16,678 | 16,747 |
| distilled functions claimed (`--claims`), all matched armed | 36,627 | 36,907 |
| self-compile functions with a nullable rep blocker, any | 141 | 0 |
| distilled functions with a nullable rep blocker, any | 359 | 11 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,516 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 100,897,834,610 → 100,786,356,292 (−0.11%).
- **Lines:** +84 / −36 in `compiler/`.

## What is left
- `index ref nullable element` (11 distilled): an element read of a list of nullable references.
- Functions the class shared with another blocker now show that one; on the self-compile the
  largest newly exposed is `index none` (26 alone).
