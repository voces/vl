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
