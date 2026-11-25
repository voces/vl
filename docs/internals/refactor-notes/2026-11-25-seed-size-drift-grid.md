# Seed size: where the +3.0% since the #9775 baseline came from (lane INFRA, 2026-11-25)

The seed-size baseline written by the #9775 fold (7,275,905 bytes) reached the +3% gate on
2026-11-25. COV-UNION's #10145 rewrites it from a fixpoint of its merged tree (7,496,875 bytes).
This note records where the rise came from, measured on a coarse grid. The coordinator ruled
measured intervals sufficient under +3%, and asked for a bisection to single PRs only if a
cumulative rise passes +3% after the refresh.

The rise is IR coverage while legacy and the IR coexist. It is spread over the 273
compiler-touching merges since a08bb0250, with no interval standing out.

## Measurements

Each figure is a fixpoint seed size (L2: the tree's compiler, built by a fixed seed, then built
by itself). The first point reproduces the old baseline exactly.

| interval (compiler-touching merges) | at end    | rise     | share |
|-------------------------------------|----------:|---------:|------:|
| #9775 a08bb0250 (the baseline)      | 7,275,905 |          |       |
| → #9837 7a0704e1b (56)              | 7,317,450 | +41,545  | 19.0% |
| → #9912 2ae11435a (56)              | 7,354,549 | +37,099  | 17.0% |
| → #9978 37e9268be (56)              | 7,391,378 | +36,829  | 16.9% |
| → #10078 4969acc26 (56)             | 7,450,718 | +59,340  | 27.2% |
| → #10140 e5c0ae64f (49)             | 7,492,837 | +42,119  | 19.3% |

Master at e5c0ae64f stood at +2.98%. #10146 (the IR decline record) adds 2,436 bytes,
about 0.03% on the new baseline.

## Trajectory

The I8 dress rehearsal (#10096, regeneration 5) reached a fixpoint at 7,299,635 bytes, against
master's 7,488,748 at 7ddd7d14: −189,113 bytes (−2.5%). On the new baseline, I8 should land near
7.30 MB, about −2.6%.

## Method

`seedsize-one.sh <sha>` extracts each commit's `compiler/` and `std/` with `git archive`. It
builds `compiler/entry.vl` with a fixed seed (L1), then builds it again with L1 (L2), and reads
L2's size. It runs one build at a time: three heavy jobs at once on the 4-core box drove the load
to 22 and set off OOM kills.
