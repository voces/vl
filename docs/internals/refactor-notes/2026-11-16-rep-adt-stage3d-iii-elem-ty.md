# Rep ADT stage 3d-iii: a field's element type is its storage type's, 2026-11-16 (lane REP)

Step 3d-iii, after [3d-ii](2026-11-16-rep-adt-stage3d-ii-key-kind.md). `fieldElemTyIn` now
returns the element type the row's storage type projects:
- a ref list's element;
- a record;
- a map's value;
- a union's box type;
- an atom's literal set;
- -1 for every scalar and scalar list.

One class keeps the stored element type: **a projection that may hold a function**. A held
function set is stored as its id, and the type does not say so. That is D16721's class, which
lane SLOT's slot-store stage 3 closes. Two cases fall in it:
- a map whose value is a function set: about 16,000 reads in about 22 files (3d-i);
- a nested record holding a function list (`named/d15296_deep_record`, which fails to build if
  projected).

`fcMayHoldFn` decides membership. It is memoized per type and reset at each module's emit. A type
met while it is being walked answers yes, the safe direction: it keeps the stored value. A first,
unmemoized version walked a diamond-shaped record once per path; `tests/vl_scaling_shape_test.ts`
caught it (ratio 8.4 against a bar of 4.45), and the memo brings all 90 rows back under their
bars.

The column itself stays, because the kept class reads it. Its writers go when D16721 closes.

## Not flipped: the literal-set sidecar

Projecting `sFieldLitTyIx` from the storage type changes reader output. A scratch flip, never
seeded, made 6 `tests/cases` programs print wrong values or trap:
- `discriminant-set-beside-base`, `-alias-arm`;
- `discriminant-value-is-ablation`;
- `is-contained-arm-tests-the-value`;
- `layout-family-literal-set-beside-string`;
- `union-record-narrowing-survives-unrelated-writes`.

The sidecar is not a function of the type. It records which fields the minter laid out as
discriminant atoms, the decision `promoteLitFieldToAtom` and `demoteLitFieldToString` make, and
its readers use `>= 0` to mean "this field is a discriminant set". It stays stored, for that
reason. `sFieldCloSig` stays with lane SLOT.

## Graded movers

Both seeds are fixpoints; the base is #8617 (3d-ii) merged with master.

| | |
|---|---|
| distilled cells and named | 8,934 buildable: **8,934 identical** |
| `corpuscmp.vl` (`tests/cases`, `std`) | 8,335 modules: 6,963 identical, **2 DIFFER**, 0 LOST |

The two movers are `unions/variant-twin-map-elem-list-field.vl` and
`unions/variant-twin-nested-reflist-field-struct-twin-elem.vl`. In each, the module has the same
byte size and the same type set, in a different order (`wasm-dis`), and it prints its `@log`.
The variant twin's element type now comes from the storage type. That moves the point in emit
where the twin's element row is first interned, and with it the type section's order.
| L2 self-compile fuel | 93,207,433,866 (+0.4% on the committed baseline) |
