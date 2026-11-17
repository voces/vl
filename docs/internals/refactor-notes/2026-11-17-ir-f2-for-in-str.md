# IR F2: a string's code-point walk through legacy's own loop, 2026-11-17

Lane IR-C. F1 left one walk the corpus holds above all others: `for c in s` over a string, which
legacy walks one code point at a time. On the A1 seed, 2,026 corpus functions held one, and 1,013
held nothing else the IR missed (F1's table). The self-compile held 23, and 13 alone. This step
moves that walk onto F1's seam. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **`forInPlainWhy` admits a string source.** The string walk takes the same loop record, open
  and close as a list walk. Legacy's `forInLoopAt` already takes the string flag, so the decision
  drops only its `string source` reason. A byte source, a pair, a map and the rest stay misses.
- **The IR's walk passes legacy's flag.** `SForIn`'s lowering asks `forInStringSrc` for the
  iterable, as `emitForInStmt` does, and hands the answer to `forInLoopAt`.
- **The loop variable is an i32.** The builder gives a walk over a `str` operand an i32 local,
  and the verifier holds a walk's variable to its element rep: a list's element, or i32 for a
  string.

## Pins

A shared witness walks `"héllo"`, prints each code point (`é` is 233, one code point, not its two
UTF-8 bytes), and sums them. It is one covered function that matches legacy and prints the right
values.

## Coverage

| reading | F1 | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 6,636 | 6,640 | +4 |
| corpus covered = matched (12,296 cells) | 25,060 | 25,736 | +676 (the rest also hold a walk's branch, a hoisted walk or another miss) |

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 3 mismatches F1 already reports (A1's 2 and `armAdopt`'s) |
| corpus identity against the F1 seed | 12,294 cells: 9,016 identical, 3,278 fail under both, 0 differ |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 6,640 claimed and byte-identical, with F1's 3 fallbacks; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 94,511,609,272 to 94,513,013,736 (+0.001%) |
| seed size, F1 seed to this one | 6,550,824 to 6,550,870 (+46) |
