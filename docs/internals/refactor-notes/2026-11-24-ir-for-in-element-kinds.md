# IR: for-in over thirteen more element kinds (2026-11-24, lane IR-D1)

The probes batch's PR3, mechanism E. A walk over a list of maps (`map`, `nulmap`), of `F32x4`
(`v128`), of `f32` or `F32x4` lists (`f32list`, `v128list`), of nullable lists (`nullist`,
`nulreflist`, `nulstrlist`, `nulf64list`, `nulf32list`, `nuli64list`, `nulv128list`) or of nullable
closures (`nulclosure`) missed as `for in element <kind>`.

## Mechanism

`forInElemPlain` (`wasmEmit.vl`), which only the IR's `forInPlainWhy` asks, puts the thirteen kinds
on the plain side, one commit per family. Legacy's walk is kind-generic for them: it reads each
element whole at its own rep, as it reads `nulstruct` and, since #9830 and #9892, `nulvariant`,
`nulbool` and `f32`. No builder, lowering or legacy change. `f64list`, `i64list` and `nulu8list`
are N6's; `nulnone` stays refused, since no program reaches it.

## Readings

READINGS

## Legacy tails the IR calls

None new: the walk's existing tails.
