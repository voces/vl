# L1: the ten `arrLit*` producers read the instance type, 2026-11-12

#7324 classifies ten `emit_shape_rows.vl` producers as converts: each read a list literal's
template type while an instance was emitted. The ten are `arrLitBoxElemName`,
`arrLitNulBoxElem`, `arrElemIsClosureArena`, `arrLitMapElemName`, `arrLitElemRendersNoMap`,
`arrLitElemRender`, `arrLitNestedElemName`, `arrLitShapeElemName`, `arrLitNulRefElemName` and
`arrLitNominalElemTy`.

Each now takes `fnIx` and reads `nodeTyAt(arrIx, fnIx)`. The parameter is threaded through
their in-file wrappers: `arrLitBoxElem`, `arrElemIsClosureTy`, `arrLitNestedElemKind`,
`arrLitNulRefElemKind`, `arrLitNominalElemName`, `arrLitNominalRowTy`, `arrLitUnionElemName`,
`arrLitElemHintTy` and `arrLitInferUnionElemName`. A caller holding a function passes it:
`arrLitObjRowTy`, `arrLitElemNameTy`, `arrLitInstElemRow`, `arrLitRowTyIn` and `arrLitIsStr`.
The template readers (`arrLitIsRefTpl`, `arrLitElemNameTpl`) and the collect pass pass -1. At -1,
`nodeTyAt` of a list literal is its recorded type.

The function index is an argument, not a read of `emitCurFnIx`.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population, base master `a5588486`: same
23,934, bytes-only 0, output movers 0, runs → not-runs 0, new compiler traps 0.

An `emitFail` probe in `arrLitNulRefElemName` fires where `fnIx >= 0` and the instance type
differs from the template: it fires on 500 cells. The instance answer is read there and builds
the same module.
