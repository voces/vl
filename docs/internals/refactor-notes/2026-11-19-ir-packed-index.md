# IR coverage step: a packed byte element read, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10; measured on fixpoint seeds of this
branch and master `b306ab952`.

## Why this class

The self-compile census put `index packed element` at 54 functions it alone keeps uncovered; the
shadow counted 74 first-misses.

## What landed

`buildIndex` no longer refuses a read off a `u8` list (#9006 had it as a named miss). Such a read
is typed at the i32 rep while the list's element rep is `u8`, so the builder's element-coercion check
and the verifier's element-rep rule each admit that one widening: legacy's scalar read tail reads the
byte with `array.get_u`, which leaves the i32. No lowering changes.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered (18,993) | 14,112 | 14,144 |
| self-compile first-miss `index packed element` | 74 | 0 |
| corpus functions covered (45,675) | CORPUSB | CORPUSA |

All covered functions verified and matched (shadow mode 1). Of the 74, 32 are now covered; the
other 42 stop at a later miss (`assignment target` 25, `push operand coercion` 11, and others).
Functions gained per compiler line: 32 self-compile over +3 net compiler lines (9 added, 6 deleted).
