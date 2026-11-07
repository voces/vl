# Scoreboard reading at b9f2a457f (afternoon)

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §4.1c on 2026-11-07; its `§` references are to that file.

### 4.1c Reading at b9f2a457f (2026-11-01, afternoon)

Same commands and box as 4.1b, nine hours and 129 commits later (114 of them touch compiler/).

| Metric | 2d9c02fc8 (4.1b) | b9f2a457f |
|---|---|---|
| compiler/*.vl lines | 366,702 (238 files) | **368,372** (239 files) |
| emitter / checker / fn_* lines | 172,530 / 121,178 / 9,601 | **173,413 / 121,750 / 9,802** |
| functions | 14,982 | **15,083** |
| seed bytes (fixpoint) | 5,965,733 | **6,003,573** |
| L2 self-compile fuel | 61,904,280,945 | **58,741,013,921** |
| plumb-shape main / tail fuel | 7,312,307,918 / 5,325,933,774 | **7,077,967,937 / 5,159,264,911**; RSS 312.4 / 311.9 MB |
| special-case helpers, (a) pin and position | 1,477 | **1,480** (emit_mono.vl 1,054, fn_split.vl 243, fn_flow_shadow.vl 183) |
| special-case helpers, (b) classifiers | 815 (3,075 call sites) | **819** (3,011) |
| special-case helpers, (c) ExpCtx | 4 fields, 128 writes, 22 resets | **1 field** (`litUnion`), 49 writes, 8 resets |
| whole-arena scans outside a pass | 46 live (baseline 52) | **27** live, baseline 27 |
| emitter pass rows | 43 | **43** |

What moved:

- **L2 fuel fell 5.1%.** The claw-backs were #5520 (nliAtomOfExpr's name index, −3.9%), #5510 (the
  nul-atom memo, −0.88%) and #5518 (the lazy value-reach index, −0.77%). At efc86b3b4 it read
  58,086,244,007, which is the tripwire baseline (#5531), so later landings put back about 1.1%.
  That rise was not read per commit.
- **Plumb fuel fell 3.2% (main) and 3.1% (tail).**
- **(c): ExpCtx lost three fields** (`nulBool`, `nulLitUnion` and `nulString`, with every write to
  them) in #5571. Only `litUnion` is left.
- **Arena scans went 46 → 27.** #5520 removed one. #5525 allow-listed 13 once-per-module scanners,
  which held 18 findings. Only `nliAtomOfExpr` carried fuel: the other scans each read ≤0.27% of
  either profile.
- **Lines rose by 1,670 net.** The largest deletions were #5571 (−256), #5492 (−159), #5486 (−101)
  and #5473 (−81). The largest additions came with union-arm reference rows: #5584 (+279), #5553
  (+142), #5574 (+135), #5538 (+131) and #5479 (+122). The seed grew by 37,840 bytes (+0.63%).
