# Step 7: the shape walk's typeless class, counted by why the type gives no name, 2026-11-12

Several shape-interner floors share one cause: a record reaches the shape walk (`internShapeDeepTy`)
with no type the walk can name, so a spelling decides the row. They are:

- `internShapeDeepOfTy`'s render;
- `internArmShapeRow`'s render fallback;
- `gaeEnsure`'s name rung (N13), and `gaeApplyFieldTy`;
- `variantNestedRow`, `armFieldStructRowMinted` and `sFieldRefSlot`'s type-variable rungs.

The population is the sweep's 24,067 programs on master `c7080cc4`. A probe classified each entry by
why its type gives no name:

- **U**: no type;
- **V**: a bare type variable;
- **G**: a type still holding type variables;
- **H**: an inference hole;
- **R**: a concrete type whose emit render is `""`.

It also recorded whether the entry mints a row (`Lr`, `Gm`) or declines (`Ln`, `Gn`). The probe was
validated on D15651 (`L:G`). Counts are programs.

## Where a spelling decides a row

| site | usable type | G | R | U |
| --- | --- | --- | --- | --- |
| the leaf mints a record row (`Lr`) | 3,800 | **58** | **13** | **7** |
| `internShapeDeepOfTy` renders `""` | | **12** | **8** | |
| `internArmShapeRow`'s render fallback | 2,403 | | **5** | |
| `gaeEnsure` mints an instance (`Gm`) | 174 | 0 | 0 | 0 |

No H entry reached any site.

## Where the walk declines, by design

| site | usable type | G | U |
| --- | --- | --- | --- |
| the leaf declines a record spelling (`Ln`) | 10 | 134 | 6 |
| `gaeEnsure` declines an application (`Gn`) | 297 | 121 | |

A G entry that declines is a generic original's annotation. It is never emitted: its instances
are, under substituted types. These are not part of the floor.

## The classes, and the plan for each

- **R, concrete records whose render is empty: 13 at the leaf, 8 at `internShapeDeepOfTy`, 5 at
  the arm fallback.** These are recursive and intersection records: D14162, D4615, D5104, D5105,
  D5155, `objects/intersection-alias-field-and-nullable-positions`,
  `structs/recursive-nullable-field-equality`, `types/recursive-type-emit-render-cycle`. Their type
  is concrete. The render is `""` only because `tyToEmitName` meets a cycle. So the row can be
  found by layout id (`annShapeLayoutRowOf`) and minted under a type-derived key, with readers
  asking by type. This class needs no other lane, so it goes first. D14162 and the intersection
  case are two of E6's seven lost runs (`2026-11-12-step7-shape-walk-name-floor.md`).
- **G, records whose type still holds type variables: 58 at the leaf, 12 at
  `internShapeDeepOfTy`.** These are a hole function's or a tagged set's record fields, typed only
  in the instance: D13967, D13968, D14161, D14726, D15167, D15330, D15559, D15638. w314's cut 5
  types these fields at the shape intern with `elabSubstClosed(fieldTy, k)`. Once it lands, re-run
  this census: the class should move to "usable type". The remainder is the next plan.
- **U, untyped children: 7 at the leaf.** These are D15042, D1578, D4930,
  `closure-value-union-array-struct-elem-list-field`, `typaram-list-union-return-keeps-both-arms`,
  `nested-union-softening-list-return-twin` and `inferred-record-literal-list-union-arm-generic`.
  The walk descends by the spelling and loses the type at a mis-parsed or type-variable step.
  D15042, the instance-less generic shape, is w317's. The rest go when the descent reads the type,
  E6's change, which waits on G and R closing.

## Order

1. R by layout id (this lane).
2. G with w314's cut 5, then re-census.
3. U with w317's D15042 and the descent by type.
4. With all three closed, the walk's name path goes, with its parses and the renders above.
