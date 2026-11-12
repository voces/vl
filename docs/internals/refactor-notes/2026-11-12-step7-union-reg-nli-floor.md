# Step 7 L6 (lane G, cut 2): `nliInferLet` is deleted behind a loud floor, 2026-11-12

The base is master `cf01f012`. `nliInferLet` was one of the two value-union registrations that
hand over no type (A/B site 66). It ran on an un-annotated `let x = null` whose hole the checker
had not filled (`letNullHoleFilledTy < 0`). It scanned the rest of the statement list for
`x = e`, and registered `<atom>|null` by spelling in the `nli` tables.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, carried two
`emitFail` markers in `nliInferLet`:

- **the registration:** the scan found a fill, so a `T|null` row was registered;
- **the control:** the hole had a checker-filled type, so the function did nothing.

Population: the whole sweep list (`sweep.vl list`, 24,170 programs). The 21 programs that spell an
un-annotated `let`/`var` initialised to `null` were checked with `--codegen`, along with 6 hand
controls.

| marker | hits |
| --- | --- |
| control (hole filled by the checker) | 17 |
| registration | **0** |
| registration, hand control `shadow.vl` / `shadow2.vl` | 1 / 1 |

The one shape that reaches the registration is the one `architecture-refactor-plan.md` recorded.
An outer `let x = null` is followed by a block whose own `let x = 1; x = 5` shadows it.
`nliScanStmts` does not stop at the inner declaration, so it read `x = 5` as the outer hole's
fill. The checker closes that hole as `null` (`letNullHoleUnfilled`), which is right: no write
reaches it. Master gave the outer binding an `i32 | null` box anyway.

## Changed

- `nliInferLet` is deleted, with the statement scan only it used (`nliScanStmts`, `nliScanStmt`,
  `nliScanBlock`) and the A/B site name 66.
- Its call is replaced by `nliHoleHasType`, a floor. It refuses loudly an un-annotated
  `let x = null` that the checker neither filled nor closed. No program in the census reaches it.
- The shadowing shape now lowers its outer binding as the `null` type. Its output is unchanged:
  `tests/cases/types/infer-null-hole-shadowed-by-inner-let.vl` pins it at function and module
  scope.

## Graded by output

| programs | master seed against candidate |
| --- | --- |
| the 21 census programs, 4 hand controls, the 2 shadowing controls | 27 run, 0 differ |

## Proof

- **Seed:** fixpoint, 6,735,476 → 6,734,853 bytes.
- **Locally:**
  - lint-self clean;
  - regress: no runs lost;
  - rep-fuzz exact;
  - check-filed-witnesses `--strict`: 4847 as filed, 0 moved, 0 output mismatch;
  - late-demands 8, at the baseline;
  - render-parse 12 / 40;
  - dead-exports: nothing new;
  - emitter-state-audit `--check` clean.
- **The full sweep:** CI's `sweep` label. The expected movers are the shadowing shape's bytes only.
