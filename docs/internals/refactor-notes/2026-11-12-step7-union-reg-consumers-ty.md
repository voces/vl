# Step 7 L6 (step C5): the map-arm, heap-arm, leaf-arm and `??` join consumers take the union's type, 2026-11-12

The base is master `264e61179`, after C4 (#7457).

## Changed

A new reader, `unionTyArms(ty, atoms, tys)` (emit_map_twins), returns the arms of union type
`ty`. Where `ty` keys a row whose members all resolved, those are the row's recorded arms.
Otherwise they are the type's own members (`msSetOfTyAny`). `unionTyHasAtom(ty, atom)` asks
that list. These consumers now take the type alone:

| consumer | was |
| --- | --- |
| `unionHasMapArmSlot(ty, slot)` | `unionSetArmTysAB(104, name, ty, ..)` |
| `mapBoxTagOf(sh, ty, ..)` | `unionSetArmTysAB(106, name, ty, ..)` |
| `unionHasAtomLeafArm(ty, d)` | `unionSetArmTysAB(105, name, ty, ..)` |
| `unionArmVariantWithHeap(ty, heap)` | `unionRowKeyAB(85, set, ty)` |
| `coalNicheBoxTag`'s atom test | `unionHasAtomTy(joinSet, ..)` |
| the scalar `??` join's atom test | `unionMemberSetOf(joinN)`, then `unionHasAtomTy` |

`emitCoalesceMapJoin` no longer hands its name to the map-arm questions.

## Census

A scratch probe compiler was run over the cases and cells. Each call's answer from name and type
was compared with `unionTyArms`'s answer from the type alone:

| consumer | same | differ |
| --- | --- | --- |
| site 104 | 308 (112 programs) | 0 |
| site 106 | 113 (35) | 0 |
| site 105 | 5 (1) | 0 |
| heap arm (85) | 2,472 (48) | 0 |
| ref-array arm | 357 (123) | 0 |
| `??` niche atom | 63 (29) | 0 |
| `??` scalar atom | 12 (6) | 0 |

Sites 87 and 91 to 95 (the `is`-arm and receiver readers) and 102/103 (the shape interns) do
disagree. They pass a declared or receiver type rather than the union's own, and the free
member set cannot cover a list or map member. They are not this cut's.

## Refused: the ref-array arm test

`unionHasRefArrayArmSlot` keeps its name. The census agrees on all 357 corpus calls, but the full
sweep found one inventory witness where the type-only answer moves: D4937's
`probe<V>(v: V[][] | string)` called with an `i32[][]`.

- **The old answer** reads the name's generic row (`V[][]`). It finds no arm for the
  `i32[][]` slot and refuses at the delivery.
- **The type-only answer** finds the instance's `i32[][]` arm and boxes, which is the sound
  delivery.
- **The result:** the program then reaches D4937's own defect. The instance's `is f64[][]` test
  emits invalid wasm (`expected struct type at index 8, found (array (mut i32))`).

That is a new compiler trap, so it is refused here. The ref-array test converts once D4937's
`is` lowering in the instance is right.

## What is left

- `unionMemberSetOf(joinN)` in the ref and bool `??` joins, which feeds
  `coalJoinDefaultBoxes`, `unionArmVariantForStructExpr` and the bool join's atom test.
- The ref-array arm test (above).
- `emitNulMapArmBox`'s name, which goes to `emitUnionBoxOwed` beside its type.

## Proof

**Local full sweep:** in the PR.
