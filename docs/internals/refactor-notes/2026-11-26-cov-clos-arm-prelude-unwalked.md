# A lone nested `if` arm has no prelude to walk (2026-11-26, lane COV-CLOS)

## Defect

`ifShapeWhyOf` (behind `ifExprShapeWhy` and `ifExprPlainWhy`) asks `armPreludeUnwalkedDecl` of
every arm. The collect pass marks only a multi-statement arm (`markArmPrelude`), because only that
arm has a prelude. For an unmarked arm, `armPreludeUnwalkedDecl` returned `firstLocalDeclIn`,
which recurses into nested blocks. An arm whose one statement is another `if`, with an inner arm
that binds a local, has no prelude of its own and is never marked. Yet it answered with the inner
local, so the shape check read "arm prelude unwalked". The inner `if`'s own arms are walked and
marked by the collect pass. `emitIfArmOpen` already checks only multi-statement arms, so legacy
was never refused; the IR, which asks the shape check, missed (`expression if arm prelude unwalked`).

## Fix

`armPreludeUnwalkedDecl` returns -1 for an arm of at most one statement, which is `emitIfArmOpen`'s
own guard. This is a shared-plan change (`wasmEmit.vl`), so its claims-off ripple was measured.

## Claims-off ripple

All 9,054 `tests/cases` programs were built with claims off (`$VL_IR_SHADOW=1`) by base and by
head. **0** differ in bytes, and none differs in whether it builds. Legacy's other path writes these
`if`s byte for byte as the plain path does, so the verdict changes only what the IR may claim.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,686 | 114,697 |
| lost | — | 0 |
| `expression if arm prelude unwalked` | 11 | 0 |

The gained units are:
- `f`, `g` and the start body in `conditionals/if-arm-nested-local-join.vl`
- six instances in `generics/if-arm-nested-local-generic.vl`
- `ifArm` in `strings/two-union-list-lengths-at-every-position.vl`
- the start body in `unions/arm-local-chain-join-nullable-litunion.vl`

## Positions

`tests/cases/conditionals/nested-if-arm-local-positions.vl` covers binding, argument, `return`,
record field, a list join and a string join. Base misses `run`; head claims every function, and
the output is the same with claims on and off and as on base.
