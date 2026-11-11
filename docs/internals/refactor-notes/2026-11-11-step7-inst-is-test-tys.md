# Step 7 inst: each instance banks its own `is`-test type, and the cloned test reads it, 2026-11-11

Lane w321. D15710: a generic template's `is` test is one node every instance shares. The checker
writes its types to `isVarTyIx` and `isPatTyIx` on each instance's re-check, so the column
holds the last instance checked. `monoSubstIsExpr` could not ask the clone's type by type, so it
read the substituted spelling.

## Changed

- `checkIsExprNode` and the `match` pattern check note the pattern type into the
  elaboration's capture (`elabCapIsNote`, `check_elab_cap.vl`). The elaboration banks it per
  instance key beside `elabNodeTys`, as `elabNodeIsPats`, read by `elabIsPatTyIn(ix, k)`.
- `monoSubstIsExpr` banks `elabIsPatTyIn(ix, elabWalkTop())` on the minted test. The spelling
  still decides whether the test names a type at all. An encloser's parameter left unbound keeps
  its refusal (`generics/unbound-type-param-reaching-is-stays-unbound.vl`, D4551), though that
  instance's record holds the default `i32`.

## Measured

The probe was a scratch compiler, never refreshed into a seed. It sent one line per
`monoSubstIsExpr` reach out through the late-demands channel. It was validated first on D15710's
repro. There the column read `boolean[]` at `len<string>`, and the record read `string[]`.

| over all 7,732 `tests/cases` programs | reaches | programs |
| --- | --- | --- |
| the instance's record equals the type the spelling banks | 173 | 27 |
| the column differs from the instance's record (D15710's class) | 42 | — |
| no record for the instance key | 0 | 0 |
| no instance key | 0 | 0 |
| record, but the spelling names no type (the D4551 refusal, kept) | 1 | 1 |

## Proof

- **Bytes.** The 28 programs that reach the site were built with an L1 seed of master `069de8a3`
  and with this candidate's L1 seed, both built by the same seed. 28 of 28 are byte-identical
  (module bytes plus diagnostics). D15710's repro prints `2` then `3`.
- **Locally:** one refresh after merging master. `cases_wasm` passes (7,440). `regress.vl`
  reports no runs lost; its two other movements read the same on master's seed. These pass:
  lint-self with the comment, ladder, sentinel and scan budgets, dead-export, render-parse,
  kind-ladder sets, `mono-tyaram-grid.sh`, `vl_probe_rollback_test.ts` (`elabCapIsPat` is
  classified), check-filed-witnesses `--strict`, seed-size (+0.5%) and late-demands (6).
  CI's sweep grades the full population.

## Left

`monoReIsExpr` still copies the column. It re-parents a test whose spelling names no type
parameter, from four passes, not all of them under an instance walk. Lane w311's list-literal
records are the next half of this lane.
