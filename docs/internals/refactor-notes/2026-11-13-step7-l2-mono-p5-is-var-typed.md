# Step 7 L2, mono, P5: an instance's `is T` banks its tested type, never its spelling (2026-11-13)

Lane D. Base `origin/master` at this branch's cut. The `recordClonedIsVarTy` site (P5) in lane H's
render-parse census, reached via `monoSubstIsExpr`.

## Cut

`monoSubstIsExpr` banked the tested type of a cloned `is T` in three steps:
- `recordClonedIsVarTy(nx, variant)`, which is `nameToTy` of the substituted spelling;
- the substituted type, but only for a `$fnsig` key;
- the elaboration's own check (`elabIsPatTyIn`), which overwrites both where it closes.

The spelling parse and the signature-key branch are replaced by the substituted type
(`substTyDeep(isVarTyIxOf(ix), monoFoldSubN, monoFoldSubT)`), still overwritten by the
elaboration's check. Where neither closes, a loud floor fires: "an `is` test at an instance has
no closed tested type". `recordClonedIsVarTy` is deleted.

## Decision table

From an `MPROBE` build over the 24,070-record population:
- 55 programs (244 decisions) reach the parse with no `#anon` list type.
- In every one, the elaboration's check is closed and overwrites the parsed type.
- The parse never decided anything.
- No program reaches the new floor. A forced control build (elaboration rung off) fires its
  message on `tests/cases/generics/is-type-parameter-itself.vl`.

## Byte comparison

Master vs PR over every program reaching `monoSubstIsExpr`'s `is` rewrite, plus
`is-type-parameter-itself.vl`: **56 of 56 SAME**.

## Census

The census entry `recordClonedIsVarTyIx(nodeIx, nameToTy(name))` leaves the baseline. It is the
only entry this PR lowers, in #7764's re-derived structure.
