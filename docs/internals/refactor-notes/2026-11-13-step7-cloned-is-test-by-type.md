# Step 7: a cloned `is` test keeps its elaborated type, 2026-11-13

Lane F's opaque-label instrument (`$VL_OPAQUE_SNAMES=1`) lost one run that F handed to lane B:
`distilled/named/d2781_run_generic_pattern.vl`. Armed, it refused with "`is` names a type that is
not a union variant".

## Mechanism

- In the instance `f<string|i32>`, mono clones `w is {a: T}` (`monoSubstIsExpr`).
- `recordClonedIsVarTy(nx, variant)` resolves the substituted spelling with `nameToTy`. Under
  opaque labels that spelling does not parse, so the clone's tested type stays unset.
- The elaborated rung, `elabIsPatTyIn(ix, elabWalkTop())`, already holds the concrete type. But
  it recorded only when the spelling had resolved, or when the spelling carried a signature pin.
- `emitIsTestVariant` then found no tested type. The arm row itself existed.

So this was not a variant found by name. It was a type gated on its spelling parsing back.

## Change

The elaborated type is recorded whenever it is concrete (`rec >= 0 && !tyHasTyVar(rec)`). An
encloser's parameter left unbound still has a type variable, so it is still not recorded.

## Measured

Base: master at e5493554a.

| instrument | base | this change |
| --- | --- | --- |
| d2781 armed (`$VL_OPAQUE_SNAMES=1`, host from current source) | emit refusal | `true` / `false` |
| full sweep, unarmed (24,203 programs, fixpoint seeds on both sides) | — | 24,203 same; 0 bytes-only; 0 runs → not-runs; 0 new traps |

This removes one of the runs lane F's instrument lost (d2781). Those left are F's own: D15042,
the arm-at-instance case, and d15296.
