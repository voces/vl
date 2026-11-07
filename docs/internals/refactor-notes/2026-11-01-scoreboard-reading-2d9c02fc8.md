# Scoreboard reading at 2d9c02fc8

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §4.1b on 2026-11-07; its `§` references are to that file.

### 4.1b Reading at 2d9c02fc8 (2026-11-01)

Same commands as 4.1, on a quiet 4-core cloud box (load under 1 at start). Fuel and counts are exact;
this box's RSS is not comparable with 4.1's, so only the plumb RSS (graded by its own script) is given.

| Metric | 76a3eb8fd | cb348241 | 2d9c02fc8 |
|---|---|---|---|
| compiler/*.vl lines | 371,600 (229 files) | 366,524 (238 files) | **366,702** (238 files) |
| emitter / checker / fn_* lines | 188,533 / 112,825 / 9,594 | 173,193 / 120,408 / 9,601 | **172,530 / 121,178 / 9,601** |
| functions | 14,784 | 14,927 | **14,982** |
| seed bytes (fixpoint) | 5,916,548 | 5,954,946 | **5,965,733** |
| L2 self-compile fuel | 75,749,721,676 | 59,619,845,390 (measured today) | **61,904,280,945** |
| diderven check / build fuel | 48,290,741,306 / 6,282,852,143 | – | not read: no diderven tree on this box |
| plumb-shape main / tail fuel | 7,493,309,049 / 5,422,531,645 | – | **7,312,307,918 / 5,325,933,774**; RSS 316.2 / 315.9 MB |
| special-case helpers, (a) pin and position | 1,516 | 1,490 | **1,477** (emit_mono.vl 1,051, fn_split.vl 243, fn_flow_shadow.vl 183) |
| special-case helpers, (b) classifiers | 892 (3,971 call sites) | 818 (3,143) | **815** (3,075) |
| special-case helpers, (c) ExpCtx | 17 fields | 5 fields | **4 fields**: 128 writes outside `expCtx*`, 22 resets |
| whole-arena scans outside a pass | 67 (baseline file) | – | **46** live; the baseline file holds 52 |
| emitter pass rows | 47 (27 re-derive) | – | **43**; the re-derive split was a hand reading and is not re-graded |

The (c) row's counting rule is a field write `x.<field> =` outside the `expCtx*` helpers, a reset being
one whose value is `false`, `0` or `-1`. It reads 427 writes and 64 resets at 76a3eb8fd, where 4.1 hand-counted
458 and 83, and 146 and 26 at cb348241.

What moved since cb348241, across 93 commits that touch compiler/:

- Lines rose by 178 net. The largest deletions: #5396 (−312), #5394 (−233), #5392 (−181),
  #5462 (−161), #5368 (−149), #5442 (−132), #5416 (−119), #5454 (−112). The largest additions were
  elaboration and check work: #5448 (+242), #5345 (+227), #5441 (+213), #5424 (+151), #5360 (+108).
  The checker grew by 770 lines and the emitter fell by 663.
- The seed grew by 10,787 bytes (+0.18%).
- L2 fuel rose 3.8%, and not monotonically. Fixpoint samples: #5377 59.77 G, #5384 59.81 G,
  #5394 60.49 G, #5392 60.44 G, #5402 61.80 G, #5433 60.84 G, now 61.90 G. The largest single
  step is #5402 (+1.36 G, +2.2%). From 76a3eb8fd to cb348241 it fell 21%.
- Helpers (a) fell by 13, all in emit_mono.vl, where the mono deletions above landed. (b) fell by
  3 classifiers and 68 call sites; it was not read per commit. (c) lost a field (`rawNullRead`,
  #5385).
