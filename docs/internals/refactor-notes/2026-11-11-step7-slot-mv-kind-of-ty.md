# Step 7 slot layer: the map-value kind read off the type, and four name producers deleted, 2026-11-11

This is queue item 1 of the slot-layer lane's third pass: the five map-value name producers that
#7130 left (`2026-11-11-step7-slot-mv-name-rungs.md`, "What is left in the bank"). Base is
master `98b73ba7` (#7132). Its fixpoint seed is 6,614,018 bytes.

## What decided by name

After #7130, each of the five found its slot by type. The spelling still decided two things:

- **Mono-ness and kind**, through `mvValKindOfNameTy`, a 120-line ladder over the canonical
  spelling.
- **The key kind**, through `mapNameKeyKind(mapName)` in `mvSlotOfMapNameTys`.

## What changed

- **`mvValKindOfTy(ty)`** is new. It reads the kind off the rep descriptor
  (`repOfTy(ty).rdKind`, an exhaustive `match` over `VKind`). It keeps the ladder's refusals:
  - a function or ref list with no emitter name;
  - a nullable closure whose result is a literal union;
  - a record with no struct or arm row;
  - a `null` beside one lone ref member;
  - `v128`;
  - an inner map still open at a type variable.
- **`mvValKindOfNameTy(name, ty)`** answers from the type whenever `ty >= 0`. The spelling
  ladder, now `mvValKindOfSpelling`, serves only callers with no type in hand. Its arms that
  fired only for a typed value are deleted with it. So are `mvValIsRefList` and
  `mvTyIsScalarList`, which nothing else called.
- **`mvSlotOfMapNameTy` and `mvSlotOfMapNameTys` are deleted.** Each of their six callers holds
  the map type, so it calls `mvSlotOfMapKeyKTys(tyMapKeyKind(m), …)`:
  - `rlElemMapValMvSlot`, `rlElemNulMapValMvSlot` and `mvValInnerMvSlot`;
  - the `$fnsig` map param;
  - `unionHasMapArmSlot`'s covered arm.

  Two callers had no type and so always answered `-3`; they now say `-3` outright. These are
  `annRetKindTy`'s map result and `unionHasMapArmSlot`'s uncovered arm.
- **`mvSlotOfMapValNameOrMonoKTy(s)` becomes `mvSlotOfMapValOrMonoKTys(keyK, valTy, kindTy)`,**
  which takes no spelling. `mapShapeOfValKeyed` and `jrMapValFits` lose the name parameter that
  only fed it.
- **`mvSlotOfValNameFindK`** asks the type for mono-ness when it has one.

## Measurement

**Probe 1** compared the two classifiers wherever a type was in hand. It was swept over all
23,873 programs, first hit per program, and it fired in **135 programs**. Every disagreement had
the spelling answer `-3` while the type gave a kind, and 134 of the 135 programs run on base.

| name → type | programs | example |
| --- | --- | --- |
| unsupported → mono | 68 | `D10041` |
| unsupported → union box (a recursive alias such as `Json`) | 53 | `D1016`, `D1036` |
| unsupported → ref (a nested map) | 9 | `mty_loc_mapmap_f64.vl` |
| unsupported → struct (a nullable record alias) | 5 | `D15151` |

The type-only candidate lost 10 programs, all nested maps over an unbound `T`, such as
`{[string]: {[string]: T}}`. The spelling had declined them as having no slot before the pin
names `T`. The map arm now says the same through `tyHasTyVar`. `tyReachesHole(·, 16)` was tried
first and lost `pin-exact-key-nested-set-map.vl`: an 18-deep map runs out the depth bound, and
an exhausted walk counts as a hole.

**Probe 2** marked every untyped call. It fired in 7 programs, first hit per program:

- 3 at the `mvValNamesCompat` render matcher, where one side is `shapeFieldElemName(…, -1)`;
- 3 at the `mapValKindLowerable` gate;
- 1 at `mvSlotOfValNameFindK`. This is `D3919`, which base already rejects.

None of them reached `mvSlotOfMapValNameOrMonoKTys` without a type, except after the render
matcher, where only two non-negative slots are compared.

## The price, measured

`sweep.vl diff`, master's fixpoint seed against the candidate's (23,877 programs):

- **23,826 same**;
- **51 bytes-only movers**;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

All 51 movers were disassembled under both seeds (`wasm-dis`). Each is the same size, and each is
identical once type indices and slot digits are erased and the lines sorted. They are recursive
value-union aliases (`Json`-shaped) and their map arms. Their map slot is minted at another
point in the order, so only the type numbering moves.

## Rulings checked

- **Literal unions never mint.** `mvValKindOfTy` answers a literal union mono before it reads
  the descriptor. D14041 and D14042 still refuse as filed.
- **No mint-on-miss in a question reader.** `mvSlotOfMapValOrMonoKTys` still answers `-3` on a
  miss.
- **No walk replaced by a walk.** The kind is one descriptor read. The only walk added is the
  map arm's `tyHasTyVar`, which is memoised per type and replaces the spelling's own descent.

## Proof

- Refresh ×2 is a fixpoint at 6,613,724 bytes (−294).
- rep-fuzz is exact. lint-self is clean (`self-lint + fmt-check clean`).
- The seed-size budget (+0.4%) is ok, and so are late-demands (6), dead-export (0),
  render-parse (38 and 70, unchanged), pin-helper and plumb-shape.
- cases_wasm passes (7,440), as do the inventory refs and rows tests, `vl_probe_rollback_test.ts`
  and `vl_scaling_shape_test.ts`.
- `check-filed-witnesses --strict` on both inventories: 4,704 as filed, 0 moved.

`vkind-census.vl --slots`: the map-value bank's name producers go from 5 to 1.

## What is left

**`mvSlotOfValNameFindK`** is still name-keyed, because the mint it falls to,
`mvNameMint(spelling, keyK, ty)`, is keyed by a spelling. It converts when the mint takes the
type (`mvShapeOfValTyK`). That is the next step in this bank.

These three stay on the spelling, BY DESIGN while their callers hold no type:

- **`mvValNamesCompat`'s render side** (`shapeFieldElemName(t, want, -1)`). It is a shape-string
  matcher and has no type to ask.
- **`mapValKindLowerable(mapName)`.** Its two callers hold a field text or an untyped member
  name. It goes when they hold the field's type.
- **`mvValKindOfSpelling`**, the residue serving the two above.
