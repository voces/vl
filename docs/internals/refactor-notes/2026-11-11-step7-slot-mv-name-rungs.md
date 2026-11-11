# Step 7 slot layer: the map-value bank's name rungs deleted, and the mv key made structural, 2026-11-11

This is queue item 1 of the slot-layer lane's second pass: the map-value bank's name-keyed producers
(`2026-11-10-step7-vkind-census.md` §2). Base is master `68fd81f7` (#7124). Its fixpoint seed is
6,612,194 bytes.

## The name rungs

Each name-keyed entry point ended in the same two rungs behind its type find:

- the **name bridge** (`mvSlotOfValNameTyK(Arm)`): `mvSlotOfTyKArm(fieldElemTyIxOfName(name), …)`;
- the **name scan** (`mvSlotByValNameK(Arm)`): the first slot whose `mvValName` is the spelling.

There are four sites:

| site | where | type the find holds |
| --- | --- | --- |
| S1 | `mvSlotOfValNameFindK` (`sFieldMapShape`, `uFieldMapShape`), after `mvSlotOfValTyK` missed | the field's element type |
| S2 | `mvSlotOfMapValNameOrMonoKTys`, the op-site find | `valTy`, else `kindTy` |
| S3 | `mapAnnShape` (`emit_nullable_rets.vl`) | the node's value type |
| S4 | `mvShapeOfValNameArmTyGo`, the mint's own find | the value's type |

## Measurement

The probe compilers were built by the base seed into scratch and never refreshed into `build/`.
Each one was swept over the whole population (`scripts/sweep.vl`, 23,873 programs). At each rung
that answered, the probe compared the answer with `mvSlotOfTyKArm(type, key, hint)`. A reach
variant also fired where the answer agreed, or where the rung missed. It fired at every site:
S1 10, S2 401, S3 14 and S4 2,403 programs, first hit. Counts are **programs**, first hit.

| site | `DIFF` | `NOTY` | `MISS` (the name answered, the type did not) |
| --- | --- | --- | --- |
| S1 | 0 | 0 | 9 |
| S2 | 0 | 0 | 1 |
| S3 | 0 | 0 | 0 |
| S4 | 0 | 0 | 44 |

Every `MISS` names two types that the name canon gives one spelling. There are three families:

- **A map-twin union** (S2, 1: `{[i32]: 1 | 2} | {[i32]: i32}`). The mint stores it at its one
  map's slot (`mapTwinUnionMember`), but the find typed the union.
- **An integer literal union beside its base** (S1 7, S4 3: `{r: N}` / `{r: i32}`,
  `N12 | null` / `i32 | null`, `1 | 2 | null` / `i32 | null`). A map value stores it as the
  base.
- **Same-shape records** (S1 2, S4 41: `Circle` / `{r: {q: i32}}`, `A` / `B` / `{v: i32}`,
  `Circle` / `CircleC`). The mv key named a declared record by its declaration slot. Same-shape
  records are one type (D3870), so the name was right and the key was too fine.

## What changed

- The four sites ask the type alone. `mvSlotByValNameK`, `mvSlotByValNameKArm`,
  `mvSlotOfValNameTyK` and `mvSlotOfValNameTyKArm` are deleted.
- S2 types a map-twin union as its one map, as the mint keys it.
- The `mv` rep key and id fold a union of one integer base's literals to that base. They also do
  so under a nullable, where the id took the flattening union path and the key did not.
- The `mv` rep key and id expand every record structurally, as `canon` does, in spelling order.
  A declared arm still differs from its layout twin through the arm hint (D48), which these finds
  and the mint thread unchanged.

S2 and S4 have to go together. Deleting S2's name scan alone loses 30 programs: the mint's own
name scan hands back the twin's slot, so the value's own type never gets a slot to find.

## Rulings checked

- **Literal unions never mint.** A literal-union value now finds its base's slot by type. No
  probe or sweep cell minted a slot for one. D14041 and D14042 were run by hand and still refuse
  as filed (`check-filed-witnesses`, 0 moved).
- **No mint-on-miss in a question reader.** S2 and S3 still answer `-3` or the key's mono shape
  on a miss.
- **No walk replaced by a walk.** The name scan is deleted, and the type scan that fronted it is
  the only one left. A canonical-type scan in its place was considered and not built.

## The price, measured

`sweep.vl diff` of base against the candidate's fixpoint seed gives these counts:

- **23,840 same**;
- 33 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The fixpoint seed gives the same 23,873 modules as the probe-built candidate.

The 33 movers were disassembled under both seeds (`wasm-dis`):

- **23 move only slot numbers.** The map helper names change (`$__map_set_3__` becomes
  `$__map_set_4__`), and nothing else does. The type definitions are the same multiset and the
  bodies are identical once the slot digits are erased.
- **10 shrink, and none grows.** Two slots of one record type now share one slot, so their map
  helpers are emitted once. Examples: `inferred-map-destination-shape.vl` 12,102 → 9,135 bytes,
  `map-value-twin-relation-stays-transitive.vl` 5,902 → 4,690, `D301` 4,418 → 3,815.

Two intermediate candidates were measured on the way:

| candidate | same | bytes-only | `runs → not-runs` |
| --- | --- | --- | --- |
| deletion only | 23,855 | 17 | 1 (`map-twin-union-is-its-one-map.vl`) |
| + the twin type and the literal fold, the mv key still declaration-slot | 23,859 | 14 | 0 |

The second one minted a twin slot for a same-shape record: `inferred-map-destination-shape.vl`
grew by 70 bytes. Under D3870 that is a second row for one type, so the structural key goes in
the same PR.

## Proof

- Refresh ×2 is a fixpoint at 6,611,988 bytes (−206).
- lint-self is clean and rep-fuzz is exact.
- The seed-size, late-demands (6), dead-export (0), render-parse (38 and 70, unchanged),
  pin-helper and plumb-shape budgets are ok.
- cases_wasm passes (7,422). So do the inventory refs and rows tests, `vl_probe_rollback_test.ts`
  and `vl_scaling_shape_test.ts`.
- `check-filed-witnesses --strict` on both inventories: 4,703 as filed, 0 moved.

`vkind-census.vl --slots`: the map-value bank's name producers go from 9 to 5.

## What is left in the bank

The five that remain are `mvSlotOfValNameFindK`, `mvSlotOfMapNameTy(s)` and
`mvSlotOfMapValNameOrMonoKTy(s)`. Their slot is now the type's. The name still decides two things:

- **Mono-ness**, through `mvValKindOfNameTy` over the canonical spelling.
- **The key kind**, through `mapNameKeyKind` in `mvSlotOfMapNameTys`.

They convert when those two read the type (`mvValKindOfTy`, `tyMapKeyKind`), and the mint stops
taking a spelling. That is the next step in this bank.
