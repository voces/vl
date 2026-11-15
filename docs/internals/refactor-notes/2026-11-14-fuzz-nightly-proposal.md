# The fuzz nightly, proposed: wall time at five sweep sizes and a filed-findings gate, 2026-11-14

Lane B. Net compiler lines: 0. Pin-helper delta: 0. The cron is in the diff; whether it is
enabled is the owner's decision.

## Wall time

Measured on this box: 4 cores, `--jobs 4`, a master fixpoint seed. One `fuzz-sweep.sh` per size
over the four legs plus row drafts, `--count 200` (400 cases a seed), depths 4–6. `voces/vl`
is public, so `ubuntu-latest` has 4 vCPU and 16 GB, the same core count as this box.

| seeds a leg | cases | wall | user+sys | unsound shapes | drafts |
| --- | --- | --- | --- | --- | --- |
| 2 | 3,200 | 17 s | 32 s | 0 | 0 |
| 5 | 8,000 | 29 s | 70 s | 0 | 0 |
| 10 | 16,000 | 43 s | 129 s | 0 | 0 |
| 25 | 40,000 | 152 s | 369 s | 7 | 4 |
| 50 | 80,000 | 318 s | 767 s | 16 | 12 |

- The four legs together cost about 3.3 s per seed.
- A row draft costs about 13 s per distinct finding: 155 s for 12, timed alone. At 50 seeds,
  drafting is half the wall time.
- A warm-cache setup adds 1–2 min.
- The proposed default is 50 seeds, an estimated 7–9 min a night.

## The gate

`fuzz-nightly.sh --filed FILE` reads `D<id><TAB>CLASS<TAB>SHAPE` lines.

- An unsound finding listed under a row that `ls.vl --status open` names is reported and does
  not fail.
- A finding listed under a closed row fails, because its defect is back.
- `fuzz-sweep.sh --gate-all` makes every leg gate.

Controls, with planted `seed_*.tsv` lines: a finding under open D16310 exits 0; one under
closed D16311 exits 1; the same finding without `--filed` exits 1. With the filed list as first
populated, every leg exited 0 on that run's own findings (4 + 2 + 3 + 7 filed), and without
`--filed` the plain leg exited 1.

## The filed list

The list the workflow reads, and the triage that populated it, are the separate fuzz-triage
refactor note of 2026-11-14.

## Dry run on master, 2026-11-15

The owner approved the nightly at `17 4 * * *`. A dry run on master `bded2f56d` (#8169's `--gen
all` oracle included) used the workflow's own arguments: 50 seeds, count 200, depths `4 5 6`,
`--gate-all`, `--filed scripts/fuzz-filed.txt`, `--jobs 3`. It took 1,939 s on a 4-CPU box.

- **Fuzz legs.** plain, multiobs and declared: 0 unfiled unsound findings. branching: 2
  unfiled INVALID-WASM findings, one shape at two positions, filed as D16398 with two
  `fuzz-filed.txt` lines. With those lines the leg has 0.
- **Oracle leg:** `oracle: 50000 cells, 46826 in subset (93.7%), AGREE 38908, COMPILED-BAD 7917,
  DISAGREE 1, SKIP 3174; 0 new disagreement(s)`. The one DISAGREE is in `known.txt`. 7,912 of the
  COMPILED-BAD cells are the higher-order generator's programs refused at emit (for example
  `monomorphize: unsupported argument type`), which the oracle reports and does not gate.

A red oracle leg now lists each new cell with the commands that regenerate and re-judge it
locally, copies its case into the artifact's `oracle/keep_new/`, and writes the cells to the job
summary. The fuzz legs already printed a `scripts/fuzz-vl.sh --seed … ` repro and a keep dir.
