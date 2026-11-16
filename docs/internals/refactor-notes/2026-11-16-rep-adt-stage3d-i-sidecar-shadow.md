# Rep ADT stage 3d-i: the field sidecars' read-time shadow, 2026-11-16 (lane REP)

Step 3d-i of [the stage 3 design delta](2026-11-15-rep-adt-stage3-design.md). It uses 3c's
discipline: shadow, then flip, then delete. Every read of three field sidecars now goes through
one reader each in `emit_rep.vl`:
- `fieldElemTyIn` for `sFieldElemTyIx` and its arm twins;
- `fieldLitTyIn` for `sFieldLitTyIx`;
- `fieldKeyKindIn` for `sFieldElemKeyKind`.

That covers 33 read sites, `rowMintFrom`'s copies included. Each reader returns the stored value,
with the column's own default past its end. Under `$VL_REP_SHADOW` it also counts the read
against the value the row's storage type projects.

`sFieldCloSig`, the closure-signature key, stays out of 3d. It is the function storage's sidecar,
and lane SLOT's slot-store stage 3 rewrites it.

## The projections

- **Key kind:** the map key's kind, through one `| null`; the string key for a non-map.
- **Literal set:** the storage type itself, or under one `| null`, when it is a literal set; else -1.
- **Element type, by rep kind:**
  - a ref list's element;
  - a record's type;
  - a map's value;
  - a union's box type;
  - an atom's literal set;
  - -1 for every scalar and scalar list.

## Readings

Measured on master `36115ad75`, armed, over `tests/cases`, `std`, the distilled `cells/` and `named/`
and the self-build: **416,979 reads agree**. The disagreeing reads, by class:

| class | reads | files | owner |
|---|---|---|---|
| a map whose value is a function set: stored `i32` (the set id), type `(_) => _` or `(T) => T` | about 16,000 | about 22 | function storage: D16721, lane SLOT |
| a literal type stored widened to its base: `N12` stored `i32`, `9000000000 \| 1` stored `i64 \| i32`, `N \| null` stored `i32 \| null` | about 2,100 | about 60 | projection rule: widen as the storage does |
| a scalar `i32` or `boolean` field that records its prim, where the projection has none | about 730 | about 90 | projection rule, or a dead record |
| an atom field with a literal set and nothing recorded | about 230 | about 30 | to grade |
| `nulstruct` rows naming a record twin | 230 | 6 | to grade by `tySameSealed` across twins |

The end-of-emit sweep's reading of the same tables was:
- key kind 27,151 of 27,154;
- element type 26,793 of 27,154.

Read-time weights the hot readers. Most of the disagreeing reads come through
`sFieldElemTyIxAt` (`emit_rep.vl`).

**3d-ii** flips key kind, which agrees except 3 rows. It then adds the widening rule to the element
and literal projections and grades the rest. The function-set map value stays with D16721.

## Identity and cost

Both seeds are fixpoints; the base is master `36115ad75`.

| | |
|---|---|
| `corpuscmp.vl` (`tests/cases`, `std`) | 8,325 modules: 6,956 identical, **0 DIFFER, 0 LOST** |
| distilled cells and named, built with both seeds | 8,914 buildable: **8,914 identical** |
| L2 self-compile fuel | 92,856,608,239 → 92,893,742,789 (+0.04%) |
