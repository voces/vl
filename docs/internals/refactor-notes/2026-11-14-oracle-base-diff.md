# The oracle step judged against the base and the corpus expectation (2026-11-14)

Follow-up to [the oracle design](2026-11-14-oracle-design.md). After #8116 merged, the oracle step
in `sweep.yml` failed on every `sweep`-labelled PR with 5 "new" disagreements:
`d16209_map_single`, `d16209_map_sum`, `dord022`, `dord023` and `dord025`. The cause was on
master, not in those PRs.

**What they were.** All five are graded `runs but wrong value` in
`scripts/silent-sweep/distilled/baseline.jsonl`:

- the d16209 cells are D16209;
- the three `dord` cells are from the declaration-order clause-1 set (#8068).

In each one the oracle printed the cell's manifest expectation and the compiled program did not.
So they are known compiler wrong values, not oracle bugs and not new findings. `recording` mode
compared the oracle with the compiled stdout hash only. It never read the manifest, so "the
oracle and the expectation agree against the compiler" came out as DISAGREE. The `distilled`
mode already handled this case: its judge was fixed in #8116, but `recording` mode never got
the same fix.

**Why #8116's CI did not catch it.** The oracle step runs only under the `sweep` label, and #8116
was not labelled. The only end-to-end check of `recording` mode was local, on a recording of the
pre-merge corpus (11,931 cells). The five cells reached the corpus in a later master merge.

**The change.**

1. `recording` reads both distilled manifests. If the oracle prints a cell's expectation and the
   compiled stdout differs, the cell is COMPILED-BAD, not DISAGREE. A wrong value against the
   expectation is the sweep diff's to gate.
2. `recording --base <base.jsonl>` judges the base recording the same way. A head disagreement
   that the base already had (same cell, verdict and compiled stdout and outcome) is reported
   "(on the base too)" and does not fail. `sweep.yml` passes `out/base.jsonl`. So a cell that is
   new on master can no longer turn an unrelated PR red; only a disagreement the PR introduces
   does.

**Measured.** On master's seed, over a fresh 12,013-cell recording:

- before the change: 5 new;
- after it, with and without `--base`: 0 new;
- the five cells are now COMPILED-BAD, and D16370's three cells stay `(known)`.

The step takes 1.6 s, or 2.6 s with `--base`, against a 30 s budget. In a planted recording where
one cell's compiled stdout hash is altered, that cell is surfaced. With the same recording passed
as the base, it is labelled `(on the base too)`.
