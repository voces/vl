# IR claim on: the IR's bytes ship for fully matched families

Coordinator, 2026-11-17. `CLAIMED` in `compiler/ir_build.vl` goes from empty to scalar, control,
call, global and map, the families mode 3 already proved byte-identical. A function whose every
node is in a claimed family is built, verified and lowered by the IR, and legacy does not run for
it. `list` stays out: claiming it reaches about 5,700 self-compile functions, but 2 fall back
(the folded global read), and the gate now forbids any fallback.

## What else changed

- `$VL_IR_SHADOW=5` (host and guest): disarmed, as shipped, but the rows print, so the claim is
  measurable.
- `ir-shadow.vl -- --claims` builds the distilled corpus in mode 5. It prints the claimed count
  and exits 1 on any `claim fell back` row. `gate.sh` runs it as the blocking `ir claims` row.
- The shadow's corruption controls also apply on the claim path, so a verifier failure there is
  tested: `vl_ir_shadow_test` shows a corrupted claim falls back, is counted, and ships legacy's
  bytes.
- Design §10 and DECISIONS record the reversal of the morning's parking.

## Readings (final, master 54733d1ac merged in)

| bar | reading |
|---|---|
| armed shadow, all of `tests/cases` (8,497 files) | 28,329 covered, 28,329 matched, 0 verifier failures |
| armed shadow, distilled | 24,121 of 24,121 matched |
| shipped claim (`--claims`, mode 5) | corpus 10,868 and `tests/cases` 12,820 functions emitted by the IR, 0 fell back |
| self-compile | 2,179 functions emitted by the IR; fixpoint, and byte-identical to the legacy-built seed |
| corpus identity against the base's fixpoint seed | distilled 9,029 identical and `tests/cases` 7,125 identical, 0 differ, 0 lost |
| L2 fuel | 96.22G: +0.84% master drift plus +0.67% for the claim (the IR builds every function to decide it); rebaselined with a ledger line |

## What the corpus comparison found, and how each class closed

The gate's shadow ran only over the distilled corpus, so `tests/cases` held mismatches no row saw.
Running the shadow there, then `corpuscmp`, found them. Each closed by sharing legacy's pure decision
or by a named builder miss:
- a callee with a hidden environment: the IR's call passed none (invalid modules), now `callee environment`;
- f32 constant trees took the raw lexeme (wrong values), now legacy's `numLitLexAt`;
- the global storage classes, open temps and lifted capture slots decided at lowering, now builder misses;
- masked shifts (`shiftMaskFoldOf`), a written empty `else` (`SIf.siElseKw`), the valued fall-through pad
  (`fallThroughPadOf`), kept-tree consts, in-place string appends and folded atom compares (IR3's commits).
