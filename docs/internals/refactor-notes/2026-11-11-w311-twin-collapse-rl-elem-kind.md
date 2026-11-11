# Step 7: a twin-map union's ref-list element kind is its one map's, 2026-11-11

`refListElemKindOfTy`'s `TyUnion` arm (`emit_shape_rows.vl`) now asks `mapTwinUnionMember`
first. A union such as `LM | IM` is stored as its one map (D15540), so its element kind is
that map's kind, not `rlUnionElemKindOfTy`'s boxed answer. This removes the 3>2 trap class
that D15800 pins against switching `arrLitElemKindTpl` to the literal's recorded type.

## Measurement

Fixpoint seeds on both sides, master after `6e3d0730` against this tree, over the whole
sweep population: same 23,914, bytes-only 0, output movers 0, runs → not-runs 0, new
compiler traps 0. The change alone is identity.

## The switch, re-measured on top

With the collapse in place, `arrLitElemKind` answering
`refListElemKindOfTy(tyArrayElemIx(nodeTyIxOf(arrIx)))` before the codec moves 11 cells,
all bytes-only (same outcome and stdout). 8 modules grow, so the switch is not in this PR:

- 4>9: lists whose element is a value union or nullable, such as `(i32|null)[]`,
  `(i32|f64)[]`, `(i32|string)[]`, `((T)=>T)[]` and `{g:i32}[]|null`. The kind-9 key goes
  through `ensureRefElemTys`' inner-first path, which mints the inner rows the codec's
  build never needed (D12921: 6 → 12 types).
- 6>9: one cell (D13940).
- 4>7: `f64[]` inner lists.

The D15800 pin stays open; `arrLitElemKindTpl` stays as the floor until the inner-first
mint stops growing those modules.
