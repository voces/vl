# The flag day's fuel is input, not the rule: 2026-11-15

AE-001 (#8383) raised L2 self-compile fuel by +1.84% on master 59155c7df (89.55G to 91.19G), up
from +0.92% when it was first measured on f8de97d84. The ledger line split master's drift from the
flag day, but not the flag day's own cost into the rule's code and its input.

## The split

The bootstrap fix in #8383 let a pre-flag-day seed compile the migrated tree. Three builds of
`compiler/entry.vl`, all from fixpoint seeds:

| seed | tree | fuel |
| --- | --- | ---: |
| 59155c7df (before) | 59155c7df | 89,547,860,364 |
| 59155c7df (before) | 55151b05 (after) | 91,173,732,739 |
| 55151b05 (after) | 55151b05 (after) | 91,191,707,071 |

- **The rule's own code, +0.02%:** both compilers, on the same migrated input.
- **The input, +1.82%:** the old compiler pays it on the `return`-spelled source.

`checkRetStmtNode`'s +1.4 profile points are attribution, not a re-walk: the tail expressions a
block once checked as its value are now checked under their `return`.

## What was not kept

`preludeIfsIn` (emit_collect) re-scans a prelude-free `if` chain from every `else if`, which is
quadratic, and `stmtArmRoot` sends every `return` argument to it. A linear walk built
byte-identical seeds (L1 == L2). It did not clear the bar:

- fuel 91.197G against 91.192G;
- median-of-10 CPU 48.25 s against 48.59 s, interleaved, with runs from 41 to 58 s.

So it was not landed.
