# The fuzz nightly, proposed: wall time at five sweep sizes, a filed-findings gate, and the triage that starts it green, 2026-11-14

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
closed D16311 exits 1; the same finding without `--filed` exits 1. Over the 50-seed run's real
findings with the populated list, every leg exits 0 (4 + 2 + 3 + 7 filed); without `--filed` the
plain leg exits 1.

## Triage of the 50-seed run

16 unsound shapes, 12 distinct cases. Each case was ablated. Grouped by the ablated mechanism:

| mechanism | row | shapes | decisive ablation |
| --- | --- | --- | --- |
| an un-annotated lambda's result is built at its body's type | D16310 (open) | 12 | annotating the lambda's result runs |
| an all-`null` list at a union whose list member holds `string \| null` or a nullable function | D16314 (new, loud) | 2, as the second face of D16310's argument-position witness | `["x"]`, a scalar or record element, or `\| null` as the other member, runs |
| a map value of a nullable function returning a literal union has no rep | D16315 (new) | 1 | `i32 \| string` result, or a non-nullable value, runs |
| sibling record literals, one holding an all-`null` list of nullable lists | D16316 (new) | 2 | either sibling alone, or the records as `const`s, runs |
| narrowing a union to a function member nothing builds, then calling it | D16317 (new) | 1 | building any value of the member runs |

Lane K's branch `lane-k-f-singletons` (`298c9c4a1`), built to a fixpoint and run on the twelve:
- it closes five of D16310's cases (map store, `??` default, record field, plain `return`,
  the trap faces);
- the argument-position case reaches D16314 instead of running;
- two spellings stay invalid. A lambda returned into a union that holds its function type
  (`fz2_a_ret_union`) fails, and so does a delivered result with a literal-union list member
  beside a list member (`fz2_a_lit_list`; it runs with `string[]` in place of the literal union,
  `fz2_a_lit_list_string`).

The cells are named set `fuzz-2026-11-14b`: 16 cells, witnesses and the neighbouring spellings
that run. The shapes are listed in `scripts/fuzz-filed.txt`: 18 lines, because the
argument-position shapes are listed under both D16310 and D16314.
