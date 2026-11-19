# IR coverage step: a ref list read at any element rep, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10; measured on fixpoint seeds of this
branch and master `cb50a11af`.

## Why this class

STORE's self-compile census put `index ref` at 251 functions it alone keeps uncovered, the largest
single class there; the shadow counted 347 first-misses.

## What landed

`refReadWhy` no longer refuses a ref-arm read whose element is not a list of scalars. The
restriction dated from the first ref-list read step (#8613); the builder already misses a read whose
element rep is not the read's (`index element coercion`), and the lowering already ends through
legacy's own `refListGetTail`, so the element's retag and unbox stay legacy's bytes. The predicate it
used, `irScalarListRep`, had no other reader and is deleted. Nothing is added.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 12,767 of 18,932 | 13,012 of 18,931 |
| self-compile first-miss `index ref` | 347 | 0 |
| corpus functions covered (45,675) | 31,176 | 31,227 |

All covered functions verified and matched (shadow mode 1); the mode-3 self-compile is
byte-identical to the shipped build. Functions gained per compiler line: 245 self-compile and 51
corpus over -11 net compiler lines (0 added, 11 deleted).
