# IR claim early-out: a claim's build ends at the first node of an unclaimed family, 2026-11-17

Lane IR2. Claiming builds every function to decide its claim, which cost +0.67% L2 fuel (#8947).
A coverage step then costs fuel even where it ships nothing: under A1 (#8945) a function whose
first miss was its list literal built on to its next miss, though `claimable` refuses any `list`
node while `list` is not claimed (+0.48%). This is the design's "pre-scan pays back the claim"
follow-up (§10), taken at the builder's one node constructor.

## What landed

- **`irClaimFn` sets `ibClaimBuild` around its own build**, and `irBNode` misses
  (`unclaimed family`) at a node `familyClaimed` refuses. The decision is `claimable`'s own, so no
  function's claim changes; its build only stops sooner.
- **The shadow modes are untouched.** Modes 1, 2 and 4 never reach `irClaimFn` (`ibArmed`), so
  they still build every function whole to report coverage, matches and the blocker census. Mode
  3 takes the same early-out, under its own wider family set.

## Readings

Each tree is built from its own fixpoint seed and its own checkout: master 694cc89d, and this
change.

| reading | master | this change |
|---|---:|---:|
| L2 self-compile fuel | 97,030,464,672 (+0.8% on 96,215,502,116) | 96,420,879,693 (+0.2%), **−0.63%** |
| self-compile claimed (`--claims`, `$VL_IR_SHADOW=5`) | 2,190, 0 fell back | 2,190, 0 fell back |
| corpus claimed | 10,868, ok | 10,868, ok |
| claimed self-build | its fixpoint | its fixpoint |
| armed self-build (mode 1) | byte-identical, 6,352 covered, 6,350 matched | the same |
| self-compile rows, modes 2, 3 and 4 | – | identical to master's, row for row |
| corpus shadow (mode 1) | 25,061 covered = matched | the same |
| corpus blocker census (mode 4) | – | identical output |
| mode 3 self-build | byte-identical | byte-identical |
