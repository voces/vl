# Identity typing (A), consumers 2 and 3: the (S1) map and the keyed bindings (2026-11-07)

Follows [consumer 1](2026-11-07-bake-reads-keyed-callee.md). Each change below was shadowed first.
A temporary row compared both answers at every keyed decision, and was deleted after the switch.
Population: the 23,450 programs, `$VL_ID_SHADOW=1`.

**Decisions:** 1,577 = 1,472 keyed + 105 declined (77 `open`, 28 `nobase`, 0 tagged). Unchanged.

## Consumer 2: the (S1) map, from a key to mono's instance

The map sits on the elaboration's spec-group rows. `elabSpecMonoSlot` records the slot of mono's
instance at each decision, beside `elabSpecMonoGroup`. `elabSpecSlotOfKey(k)` answers the slot for
argument-keyed instance `k` (`elabSpecInst`). At a keyed decision whose key already has a slot, the
registry reuses that slot, in both paths: `monoSpecializeConcrete` and `monoMakeInstanceGo`. Mono's
`@name` string key still serves the declined decisions and every other instance.

| at a keyed decision | decisions |
|---|---|
| a fresh instance, the key new to the map | 1,416 |
| a reuse, the map's slot is the one mono's registry hit | 56 |
| only the map reuses, or only mono | **0** |
| the two name different slots | **0** |

**The bake's callee is the key's declaration.** The brief expected a generic callback to resolve
to mono's instance slot. Measured, that never happens at a keyed bake: at all 1,175 rewritten calls,
`monoFnDeclNamed(cbFnNames[p])` is the declaration the key names for `p` (`elabSpecDeclsOf`).
A generic callback is declined as `open`, so it never has a key. The keyed bake now takes
`identFromDecl` from the key (`elabSpecDeclFor`). Mono's name path runs only at unkeyed bakes.

**Not dead:** `monoInstDeclOf` and `monoFnDeclNamed`. Five other sites still resolve minted names
through them: the unkeyed bake, the alias-init rename, two operator and push callees, and the
lambda-by-name call.

## Consumer 3: the hole and seed bindings

- **`monoHoleBinding`** runs where the call key does not bind the instance. That is every keyed
  decision, since a baked callback is a function-holding parameter. At a keyed decision,
  `elabSpecHoleBind` now binds each hole parameter to its type in the key's base instance
  (`elabSpecBindOf`). Shadow: 1,036 hole names all `same`, and 1,265 of 1,265 keyed builds give the
  same whole binding list (names, order and types). It falls back to mono's derivation only where
  the base leaves a hole unbound or the hole is not a bare type variable. Neither case occurred.
- **`monoBindSeededTyParams`** already took its decision from `elabCallSeedBind`. At a keyed
  decision, its type is now the base instance's binding. Mono still supplies the spelling. One
  binding in the population, `same`.

`monoHoleBinding` stays. The 105 declined decisions use it, and so does every instance that is not
callback-specialized.

## Proof

Fixpoint seeds on both sides. Base: master `fa202cbb` (#6726 merged). `scripts/sweep.vl` diff:
23,613 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 new traps. The switch is
byte-identical on every program. Seed: 6,473,613 → 6,476,019 bytes (+2,406, +0.04%). The pin-helper budget holds at 931: the new
facts are elaboration functions, and mono's two lookups are inlined.
