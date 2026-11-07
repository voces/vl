# Scoreboard reading at cb348241

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §4.1a on 2026-11-07; its `§` references are to that file.

### 4.1a Reading at cb348241 (2026-10-31)

Same commands as 4.1; the baseline above stays as the reference.

| Metric | 76a3eb8fd | cb348241 |
|---|---|---|
| compiler/*.vl lines | 371,600 (229 files) | **366,524** (238 files) |
| emitter / checker / fn_* lines | 188,533 / 112,825 / 9,594 | **173,193 / 120,408 / 9,601** |
| functions | 14,784 | **14,927** |
| seed bytes | 5,916,548 | **5,954,946** |
| special-case helpers, (a) pin and position | 1,516 | **1,490** (emit_mono.vl 1,064, fn_split.vl 243, fn_flow_shadow.vl 183) |
| special-case helpers, (b) classifiers | 892 (3,971 call sites) | **818** (3,143 call sites) |

The emitter fell by 15,340 lines and the checker grew by 7,583: facts moving to their producer, as §3 intends.
