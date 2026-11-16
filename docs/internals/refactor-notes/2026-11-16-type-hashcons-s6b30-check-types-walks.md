# Type hash-cons stage 6b, tier 2: check_types.vl's reached walk limits (lane HASH), 2026-11-16

Five of the census's six reached `walk-limit` hits in `check_types.vl` end by a visited set or a
growing path. A revisit is a cycle and keeps the answer the limit gave. `check_types.vl` goes
16 → 11.

| census row | function | was | now |
| --- | --- | --- | --- |
| 265 | `tyHasHole` (`tyHasHoleAt`) | `depth > 8`, memoised per depth bound | one answer per type per `tyMutEpoch`; a type met while open answers a cut, which is not kept |
| 258 | `tyHasNullHole` | `depth` 6 from callers | types seen (`tyWalkEnter`) |
| 266 | `tyMentionsTyVarNamed` | `depth` 6 to 64 from callers | types seen |
| 264 | `tyContainsList` | `depth` 8 from callers | types seen |
| 260 | `tyTsGo` (`tyToTs`) | `depth > 64` | path of types being spelled; a revisit has no tree (-1), the node budget unchanged |

The three exported walks lose their depth argument, so their callers in 13 files drop it.

## `tySameAt` stays

`tySameAt` (row 270, `depth` 24) was converted to a path of compared pairs and measured, then
backed out. Self-compile fuel against master's own reading:

| variant | fuel vs master |
| --- | --- |
| path of pairs | +0.9% |
| path of pairs, leaves compared off the path | +1.2% |
| `tyHasHole`'s new memo alone | −0.2% |

`tySame` is too hot for a per-call path. A cost-neutral version, for example a cycle check only on
rows that can reach themselves, is a follow-up.

## Grading (fixpoint seeds, master `c46ba3394` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- Self-compile fuel: +0.3% on the baseline, against master's +0.5%.
- `walk-limit` baseline: 554 (`check_types.vl` 16 → 11).
- `scripts/emitter-state-audit.vl`'s STAMPED list and `scripts/memo-generation-rows.json`'s
  `tyHasHoleDepth` row follow the new memo.
