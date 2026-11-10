# Step 7: an arm mint's closure-field signature reads the arm's type, 2026-11-10

This is queue item 2 of the VKind lane: `annParamKindTy`'s spelling-only path.
`2026-11-10-step7-njkind-rungs-deleted.md` §2 measured it. Base is master `aa36acae` (#7097), whose
fixpoint seed is 6,603,813 bytes.

## What the path is

`annParamKindTy` has one caller, `annSigKeyTy`'s spelling loop, and it always passes `ty = -1`.
The loop runs when `annSigKeyTy` gets no function type of the spelling's arity.

A reach probe fires only when the loop produces a non-empty key. On base it fires in 6 of 23,857
programs. A control at the function's entry fires in 45. In all 6, the caller is `fieldCloSigOf`
(the `sFieldCloSig` column) called with a field type of -1.

## The change

`internArmShapeRow` mints an arm's row through `internInlineShapeFieldsTy(nm, -1, aty)`. It leaves
`tyIx` at -1 on purpose (D34), and hands the arm's type to the fields as `fieldsTy`. Two closure-field
reads in the interner took the field's type from `tyIx` instead:

- the `sFieldCloSig.push` in `internInlineShapeTyGo`;
- `annShapeIndexOf`'s signature-identity split (`sFieldCloSigCompat`).

So on an arm mint both had no type, and fell to the spelling. Both now read `fieldsTy`, as the
interner's other field-element reads already do (`iisPushFieldElem`, `shapeFieldElemName`).
`internInlineShapeTy` passes the same type as both arguments, so only an arm mint can move.

## What is left

After the change, the probe fires in **1 of 23,857** programs:
`closures/hole-fn-in-unannotated-map.vl`, at `o["k"] = { f: inc0 }`.

The key comes from `collectAnnShapes` (`emit_collect.vl`). Its `TypeRef` arm meets
`{[string]:{f:(i32)=>i32}}` at a node whose `nodeTyIxOf`, `canonTyIxOf` and `declAnnTyOf` are all -1,
and interns that spelling with no type. A trap probe on `mkTypeRef` finds who minted that spelling:
the checker's record-adoption pin (`recAdPinAnn`, `check_rec_rows.vl`, through `recAdApplyPins`).

That is a missing checker fact: an adopted annotation reaches the emitter with no recorded type. Two
attempts to record it did not reach the emitter's node, so both were reverted:

- growing `nodeTyIx` in `letDeclResolveAnnot`;
- recording the adopted arena type in `recAdPinAnn`.

The D15640 ruling also governs this binding: the adoption pin may not fix a record field at a
closure type. So the spelling path stands until that residue is closed, and it is not deleted here.

## Proof

- **Seed:** byte-identical to base, at 6,603,813 bytes. Two refreshes are byte-identical.
- **Sweep:** all 23,857 programs, base against candidate: 23,857 the same, with 0 bytes-only movers
  and 0 output movers.
- **Also green:**
  - rep-fuzz (exact), lint-self, seed-size and late-demands (6);
  - the dead-export, render-parse and pin-helper budgets;
  - cases_wasm and the inventory refs and rows tests;
  - `check-filed-witnesses --strict` on both inventories (4,697 as filed);
  - scaling-shape, probe-rollback and plumb-shape-cost.
