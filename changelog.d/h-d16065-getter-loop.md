## Type system (Track A)

- **A getter may loop over a constant range (D16065).** The getter half of the owner's
  2026-09-22 ruling (D-Q2). A `for i in <a> until|to <b> [step <s>]` whose ends and step are
  literals or `const`s, and whose variable the body never writes, is admitted in a getter body.
  It costs its trip count times its body, each trip at least one step, within the 16-step budget.
  `break` and `continue` leave it. `while`, `for … in` and any other range stay refused, and the
  sentence now reads `a getter may loop only over a constant range`. Together with D2065, a getter
  passes its loop variable as a literal-union index (the fixture's `lanes`), the shape of the
  amendment's four-lane reduction.
