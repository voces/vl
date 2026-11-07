# Step 7: `letInitCellKind` deleted onto `letBindRepKind`, 2026-11-07

`letInitCellKind` was the type-blind ladder an un-annotated binding fell to when its typed claim
(`letBindRepClaims`) declined. It had two callers: `letCellKindGo`'s last rung, and the
captured-slot kind's niche test for an annotated binding. With `letIsStruct` gone (#6733), its
remaining rungs were `nulnone`, a narrowed scalar, `f64list`, `strlist`, `reflist`, `union`,
the record arm, a projection, `str`, `f64`, `closure` and the hole kind.

**Shadow.** At every call, the old answer against `letBindRepKind` (`repOfTy(letBindTy)`),
counted per let and phase through `clsCensusEnter`, over the 23,613-program census population.

| old → typed | calls | phase |
| --- | --- | --- |
| `i32` → `null` (no covered rep) | 223 | passes |
| `i32` → `null` | 8 | monomorphizing |
| `nulstr` / `strlist` / `str` / `f64` / `reflist` / `i64` → `null` | 28 | passes |
| `i32` → `nulmap` | 1 | passes |

There were 0 disagreements after monomorphize. Every pre-monomorphize one is a generic template
binding whose type is open. As with `letIsUnion` (`2026-11-07-step7-letinitcellkind.md`),
nothing reads a template's cell. `i32` is also the ladder's own fall-through and
`letCellKindGo`'s default, so `letBindRepKind(..) ?? "i32"` reproduces the 231 `i32` rows exactly.

**Deleted.** `letInitCellKind` is gone. `letCellKindGo` reads `letBindRepKind(..) ?? "i32"`,
and the captured-slot niche test compares `letBindRepKind` with the niche. Six helpers had no
other caller, so they went too: `letInitTyNarrowedScalarKind` and `letIsStringArray`
(`emit_classify.vl`), and `letInitProjKind`, `letInitProjNode` and `letInitHoleKind`
(`emit_local_scope.vl`), along with their now-unused imports. The dead-export budget stays at 0.

**Arena-scan budget.** `vl check --budget scripts/scan-budget-baseline.json` read 26 against a
baseline of 27 before this change. The entry that left is `emit_field_codes.vl`'s
`while vi < uVariants.length` (2 → 1, `--budget-why`). The baseline is rewritten to 26.

**Census.** `scripts/classifier-census.vl` now has 103 probed classifiers (6 post-only, 1
pre-only, 95 both, 1 uncalled). It had 105 before `letIsStruct` and `letInitCellKind` left.

**Proof.** Seeds are fixpoints (two refreshes, byte-identical).

| seed | bytes | sweep: same, output movers, bytes-only, runs lost, new traps |
| --- | --- | --- | --- |
| #6733 (`letIsStruct` deleted) | 6,475,579 | — |
| this PR | 6,473,605 (−1,974) | 23,613, 0, 0, 0, 0 |

Against master `fa202cbb` (6,473,613), the movers are #6733's: 7 bytes-only, none of them
output movers.
