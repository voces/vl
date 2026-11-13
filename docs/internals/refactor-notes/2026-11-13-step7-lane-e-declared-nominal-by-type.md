# Step 7 D6: `tyIsDeclaredNominal` asks the type, 2026-11-13

This is lane E's work. Lane F's walk union test reads this predicate.

`tyIsDeclaredNominal` (emit_shape_intern.vl) decides whether the function-type shape walk keys a
type by its declared name. It is read at the value-union arm and the inline-record arm of
`internFuncTypeShapesTyGo`. It used to render `tyToNominalName(ty)` and look the result up in
`cUserTypes` or `nameIsGenAppDecl`.

## Changed

It now asks three typed readers:
- `structNameOfTy` for a declared struct;
- `genAppNameOfTy` for a finite generic application (it declines a cyclic one, as the name check
  did);
- `unionAliasDeclNameOfTy` for a union alias, unless `numLitUnionBaseTy` names a base scalar.

Contract for the carve-out: a numeric literal union has no alias identity, because its members
are plain numeric values whose atom is the base scalar. A string literal union keeps its alias
name as its atom. A brand (`nomNameOfTy`) is not a declaration the walk keys by name, so there
is no brand leg.

## Probe

The probe used a scratch compiler, never refreshed into a seed. It computed both forms and
raised a distinctive `emitFail` on any disagreement. A control (the probe forced on) fired on a
function-type program. The population was the sweep's 24,205 programs.

| candidate | disagreeing programs |
| --- | --- |
| struct ∨ union alias ∨ generic application ∨ brand | 5 (4 numeric literal-union aliases, 1 branded string) |
| struct ∨ generic application | 119 (all value-union or string literal-union aliases) |
| struct ∨ generic application ∨ (union alias ∧ not numeric literal union) | **0** |

`structElemArrayLowerable` keeps #7738's `structNameOfTy` test. The generic-application leg would
return true before `funcTypeShapeLowerable` runs, which is a change this probe did not grade.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `a7479725` against the candidate: 24,206 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
