## Infrastructure (Track F)

- **The distilled index refuses an ungraded cell:** `index.vl --check` and `regress.vl` exit 2 on
  a `cells/` or `named/` cell whose `manifest.json` names no expected stdout, which the grader
  used to skip without a word.
