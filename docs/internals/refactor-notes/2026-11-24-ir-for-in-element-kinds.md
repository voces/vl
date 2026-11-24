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

Each census arm ran in a tree at its own commit: the base in a tree at `282c9b8b` (#9892's head
with master merged), the head in this branch's tree, both on fixpoint seeds. 0 claimed functions
are lost in any population.

| Kind | Base | Head |
|---|---|---|
| map | 9 | 0 |
| nulmap | 1 | 0 |
| v128 | 1 | 0 |
| f32list | 1 | 0 |
| v128list | 1 | 0 |
| nullist | 2 | 0 |
| nulreflist | 1 | 0 |
| nulstrlist | 1 | 0 |
| nulf64list | 5 | 0 |
| nulf32list | 2 | 0 |
| nuli64list | 1 | 0 |
| nulv128list | 1 | 0 |
| nulclosure | 4 | 0 |

Of the 30 base functions, 29 are claimed, by origin cases 23, distilled 1, probes 1 and witnesses
4; the 30th, a cases `nulclosure` function, moves on to `for in map receiver`.

- Identity: names `identical 9433, differ 0`, self-compile identical; cases `identical 7977,
  differ 0`; claimless `identical 14472, differ 0`; legacy A/B `8041 same`, empty.
- The sweeps and witnesses (`tests/cases/loops/for-in-<map|v128|f32list|nullist|nulclosure>-element-in-each-position.vl`,
  `for-in-<map|v128|value-list|nullable-list|nulclosure>-element-values.vl`, 10 files) are
  claimless-identical: `identical 10, differ 0`. Every walk function in them is claimed and
  matched; the two other uncovered rows are `expression if valtype` and `narrowed read niche kind`.
  `cmp` and `wasm-dis` identical, claimed against legacy: the nullable-list witness, the map and
  the nulclosure sweeps.
- The nulclosure sweep's union-parameter position was invalid wasm on master
  ([D17380](../inventory/D17380.md), closed by S2); it is back in the sweep, runs, and is
  claimless-identical, its narrowed read missing as `narrowed read niche kind`.
- The legacy diff is `forInElemPlain`'s two arms; `git grep forInElemPlain` names one caller,
  `forInPlainWhy`.
- Fuel: per PR +0.00%; the pair is L2 126989572761 against base 126989461559.

## Legacy tails the IR calls

None new: the walk's existing tails.
