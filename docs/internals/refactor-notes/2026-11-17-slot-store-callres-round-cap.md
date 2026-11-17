# Place classes: the call-result pass ends on its done set (lane SLOT, 2026-11-17)

## What changed

- **`eplCallResults`** loses its `round < 8` cap. Each round draws only the (member, call, instance)
  edges its `done` set has not seen. The calls and members are fixed during the build, so the loop
  ends when a round draws none. The cap could only cut a longer chain short without a word.

## Did the cap ever bind?

A probe compiler fails on entering the eighth round. Its control fails on entering the second.

| probe | `tests/cases` programs it fires on |
|---|---|
| second round (control) | 316 |
| eighth round | 0 |

## Readings

Fixpoint seeds on both sides: master `846d9d9e9` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, byte for byte | 0 differ |
| distilled corpus, per cell | `regress.vl --json` byte-identical; 0 `runs -> not-runs`, 0 `-> silent` |
| gate | all pass, scaling shape included |
| L2 self-compile fuel | 94.134e9 (+0.3% on baseline 93.885e9) |
