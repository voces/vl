# ci-cost: the plumb-shape metered build runs with the seed's grow policy off, 2026-11-11

Option (a) from `2026-11-11-ci-cost-rss-gc-growth.md`: `scripts/plumb-shape-cost.vl` sets
`VL_COMPILE_GC_GROW=off` on its one metered build (the build that gives fuel, peak RSS and the
rung facts). The setting is in the script, not in `ci.yml`, so a local run and CI measure the same
thing. The CPU-timed builds keep the shipped policy. No host change.

## Before and after, same box, same seed

The box is a 4-core Xeon @ 2.10GHz. The seed is a fixpoint of `42a93061`: two
`refresh-compiler.sh` runs gave byte-identical output. The host was built from that tree.
Each figure comes from `--check`; CPU is not graded on this host.

| metered build | runs | main peak RSS | main gc | tail peak RSS | tail gc | main fuel |
|---|---|---|---|---|---|---|
| policy on (default 75%) | 5 | 438 MB every run | 11 collections, peak live 120,253 KiB | 317–318 MB | 5, 81,423 KiB | 9,068,527,234 |
| `VL_COMPILE_GC_GROW=off` | 6 | 319.5–320.1 MB | 16 collections, peak live 120,018 KiB | 317.3–317.8 MB | 5, 81,423 KiB | 9,068,527,234 |

- **Fuel did not move.** The guest instruction count is identical with the policy on or off.
- **Policy on, this box is in the high mode on every run.** CI's runners land in the high mode
  on some runs and the low mode on others.
- **Policy off, the reading has one mode.** The spread is 0.6 MB on main and 0.5 MB on tail.

## The baseline was not rewritten

With the policy off, the readings already sit on the committed baseline: main 318.0 MB
(+0.5 to +0.7%) and tail 317.7 MB (−0.1 to +0.0%). The baseline was evidently taken in the
low mode.

A `--write-baseline` from this box would also rewrite fields this lane must not touch:
- `cpu_host` (the baseline host is an i9-12900KF), so CPU grading would move to this box;
- the CPU figures;
- the fuel figure, which is 1.0% under today's reading.

So the RSS figures stay as they are. A refresh, if one is wanted, is a quiet-box run on the
baseline host.

## What the gate no longer sees

Peak RSS under the shipped grow policy is no longer graded. A change to `SeedGcHeadroom` or
`SEED_GC_GROW_PERCENT` does not move this ratchet. The policy itself is guarded by
`tests/vl_seed_gc_headroom_test.ts`, which this change does not touch.

With the policy off, the heap doubles only once a collection cannot fit an allocation. The
policy doubled it at 75% of a semispace. RSS still steps when the program's live set crosses a
semispace, so a live-set growth that crosses it reds the gate. A smaller growth that stays
inside the semispace does not move RSS.
