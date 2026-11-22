# IR: a clone's parameter takes its annotation's type (2026-11-22, lane IR-D1)

`parameter rep ?` was the largest open-parameter class after #9536: 133 tests/cases functions in
55 files. A probe showed `scopeTyAt(p, fnIx)` = -1 for every one of those parameters. They are the
parameters of clones whose nodes carry no checked type, mostly mono's baked callback clones
(`$cbN`). Legacy still declares each one, closure, i32, str, list or struct, through
`vtKindOfType(parTyNode(p))`.

## The change

- `annTyOf(tyNodeIx)` (emit_shape_rows.vl) is split out of `annRepKindOf`: the type that
  `annRepKindOf`, and so legacy's param valtype, reads off an annotation node. `annRepKindOf`
  now calls it, and the seed is byte-identical for this split.
- The IR's `paramCheckedTy(p, fnIx)` (ir_build.vl) is `scopeTyAt`, else `annTyOf(parTyNode(p))`.
  `paramHeldTy` and `calleeSig` both ask it, so the parameter variable and the callee's signature
  agree.
- One shadow-suite expectation moved: the "outside the set" row's closure parameter
  (`ap((x: i32) => x + 1)`) is now covered. The test asks for the two remaining reasons and for
  `ap` covered.

The measurements are in the PR body.
