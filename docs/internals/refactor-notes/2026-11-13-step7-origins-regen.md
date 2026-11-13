# Step 7, lane H: render-parse origins regenerated after #7770 and D16062 PR 1, 2026-11-13

Since master's last regeneration, #7770 and D16062 PR 1 (#7783) asked the type
at most `isValueUnionName` sites, and other lanes deleted sites. The committed
`scripts/render-parse-origins.txt` still graded those rows. This regenerates it
and `docs/internals/render-parse-sites.md`, on top of #7783, so the files and
the budget agree.

## Result (88 census sites: 38 render, 13 source, 37 unclassified)

- **20 rows dropped**, every one a site that no longer exists:
  `isValueUnionName` ×12, both `nameIsLitUnionArmValueUnion` rows of
  `unionCarriesLitUnionArm`, `monoUnspacedUnions`, `arrLeafNameOf`,
  `normTypeAtom`, `nameIsShapeOpen`, and the old `monoPinAnnotatedParam` row.
- **Two sites regraded:**
  - `registerValueUnionNameTy`'s `nameIsLitUnionArmValueUnion`
    (emit_union_atoms) moves from render to source. Once the type answers first,
    the fallback only ever receives a source spelling (1 program,
    `literal-unions/as-num-litunion-scalar-member-test.vl`).
  - `monoPinAnnotatedParam`'s `arrElemSuffixed` (emit_mono:20981) moves from
    render to unclassified. Since #7769 spells a `T[]` pin from its element
    type, this fallback receives only a bare name (2 programs, D5001's `V`),
    which no text test places.

The budget moves only by those two regrades, each net zero in its file:

- emit_union_atoms: string-parse 1 → 0, source 1 → 2;
- emit_mono: string-parse 3 → 2, unclassified 1 → 2.

`render-parse-origins.ts --check` is clean.

The other unclassified emit_mono site, `monoArgTyNameRep`'s `arrElemSuffixed`
(emit_mono:1770), was already counted and is unreached. It is lane D's to floor
or delete.
