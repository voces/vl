# IR cutover C2e: list length, with the ref list read, 2026-11-16

Lane IR-C. This is a coverage step, the first under the `ir-design-2026-11.md` §10 exemption. It
widens what the builder covers where legacy had no IR duplicate to delete. So it is graded on
covered functions per line and on the first-miss histogram, not on net lines. It folds in the ref
list read (C2d), which was never opened as its own PR. `CLAIMED` stays empty. Measured on fixpoint
seeds against master `979395d8`.

## What landed

- **`.length` is one arm, split around its receiver.**
  - `arrLenHoistOf` is the live loop hoist whose cached `len` answers a list that may be a view.
    Outside a hoisting loop it returns at once.
  - `emitArrLenHeld` writes that cached `len`.
  - `arrLenTail` writes the length once the receiver is written: the ref, string-list, wide scalar,
    i32 list and raw string arms, with the view helpers.
  - Legacy's `emitArrLen` and the IR's `RListLen` lowering both call the halves.
  - `RListLen.llAt` carries the `Member` node. The builder admits `.length` on any list receiver whose rep it admits.
- **The ref list read (C2d).**
  - `emitIndexRefList` splits into `refListHoistOf` and `refListGetTail`.
  - The builder admits the `ref` arm for a list of scalar lists when the read keeps no nullable niche,
    the receiver is not nullable, no view is read and a row is minted.
  - `refRepOk` admits a list of scalar lists.
  - Before the split, a throwaway probe checked every legacy ref-list read: 1,420 on the self-compile
    (426 the IR would take) and 4,655 in the corpus (103). Every read the IR would take had a plain or
    hoisted path with a clean tail, so there were 0 counterexamples. The failing control flagged exactly
    the 35 extra-tail and 44 nullable-keep corpus reads.

## Coverage

| reading | master | this branch | gained |
|---|---:|---:|---:|
| self-compile, armed: covered | 2,167 | 2,795 | +628 |
| self-compile, matched | 2,164 | 2,791 | +627 |
| corpus `ir-shadow.vl`: covered and matched | 12,652 | 12,996 | +344 |

Compiler lines: +210 / −124 over four files, so 86 net and 210 gross added. That is 7.3 covered
self-compile functions per net line, or 3.0 per gross line added. For the corpus it is 4.0 per net
line, or 1.6 per gross.

**First miss, before and after.** Rows count first misses only.

| row | self-compile, master | self-compile, this branch | corpus, master | corpus, this branch |
|---|---:|---:|---:|---:|
| `list length` | 3,903 | 0 | 3,376 | 0 |
| `list length rep` (new: an element rep the builder does not admit) | — | 2,377 | — | 3 |

On the self-compile the 3,903 split into 628 covered, 2,377 stopped on the receiver's element rep
(lists of records, strings and boxes), and the rest moved to a later first miss.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the master seed | see the PR body |
| shadow, corpus | 12,996 of 12,996 matched, `ir-shadow: ok` |
| shadow, self-compile | 2,791 of 2,795 matched; the four unmatched are named unlowered misses, not byte mismatches |
| mode 3 with `list` admitted (throwaway build): self-compile | 2,791 functions claimed, byte-identical to the seed; four fall back on the named misses |
| mode 3 with `list` admitted: corpus | 8,934 identical, 0 differ, 0 fell back |
| L2 self-compile fuel | 92,876,852,351 to 92,879,368,173 (+0.003%) |
| seed size | 6,413,176 to 6,414,177 (+1,001) |

The self-compile adds one named miss, `non-stack temp: out of order` in `cwRetBlockValues`. It is the
I1b-1 argument-order gap, `f(xs[i], c && d)`, which this function reaches now that its `.length` is
covered. The claim falls back on it by name.

**Fuel.** The first version of the split asked the receiver classifiers in both halves at every
`.length`, which cost +0.25% L2 fuel. Outside a hoisting loop no row is live, so the hoist half now
returns at once when `lhOpen` is empty, and the cost fell to +0.003%.

## Next

The `list length rep` row is now the list family's main blocker on the self-compile, at 2,377. The
receivers are lists of records, strings and boxes. Covering them means admitting those element reps,
which is I2's record and box work and waits on REP's stage 4.
