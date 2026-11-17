# IR F2: a string's code-point walk through legacy's own loop, 2026-11-17

Lanes IR-C, then IR2. F1 left one walk the corpus holds above all others: `for c in s` over a string, which
legacy walks one code point at a time. On the A1 seed, 2,026 corpus functions held one, and 1,013
held nothing else the IR missed (F1's table). The self-compile held 23, and 13 alone. This step
moves that walk onto F1's seam. `SForIn` is a `control` node, so a claimed function ships the
IR's walk; corpus identity shows no emitted byte moves.

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

Each tree is built from its own fixpoint seed and its own checkout: F1 (#8955) over master
7974bfd7, and this step.

| reading | F1 | this step | gained |
|---|---:|---:|---:|
| self-compile claimed and shipped (`--claims`) | 2,214 | 2,215 | +1 |
| self-compile covered = matched (armed) | 6,679 | 6,683 | +4 |
| corpus covered = matched (12,297 cells) | 25,062 | 25,738 | +676 |
| corpus claimed and shipped | 10,869 | 10,869 | 0: the corpus's string walks sit in functions that also hold an unclaimed family |

The first miss `for in string source` falls from 2,025 to 0 on the corpus. Net compiler lines are
+16 (+37, −21): 42 corpus functions per line.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with 0 mismatches; the claimed self-build reproduces its fixpoint |
| `--claims` | 0 fell back, self-compile and corpus |
| corpus identity against F1's seed, claiming on in both | 9,029 identical, 3,268 fail under both, 0 differ |
| L2 self-compile fuel | 96,582,062,497 to 96,584,809,420 (+0.003%), +0.4% on the baseline |
| pin helpers in `emit_mono.vl` | 908 |
