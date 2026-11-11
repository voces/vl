# L1: the 94 raw instance readers classified, and the first batch read the bank, 2026-11-11

Base is master `2fb114d7`. The population is the 94 `nodeTyIxOf` call lines that
`2026-11-11-l1-instance-reader-recount.md` found reading a type that holds type parameters while
an instance is emitted. Each was read in its function and callers and put in one group.

| group | lines | what it is |
| --- | --- | --- |
| bank | 6 | `nodeTyAt`, `scopeTyAt`, `elabCheckedTyOf` (2), `elabNodeInstTys`, `nodeTyInOf` |
| open-type gate or re-derivation | 43 | asks whether the type is open, then resolves per instance (`elabClosedTyAt`, `instanceTyOf`, `substTyDeep`, a memo bypass) |
| written annotation | 7 | a `Param`'s or `let`'s written type, which is the template's |
| row mint (L6) | 17 | `emit_shape_rows.vl` 11, `objLitTaggedFieldRow` 2, `arrLitArenaRecElem` 2, `arrLitInstElemRows`, `nodeMapTyIx` |
| raw on purpose | 7 | a property every instance shares (`elabRetParamOf`'s void test, `ifJoinIsScalarPrim`, `arrLitIsRefTpl`, `arrLitElemNameTpl`, `cloCallSigKey`'s typed-at-all test, `letStoreHeldTy`, `monoReadsUnfilledNull`) |
| should read `nodeTyAt(ix, fnIx)` | 14 | below |

## The 14

Read the bank in this PR (each has `fnIx` in scope, and the elaboration records the node kind):

- `exprIsClosure`: the tagged-set early-out.
- `ifExprRefKind`: the tagged-set early-out.
- `coalesceDefaultNullable`: a default whose type is `null`.
- `letNamedHeldTy`: the null-narrowed read and the read's own type (two lines).

Left, the bank records the node kind, `fnIx` one caller up: `blockTailIsClosure` (tagged-set
early-out, through `fnReturnsClosure`), `letWidensToString`. Left, `fnIx` in scope:
`letHeldTyOf`, `assignTargetReReads` (an assignment's place; the bank's record is unconfirmed).

No bank record for the node kind, handed to lane w321:

- `emptyArrHoleElemSlot` (emit_obj_lit_fits.vl) and `emptyArrHoleKind` (emit_ref_list_kinds.vl):
  an empty `[]` typed `T[]`, a literal node.
- `cloCallSigKey`'s capture-cell list read and `emitCoalesceGo`'s minted `??` nodes
  (wasmEmit.vl): minted nodes the bank reaches only through `nodeSrc`, which `nodeTyCarry` does
  not set.
- `fnUnionRetSinkOk` (emit_fn_scans.vl) reads the `FuncDecl`'s type, which no instance banks; the
  instance's return is already in scope there (`inferRetTyIxOf`).

## This PR's proof

The four cuts change no output: every `@run` case under `tests/cases` against `2fb114d7` is
identical. The corpus oracle (`cases_wasm_0..3`) passes 7,440, distilled `regress.vl` loses no
run, lint-self is clean, render-parse and seed-size budgets hold (+0.5%).
