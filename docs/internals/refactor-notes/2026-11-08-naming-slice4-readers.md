# The last readers of a name: naming rule slice 4 (2026-11-08)

Follows [2026-11-08-naming-pin-readers.md](2026-11-08-naming-pin-readers.md) (#6798).

## What landed

Two checker reads that took a spelling the canon pass had already rewritten now resolve the
parser's spelling tree:

- `holeGuardDeadAt` (`check_relate_core.vl`) read `nameToTy(ie.isVariant)`. It now uses
  `annotResolve(ie.isVariant, annTsOf(c))`, the tree route `isTypeTy` takes for the same node.
- `canonBankTyOf` (`check_program.vl`) re-parsed the pre-canon spelling. Its caller now passes the
  root it read before `clearAnnTs`, and resolves through `annotResolve`.

## The emit-side sites, probed

There was one probe build, with an `emitFail` at each site that reads a name. A sweep counts only
the first message per program, so each count is a floor:

| site | programs | at the instance key (`ekTys[elabWalkTop()]`) |
|---|---|---|
| S1 `monoSynthPinRef`, open pin | 112 | 0 close |
| S2 `monoSubstLetType`, registered-union arm | 128 | not tried; the arm reads the registry's spelling on purpose (D2676) |
| S3 `monoSubstAnnNode`, `sty < 0` | 40 | 40 close |
| S4 `monoSubstIsExpr`, `recordClonedIsVarTy` | 18 | 18 close |

Closing S3 and S4 at that column cost **12 `runs → not-runs`** and 4 more output movers.
`is-type-parameter-itself.vl` (D951) prints different `is T` answers, so the column is the
wrong binding, not a different rep. During the body rewrite, `elabWalkTop()` is the key the
build pushed for the instance. That key includes `elabLamInheritedOwn` and the exact-binding
join, so it is not the column the instance's pins spell. The change was reverted. The full
column has to come from the instance-binding derivation, which belongs to lane w90.

## Measured

| | |
|---|---|
| sweep (fixpoint seeds, base = master + #6798) | 23,656: 23,656 same, 0 bytes-only, 0 movers, 0 `runs → not-runs` |
| reach of the two checker sites (trap probe) | 240 programs (control: D3109's `hole-dead-guard-*` fires) |
| S3+S4 at the walk key (reverted) | 12 `runs → not-runs` |

## `nameToTy` callers in `check_relate_core.vl`

- Annotation entry, allowed: `annotResolve`'s name fallback, `nameToTyAt` at call type
  arguments, and `nameToTyAnn` at struct fields.
- Resolver-internal recursion, allowed (each one takes its entry's class):
  `applyGenAliasArgs`, `nameIsectOperandTy` (×2), `builtinCollAppTy`, `nameToTyReal` (×7),
  `retNameToTy`, and the inline-record field.
- Round trip, fixed: `holeGuardDeadAt`.

`check_program.vl` has three left, and all three re-parse canon's own output (`c`, `name`,
`all`): `canonBankTyOf`'s `nameToTy(c)`, the `recDup` arm and `canonSameShapeRecord`.
`unionMemberGenAppShape` also reads a canon'd member. These close only once `canonEmitName`
returns a type next to its text.
