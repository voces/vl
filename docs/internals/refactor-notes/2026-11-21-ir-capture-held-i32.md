# IR: a captured atom or i32-held niche at the i32 its capture holds, 2026-11-21

`capture binding` was 200 tests/cases functions at master `f1b14200`. Scratch probe seeds named
each miss's capture rep and read rep, then why `capRepOf` gave none. That split 204 rows over 96
files into four groups (the rest is in the ranking sent to the coordinator):
- **i32-held reps refused: about 62.**
- **Captured `for-in` variables: 50.** Their LoopVar declaration records no type.
- **A binding at another rep than the read: 79.** About 39 of these are a nullable ref narrowed
  past its null.
- **Other: 13.**

## The change

`capRepOf` compares the capture's legacy valtype (`captureValKind`) with its rep's. `valtypeOf`
knows only scalar prims, so an atom and the `K | null` and `boolean | null` niches answered -1.
Their capture then had to be a reference, while legacy stores it as an i32. Those three reps are
now held as i32 (0x7f). No REnvGet, env-layout or legacy change.

Tried and refused: an env read of a nullable-ref capture narrowed past its null, built as
`REnvGet` at the inner rep. It added 9 fail rows (`prefix or locals`), because the narrowed temp
declares a local legacy does not, so it was reverted.

## Readings (merge-base `2de2ffc1f`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 44,792 | 44,806 (+14) |
| corpus `capture binding` (alone) | 23 (22) | 12 (12) |
| corpus `closure env capture` (alone) | 13 (7) | 9 (3) |
| tests/cases armed shadow covered / matched | 66,856 / 66,855 | 66,924 / 66,923 (same single fail row) |
| self-compile functions with no blocker | 19,631 | 19,631 |
| L2 self-compile fuel | 108,665,970,114 | 108,671,315,149 (+0.005%) |

Legacy lines deleted: 0. Moved to `@ir`: 0.
