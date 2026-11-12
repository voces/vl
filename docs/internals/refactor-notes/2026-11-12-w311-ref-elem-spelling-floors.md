# Step 7: the ref-list element spelling floors reach one cell, 2026-11-12

Two floors read a ref-list element's kind off its spelling (`refArrElemKind`):
`collectARefArrayAnn`'s annotation floor and `ensureRefElemTys`' floor.

- **The annotation floor is deleted.** An `emitFail` probe on it fired on 0 cells of the sweep
  population.
- **`ensureRefElemTys`' floor fired on 4 cells.** Three are maps whose values are lists of
  un-annotated functions (D9715, `hole-fn-nested-list-map-value.vl`,
  `hole-fn-list-map-value-tagged.vl`). The map-value intern (`mvShapeOfValNameArmTyGo`) withheld
  the value's type there. Its spelling `i32[]` carried the rep, because such a function is stored
  as its i32 id. Two changes answer these by type:
  - the intern passes the value's type, past its niche, as the kind input;
  - `rlScalarLeafKindOfTy` reads a function leaf whose rep is `i32` (`repSigKindOfTy`) as the
    i32 list.
- **The fourth cell stays on the spelling:** `declared-return-holds-litunion-beside-type-param.vl`.
  `sFieldRefSlot` mints a generic struct's field at `T | K` by name, because the field column
  records no element type for a template field. It moves once that column records the open type.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population, base master `0921d19f`: same
23,940, bytes-only 1, output movers 0, runs → not-runs 0, new compiler traps 0. The mover,
`closures/written-binding-of-generics-delivered-by-list-of-lists-literal.vl`, keeps its size and
its lines; only its type indices reorder. The probe on `ensureRefElemTys`' floor now fires on 1
cell, down from 4.
