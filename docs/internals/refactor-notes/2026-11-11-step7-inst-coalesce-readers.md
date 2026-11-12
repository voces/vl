# Step 7 inst: the three `??` result readers ask `nodeTyAt`, 2026-11-11

Lane w321, from lane w320's diagnosis of a `??` inside a generic instance.
`coalesceResultUnionName` and `coalesceResultIsBox` (`emit_start_block.vl`) and
`coalesceMapReadJoins` (`emit_classify.vl`) read `nodeTyInOf`. That returns the template's raw
type whenever it has no type variable, so an instance that records its own type for the node
went unasked. They now read `nodeTyAt(ix, fnIx)`, which asks the instance wherever it recorded the
node. This is necessary for w320's case but not enough: the union row that only the instance
names is w316's.

## Measured

A scratch probe compared the two reads at each call, over all 7,732 `tests/cases` programs and
every distilled `named/` cell.

| | calls | programs |
| --- | --- | --- |
| `coalesceResultIsBox`, the reads agree | 670,963 | — |
| `coalesceResultIsBox`, the reads differ | 939 | 559 |
| `coalesceResultUnionName`, the reads differ | 0 | 0 |

The largest classes of difference were these. A record read `{s: null, n: i32}` at the instance
where the template says `R`. A list read `null[]` or `string[]` where the template says
`(string | null)[]`. A number read `f64` or `i64` where the template says `i32`. A hole function
read `(_) => _` at module scope where the column holds a pinned `(i32) => i32`.

## Proof

- **Bytes.** The 559 programs where the reads differ, built with an L1 seed of master `b78a91c9`
  and with this candidate's, both from the same seed: 559 of 559 byte-identical. So no
  differing read changes a decision in this corpus. The probe ran at each function's entry, before
  its `??` and union tests, so many of the differing calls never use the type.
- **Locally:** one refresh on master `b78a91c9`. `cases_wasm` passes (7,440). `regress.vl` reports
  no runs lost. These pass: lint-self with its budgets, dead-export, render-parse, kind-ladder sets,
  `mono-tyaram-grid.sh`, check-filed-witnesses `--strict`, seed-size (+0.5%) and late-demands (6).
