# Three clause-1 regressions of closed rows, 2026-11-14

Lane N. Lane D's grading found 17 check-clean cells that are silent or trap in four matrices whose
rows read closed: D10081's two templates (7 + 7), D5062's (2) and D10122's (1).

## Bisect

Fixpoint-equivalent seeds (each commit's compiler built twice from master's fixpoint seed) over
the 3,547 first-parent commits since D10081's close, `a65d2292d`:

- `afdae0405` (#5774, a list literal of a generic written a closed function takes that
  signature) broke D10081's and D10122's cells together. Containing its closing to literals whose
  elements name functions (D16280, which lane S filed the same day) runs the D10122 cell; the D10081 cells, re-bisected with that
  patch applied at each commit, next break at `df176771e` (#5881) as a trap and are silent on
  master (D16270).
- `733972162` (#6555, mono's planner reads the elaboration's literal roots) broke D5062's two map
  cells (D16271).

## Grades, `--before` master `c522f8dd1` fixpoint, `--after` this branch's fixpoint

| template | before | after | runs → not-runs |
| --- | --- | --- | --- |
| fn-value-generic-listed-twice-written | 39 of 46, 7 silent | 46 of 46 | 0 |
| fn-value-generic-listed-twice-written-open | 11 of 46, 7 silent | 18 of 46 | 0 |
| written-fn-binding-inferred-return | 62 of 64, 2 silent | 64 of 64 | 0 |
| fn-value-generic-list-index-written-open | 45 of 46, 1 trap | 46 of 46 | 0 |
