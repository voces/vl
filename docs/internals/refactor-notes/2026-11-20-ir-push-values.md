# IR coverage step: push values the IR delivers at the element rep, 2026-11-20

Lane F2, the third of the push family. Measured on fixpoint seeds of this branch and master
`585f51b42`.

## Why these classes

`pushPlainWhy` refused two classes of pushes outright. Legacy's own `emitPushValue` writes most of
them with no conversion.

| class | self-compile functions alone | what the push is |
| --- | ---: | --- |
| `push element seed` | 24 | a push onto a literal-union, nullable-boolean, nullable-unit or nullable-string list |
| `push box` | 17 | a value owed a union box |

Removing `push box` moved its 17 to the next refusal, `push arm`: a value narrowed to one arm of a
union, unboxed at the push. That refusal goes too.

## What landed

- **`pushPlainWhy`.** It now keeps only the element arms that convert:
  - a literal narrowed to the receiver's atom (`litPushNeedsDestNarrow`), now `push element narrow`;
  - an atom widened into a `(string | null)[]`, now `push atom`.

  Every other value the IR delivers at the element rep through `deliver`, as itself, boxed through
  the shared box plan, or unboxed from its narrowed arm. The legacy emitters are unchanged.
- **Why the arm unbox needs no shared tail.** Legacy casts a narrowed arm at the site's own heap.
  `pushRhs` requires the delivered value's rep to equal the element rep, and the element rep fixes
  that heap. So the IR's narrowing cast is accepted only at the heap legacy casts to. Any difference
  between the two sides is a rep mismatch, and so a named miss, never a silently misplaced cast.
- **Why a box value needs no shared tail.** `boxOwedAtRecord`'s case beyond `boxOwedAt` is an
  already-boxed value with no coercion recorded. Legacy writes it as a pass of its own union, which
  is what `deliver` writes when the value's rep is already the element's.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 17,778 | 17,819 |
| corpus functions covered (45,678) | 39,659 | 39,690 |

- **Shadow mode 1:** everything covered is verified and matched.
- **Mode-3 self-compile:** byte-identical.
- **Legacy bytes:**
  - `ir-identity.sh --names` against master's seed: identical 9,037, differ 0, self-compile
    identical.
  - `--cases`: differ 0.
  - Per-file `tests/cases` A/B: same 7,231, fail under both 67, differ 0.
- **Witness:** `vl_ir_shadow_test` pushes onto each arm — literal union, `(boolean | null)`,
  `(string | null)`, a union box, and a narrowed `is Sq` arm onto `Sq[]`. Every function is covered
  and matched; on master each one misses.
- **Fuel:** L2 +0.1% on the shared baseline.
- **Compiler lines:** +7 / −6.
