# Scoreboard baselines (76a3eb8fd)

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §4.1 on 2026-11-07; its `§` references are to that file.

### 4.1 Baselines (76a3eb8fd)

| Metric | Today | Population and source |
|---|---|---|
| compiler/*.vl lines | **371,600** (229 files) | `wc -l compiler/*.vl`; 250,411 at 20fa382fe |
| emitter (emit_* + wasmEmit) / checker (check*, typecheck*, ...) / fn_* lines | 188,533 / 112,825 / 9,594 | same |
| functions | 14,784 | `^(export )?function` |
| seed bytes | **5,916,548** | `build/vl-compiler.wasm`, L2 output; baseline 5,758,206, so +2.75% (the bar is +3%) |
| L2 self-compile fuel | **75,749,721,676** | `VL_FUEL=1`, one run; real 16.59 s, peak 702,142 KiB |
| diderven `vl check src` fuel | **48,290,741,306** | no compile cache; "Found 0 errors, 3 warnings."; real 4.98 s |
| diderven `vl build src/game.vl` fuel | **6,282,852,143** | `--initial-memory=9MiB --max-memory=64MiB`; 584,550 bytes |
| plumb-shape main / tail fuel | **7,493,309,049 / 5,422,531,645** | `plumb-shape-cost.vl --check`: "plumb-shape cost ok"; RSS 314.70 / 314.50 MB |
| **Special-case helpers, (a) pin and position** | **1,516** | functions in emit_mono.vl (1,086) + fn_split.vl (243) + fn_flow_shadow.vl (187) |
| **Special-case helpers, (b) classifiers** | **892** (3,971 call sites) | `scripts/rep-classifier-census.vl --summary` |
| **Special-case helpers, (c) ambient hints** | **458** field writes (83 resets) | ExpCtx field writes outside helpers |
| whole-arena scans outside a pass | 67 | `scripts/scan-budget-baseline.json` |
| emitter pass rows that re-derive | 27 of 47 | emit_sections.vl:7974 |
| A1 open rows | 52 (broad A 65) | §1 classifier |
