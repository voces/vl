# Step 7, lane H: `--budget` baselines store codes, not totals, 2026-11-13

Every `vl check --budget` baseline stored a `total` line beside its per-file
rows, and every PR that lowered a count edited it.

- **Conflicts:** any two lowerings conflicted on that one line, even when their
  files differed. #7819 alone went through four merge-and-regate cycles.
- **A loosened ratchet:** two lowerings of the same total by one (20 → 19 in
  both) merged as one identical edit, leaving 19 where 18 was due.

## The change

- **The total is derived.** `budgetLoad` sums each code's file rows. The
  pass/fail verdict was already per file; the total fed only the "below
  baseline" note and `--exempt-codes`, which now read the derived sum.
- **`--write-baseline` writes `"codes": [...]`** in place of `total`: the
  budgeted codes, a line that changes only when a code is added. A legacy
  `total` still loads, but only its keys are read.
- **All nine baselines migrate** mechanically (byte, comment, export, interp,
  ladder, render-parse, scan, sentinel, unused): each `total` line becomes its
  `codes` line. Concurrent lowerings now touch different per-file lines and
  merge on their own.

## Proof

- Every budget passes on master: the seven lint ratchets in `lint-self.sh`, plus
  render-parse and dead-export over their reports.
- A baseline row lowered by hand below the tree (`emit_classify.vl` `ty-render`
  3 → 2) fails `--budget`, exit 1.
- `vl_budget_mode_test`, `vl_comment_budget_test`, `vl_export_budget_test` and
  `vl_render_parse_budget_test` read the derived sum, and the mode test now
  asserts that a write stores `codes` and no `total`. `deno task test` passes.
