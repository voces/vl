# Relate B0: one entry owns the fit question's quiet bracket, 2026-11-15

Review medium 3, design `2026-11-15-relate-recorder-design.md`. This is the first step of the
revised order. A fit question that wraps exactly one `assignableExpr` now calls
`fitsExpr(srcExpr, srcTy, dstTy)`, and that function owns the `inferQuiet` / `quietDepth` bracket.

## Why this step first

The design's A1, which defers the contextual-type and rep stamps behind a plan overlay, buys nothing
for the brackets, for two reasons:

- `stampsStand()` is already false whenever `inferQuiet` is set, so a quiet ask writes no stamp.
- The rollback-assertion census (`deno run -A scripts/probe-rollback-census.ts tests/fixtures
  tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named`, 20,370
  programs on the `414f937dc` seed) finds that the three fit-question probes it covers leave no row
  in any of the 145 tables. `argCstrFitsAt` ran 2,933 times in 199 programs, `dstTyParamAdapts`
  341 times in 116, and `validateCompArgCstr` 37 times in 13.

So the quiet mode already behaves as a non-recording `relate`. The cost is that the mode is spelled
out at each site.

## What moved

| site | before | after |
|---|---|---|
| `assignableExprIn` null-hole and list-field re-ask | 6-line bracket | `fitsExpr` |
| `argCstrFitsAt` | bracket inside `prbEnter`/`prbLeave` | `fitsExpr` inside the same probe |
| `holeLitAdopts`, `holeNumLitAdopts` | 6-line bracket each | `fitsExpr` |
| `eqLitDeliver` (`check_operators.vl`) | bracket, then the loud ask | `fitsExpr(…) && assignableExpr(…)` |

The rep-stamp re-ask at `assignableExprIn`'s `rtStamp` keeps its bracket, because the bracket also
covers `listArmOfUnionFit`. Elaboration capture tests `quietDepth == elabCapQuiet`, so that walk's
nesting depth must not change.

## Measurements

- `phase-state-census.vl -- --list`: the `inferQuiet` hidden scopes go from 20 to 16 (five
  removed, `fitsExpr`'s one added). The `hidden`, `cross` and `surface` totals are unchanged at
  175 / 587 / 2,762. `--check` passes.
- Identity: the old seed (master `ab210efa`) building this tree, and this tree's seed building
  itself, give the same 6,395,162 bytes (fixpoint). `probe-rollback-census.ts --fingerprint` over
  the 20,370 programs above, with the master seed and with the new seed, diffs empty: the same rc,
  diagnostics hash and emitted-bytes hash for every program.
- Net compiler lines: −17 (19 added, 36 removed). `emit_mono.vl` functions: 908.
