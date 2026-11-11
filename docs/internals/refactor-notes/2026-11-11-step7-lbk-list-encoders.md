# Step 7 codecs: the spread's build-code encoder and decoder ask the list-rep table, 2026-11-11

This slice follows `2026-11-11-step7-mfkind-retired.md` (#7195) and stacks on it. With
`ListKind` in place, the spread code had its own copy of the `LBK` build-code table in both
directions.

## The census

The `LBK` build code (`emit_state.vl`) names which (backing, wrapper) pair `emitArr` builds, as
`ListBuild.lbKind` and the concat and compare reps carry it. It is not a duplicate of the list
rep. Beside the 7 non-null lists it names `LBK_UNION`, `LBK_REF_AT_SLOT`, `LBK_NUL_BOOL_LIST`,
`LBK_NUL_LIT_UNION_LIST` and `LBK_NUL_U8_LIST`. It has 33 reading or writing functions across 11
files:

| role | functions |
| --- | --- |
| encoders from a list rep | `eqListKindOfListRep` (`emit_list_rep.vl`, the table), `listBuildKindOfVKind` (`emit_ref_list_kinds.vl`, which adds the union and closure rows), `nulScalarListBuildKind`, and before this slice `pendingKindOfList` |
| encoders from syntax or another code | `exprListCellBuildKind`, `catListKindOfExpr` (from `LR_*`), `listRowOfRepTy`, `eqgListKindOfExpr`/`OfBin` |
| decoders | `catWrapIdxOf`/`catBackIdxOf` (to heap types), `eqgElemClass`, `xrepElemKind`, and before this slice `spreadPendingScalar` |
| dispatch | `emitArrUnder` (18 arms), `emitArrI32`, the eq and concat emitters |

## What changed

- **`pendingKindOfList` delegates to the table.** Its 7 arms were `eqListKindOfListRep`'s,
  arm for arm, except that a union-box ref row builds as `LBK_UNION`. That one arm stays and the
  rest is `eqListKindOfListRep(k)`.
- **`spreadPendingScalar` decodes by asking the encoder.** It walks the three wider scalar lists
  and asks `pendingKindOfList`, instead of re-spelling the three codes. A code with no list rep
  answers null as before.

## Left

The `LBK` code is a build-mode key that carries more than a list kind, so it stays. The open
duplication among its encoders is `listBuildKindOfVKind` against `eqListKindOfListRep`; they
differ only at the closure row. That is a cut for the `LBK` owner to grade, not this lane.

## Proof

- Expected byte-identical. The CI `sweep` label proves identity; its summary goes in the PR.
- One refresh: 6,620,935 bytes.
- `cases_wasm` passes.
- `distilled/regress.vl`: no runs lost.
- Clean: `lint-self` + fmt, rep-fuzz.
- Budgets exit 0: export, ladder, comment, sentinel, scan and render-parse.
- `plumb-shape-cost --check` fuel: main +0.5% and tail −0.6%, the same as master's seed to the
  instruction.
