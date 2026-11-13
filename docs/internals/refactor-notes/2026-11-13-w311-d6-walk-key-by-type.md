# Step 7 D6: the shape walk's key is two bits of walk state, not a render, 2026-11-13

Lane F. Measured at master `72fcc957`.

## What changed

`shapeWalkKeyOf(kn, ty)` and `shapeWalkName(ty)` are deleted. Each rendered the type
(`tyToNominalName`, `tyToEmitName`) at every walk frame. The walk now carries:
- `keyed`: the frame was entered under its declaration's key. That is a fresh walk of a type
  not already on `shapeWalkStack` and holding no type variable (`shapeWalkKeyed`), or a frame
  handed over by the other walker;
- `nom`: that key is the nominal spelling. A fresh keyed walk has it, and a hand-over passes
  the caller's.

What each text test became:

| text test | now | programs disagreeing (shadow probe, 18,749 walking) |
| --- | --- | --- |
| `byDecl = kn != "" && ln == kn` | `keyed` | 0 |
| `gaeEnsure` guard `kn != ""` | `keyed` | 0 |
| fresh hint `shapeWalkName(ty) != ""` | `shapeWalkKeyed(ty)` | 0 |
| `ln == ""` returns | `!shapeWalkEnters(ty)`: holds a type variable, unless a record of tagged-set ids (`tagRepTyFn(ty) >= 0`) | see below |
| leaf gate `nameIsShapeSpanEnds(ln)` | `walkLeafIsShape(keyed, ty)`: a record with no struct, union-alias or brand name, and no generic application when keyed | 2 (D14163's quoted-field record) |
| row label `ln` | `shapeWalkLabelOf(nom, ty)`, minted only for a new row | 0 |

The walk's leaf interns through `internShapeWalkLeafTy`, memoized by type rather than by the
label's sid. `iisSettle` clears both memos at the outermost exit, and `iisReset` empties the type
memo per program.

## The empty-key return

The old return fired when both renders were empty. It differs from "holds a type variable" in
two classes:
- **33 programs:** a `TyPrim` whose render is empty. These now walk on, to a leaf that is not a
  record, so they intern nothing.
- **229 programs:** a type-variable record. Its stored spelling decided whether it returned.

**Refused version.** "Any type variable returns" lost 4 runs: D15640, D15651 and two
`tests/cases/functions` hole-record programs, all emitting invalid wasm. A record of tagged-set
ids holding a hole has to enter the walk. `shapeWalkEnters` admits it by
`tagRepTyFn(ty) >= 0`, a type test.

D14163's 2 programs now pass the leaf gate. Their record has a quoted field (`"[]"`), and its
spelling fails the brace parse. The sweep shows no movement: the field's code declines either way.

## The label

The label is a lookup key (`structIndexByName`). Lane A's canonical-key test on the struct-row
label table shows every hit lands on a row of the name's own type, with 0 misses and 0 clashes
over 24,215 programs. So minting it from the type cannot change what a lookup finds. The three
renders left in `shapeWalkLabelOf` feed only that label. The render-parse census still counts
them as decision renders (`ty-render` is unchanged), because `sNames` is a key.

## Measurement

- **Sweep:** fixpoint seeds, master `72fcc957` → this: all 24,215 the same (0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new traps).
- **Cost:** guest fuel on the 12-level diamond is 55.8M, against about 56M on master.
  `vl_scaling_shape_test.ts` passes in the gate.
