# Medium 6 step 6.1: the resolve-time lowering runs once per program (2026-11-15)

Step 6.1 of `2026-11-15-medium6-lowering-design.md`.

## What changed

- **The three type-free PRE drivers move to `checkProgram` (`check_pins.vl`).** They are
  `intrinsicValuesWrap`, `hoistMatchScrutinees` and `annotateTyArgLambdas`. They used to run at
  the top of `checkProgramPass` (`check_program.vl`), so every re-walk ran them again over their
  own output: `checkProgramAgain` and `checkProgramResumed`'s pin rounds. Now they run once,
  before the first walk, and a re-walk starts from the lowered tree. Their imports move with them.
- **What stays in the walk:**
  - `parenNamesCollapse` already ran once, in `checkProgram`.
  - `tyParamSplitRun` needs `bindProgram`, so it stays.
  - The `ivLaneReads` refusal loop stays in each walk. The list is still filled once, and every
    walk raises its diagnostics.
- **The premise this tests:** the design note (§4) says a PRE pass that is not idempotent would
  show up here as a fingerprint difference. None did, so all three are idempotent over the corpus.

## Gate

- **Seeds:** A is a fixpoint built from `git archive fedd29c30`; D is a fixpoint built from this branch.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,329 programs, 0 different**.
- **L2:** byte-identical, with equal guest fuel (90,056,211,214).
- **Gates:** `regress.vl` reports no runs lost and `lint-self.sh` is clean.

## Lines

The compiler is **+9 / −11, net −2** over 2 modules.
