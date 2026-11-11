# Step 7: an undone adoption's annotation is not interned, and `annSigKeyTy`'s spelling loop is deleted, 2026-11-11

This closes the residue `2026-11-10-step7-annsig-arm-mint-fields-ty.md` left, and with it the
`annSig*` half of `2026-11-10-step7-vkind-census.md` §4 item 3. Base is master `ef9778eb` (#7150).

## The residue was an orphan, not a missing type

`annSigKeyTy`'s spelling loop was still reached by one program,
`closures/hole-fn-in-unannotated-map.vl`. `collectAnnShapes` met the `TypeRef`
`{[string]:{f:(i32)=>i32}}` with no recorded type and interned it by its spelling.

Delta-debugging gives this minimal witness:

    function inc0(a) { return a + 1 }
    function mk() {
      const r = Map()
      r["k"] = inc0
      return r
    }
    const mm = mk()
    const z = mm["k"]
    const o = Map()
    o["k"] = { f: inc0 }
    const ov = o["k"]
    if ov != null { print(ov.f(3)) }

A probe on that node finds the following:

- No `LetDecl` or `FuncDecl` references it.
- `o`'s `letType` is -1.

The record-adoption solve pinned `o` to `{[string]:{f:(i32)=>i32}}` (`recAdPinAnn` minted the node),
and `recAdUndo` later restored `o`'s original declaration. The pin's annotation node stayed in the
arena, which is append-only, with nothing pointing at it. The emitter's arena walk still visited it.

That is why both earlier attempts did not reach it: growing `nodeTyIx` in `letDeclResolveAnnot`,
and recording the adopted type in `recAdPinAnn`. No declaration resolves that node any more. A
third probe repeated the first attempt here and also left the node at -1.

## What changed

- **`recAdUndo` records the annotation it drops** (`recAdDroppedAnn`, `check_rec_adopt_rows.vl`).
  It records an annotation only when the pinned one differs from the one it restores. The set
  lives for the whole program (`recAdReset`), not one pass.
- **`collectAnnShapes` skips a dropped annotation** (`recAdAnnDropped`). That node belongs to no
  declaration.
- **`annSigKeyTy` is `sigKeyOfTy`.** It answers `sigKeyOfTy(fty)` when `fty` is a function type of
  the spelling's arity, and `""` otherwise. The spelling now only gates the arrow shape and the
  arity, as it did before, so nothing the type keys can move.
- **The spelling loop is deleted**, and with it:
  - `annParamKindTy`, `annRetKindTy`, `annNulListKind`, `annUnionSigKind`, `annTyIsLitUnion` and
    `annRefListSlot`;
  - 21 imports, and `annSplitPipe` (`emit_base.vl`), which nothing else used.

`scalarListRepOfName` and `nulScalarListKind` are left with only their codec callers
(`fieldCodeOfSpelling`, `mvValKindOfName`, `nulScalarListFieldCode` and the nullable ref-map inner
name). Census item 5 owns those.

## Proof

- **Reach.** A probe that fires when the spelling loop produces a key fires in 0 of 23,892
  programs, on the fixed checker. On base it fired in 1, and its entry control fired in 5 of a
  1/10 shard (`2026-11-11-step7-vkind-name-ladders.md`).
- **The case** prints its eleven lines on candidate as on base. So does the minimal witness.
- **Seed:** 6,617,944 → 6,615,397 bytes (−2,547, one refresh).
- **Gates:** lint-self + fmt are clean. The dead-export budget is 0 and the render-parse budget is
  unchanged at 62 parses. The distilled `regress.vl` loses no runs; its only movers are the two
  known `d15317_d380*` cells. The corpus movers are the CI Sweep job's, in the PR.
