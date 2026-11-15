## Infrastructure (Track F)

- **Triage of the arith fuzz's unexplained cells on seeds 31-100.** Of 26 cells (3 UNSOUND,
  23 DISAGREE):
  - 16 were oracle gaps, now fixed with smoke pins.
  - 6 are compiler-side: new rows D16670 (a float constant's `as!` folds as a constant) and
    D16671 (unary `-` over a literal join does not adopt), and three faces of D16498.
  - 2 are still open.

  The fixes surfaced 3 new cells: 2 more oracle gaps, now fixed, and 1 more D16498 face. All
  3 UNSOUND cells were oracle gaps, so no clause-1 bug came from them.
