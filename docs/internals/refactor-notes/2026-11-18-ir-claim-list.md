# IR: the `list` family joins `CLAIMED`, 2026-11-18

Lane IR2. #8947 claimed scalar, control, call, global and map, and left `list` out: its mode-3
throwaway fell back twice on the self-compile (`non-stack temp: out of order`, `operand above a
valued if's value`). F1 named both shapes as builder misses, and S1's mode-3 throwaway with
`list` admitted read 0 fallbacks on the self-compile and the corpus, 0 differ. This step admits
it. Mode 3, the claim path's own test, now claims every family but `other`.

## Readings

Each tree is built from its own fixpoint seed and its own checkout: master 0b7982e6, and this
change.

| reading | master | this change |
|---|---:|---:|
| self-compile functions the IR emits (`--claims`, `$VL_IR_SHADOW=5`) | 2,218 | **6,707**, every covered one |
| corpus functions the IR emits (12,297 cells) | 10,869 | **28,098**, every covered one |
| `claim fell back`, self-compile and corpus | 0 | 0 |
| claimed self-build | its fixpoint | its fixpoint; it also builds master's source to master's fixpoint seed, byte for byte |
| corpus identity, claiming on in both | – | 9,029 identical, 3,268 fail under both, 0 differ |
| armed self-build and corpus shadow | byte-identical; 6,707 and 28,098 matched | the same |
| L2 self-compile fuel | 96,917,999,226 (+0.7% on 96,215,502,116) | 96,506,125,918 (+0.3%), **−0.42%** |

The fuel falls because a claimed function's bytes come from the IR's lowering and legacy's body
lowering does not run for it.
