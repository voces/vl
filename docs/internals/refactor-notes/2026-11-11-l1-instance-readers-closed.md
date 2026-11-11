# L1 closed: every raw instance read is by design, 2026-11-11

The §3.5/§4.1 deviation line of `ARCHITECTURE.md` §7 is deleted: the 94 `nodeTyIxOf` call lines
`2026-11-11-l1-instance-reader-recount.md` found reading a type that holds type parameters while
an instance is emitted are all in a by-design class.

| class | lines | what it is |
| --- | --- | --- |
| bank | 6 | `nodeTyAt`, `scopeTyAt`, `elabCheckedTyOf` (2), `elabNodeInstTys`, `nodeTyInOf` |
| open-type gate or re-derivation | 43 | tests whether the type is open, then resolves per instance (`elabClosedTyAt`, `instanceTyOf`, `substTyDeep`, a memo bypass) |
| written annotation | 7 | a `Param`'s or `let`'s written type, the template's by definition |
| row mint | 17 | `emit_shape_rows.vl` 11, `objLitTaggedFieldRow` 2, `arrLitArenaRecElem` 2, `arrLitInstElemRows`, `nodeMapTyIx` |
| raw on purpose | 8 | a property every instance shares (`elabRetParamOf`, `ifJoinIsScalarPrim`, `arrLitIsRefTpl`, `arrLitElemNameTpl`, `cloCallSigKey`'s typed-at-all test, `letStoreHeldTy`, `monoReadsUnfilledNull`), and `cloCallSigKey`'s capture-cell read: a hole lambda's cell in a non-generic function, with no instance to bank |

The 13 lines that should have read the instance's type read it now:

- #7205: `exprIsClosure`, `ifExprRefKind`, `coalesceDefaultNullable`, `letNamedHeldTy`.
- #7209: `letHeldTyOf`, `letWidensToString`, `blockTailIsClosure`, `fnUnionRetSinkOk`.
- #7215: `assignTargetReReads`.
- #7243: `emptyArrHoleElemSlot`, `emptyArrHoleKind`.
- #7241 (lane w321): `emitCoalesceGo`'s minted `??` links are typed at the instance where they
  are made.

The line's other claims (`bindGenWalk`, `monoArgTyName` site counts, the open rows and the (c)
literal) were re-measured or closed in `2026-11-11-l1-instance-reader-recount.md`.
