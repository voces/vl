# The pin's own type, as a column (2026-11-07)

Step 1 of the pin-type-column lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4, the naming rule). Slice 2b found that an instance's pin is the parameter's substituted
annotation, while the only type column the makers carry, `pinTys`, is the argument's type:
`len<T>(t: T[] | i32)` pins `i32[]|i32` and `pinTys` holds `i32[]`. Two name→type parses stay live
because of it, `monoInstanceFor`'s `nameToTy(pinnedNames[j])` fallback and `monoKeyPinSeg`'s row
class read from the name.

## What the column is

`pinOwn`, parallel to `pinned` and `pinTys`, from both makers to `monoKeyPinSeg`
(`monoMakeInstance` → `monoMakeInstanceGo` → `monoMakeInstanceKeyOf` and `monoTypedInstKey`).
`monoPinColsMisalignedFail` checks all three columns are parallel.

| pin site | `pinOwn` |
|---|---|
| un-annotated parameter (`monoPinHoleParam`) | `pinTys`, after `monoExactPinTys`: there the pin is the argument's type |
| concrete annotation | the annotation's type, `nodeTyIxOf(p.parType)` |
| concrete annotation at a wider record (D14532), composite closed by the elaboration, mixed-instance list (D15210), tagged set, tagged-set list | the type the site spells the pin from |
| type-parameter composite (`monoPinTyParamComposite`), `T[]` | the declared pattern under the typed bindings (`monoClosedSlotTyAt`), -1 where it stays open |
| bare `T` | the binding's type, as `pinTys` |
| `monoInstanceFor` | a concrete annotation's type, else the boundary's, which a type parameter's substituted annotation is checked against there |

Nothing reads the column for a decision yet. Under `$VL_REP_SHADOW`, `monoPinOwnRowNote` notes
whether `monoKeyPinSeg`'s row class from the name agrees with `typeRowClassOf(pinOwn[pk])`.

## Measured

A throwaway probe build that `emitFail`ed at the first disagreement, over the sweep population
(23,610 programs): **90 programs** disagree. That is fewer than the 108 where the name's class
differs from `pinTys`' (slice 2b). In 86 of them the name resolves to no row and the column holds a
record. The commonest are `{x:i32}` (10), `{f:i32}` and `{r:i32}` (8 each), and a record holding a map,
`{m:M[i32:(string|string)]}` (7). The other four differ in the type itself. In two the column types
a nullable record's field `never` (`?{z:i32}` against `?{z:never}`), the empty literal's type where
the name has the filled one. In one it drops a union field (`{x:i32|string}` against `{x:i32}`),
and in one a list's nullable (`?[{a:i32}]` against `[{a:i32}]`).

Candidate built to a fixpoint (two `refresh-compiler.sh` runs, byte-identical), against the base
fixpoint (`claude/argtyname-s2b` at `c4ef0335`, master `409a3a79` merged):

| | |
|---|---|
| sweep | 23,610 of 23,610 same (0 bytes-only, 0 output movers) |
| seed | 6,452,706 → 6,455,330 bytes (+2,624, 0.04%) |
| pin-helper budget (`emit_mono.vl`) | 944 → 944 (the closing and the shadow live in `pin_spell.vl`) |

## Not done in this step, and what step 2 needs

- **`monoInstanceFor`'s 13 callers still hand names only.** The column there is built from the
  parameters and `pinTys`, so where `pinTys[j]` is -1 the `nameToTy` fallback still supplies it
  (280 programs, slice 2b). Retiring it needs each caller to pass the type it derived the name from.
  Several callers parse the names out of a signature string (`monoSigPins`,
  `monoFnTypeAnnParamsName`), so they have no type to pass yet.
- **Switching `monoKeyPinSeg` to the column is not byte-identical by construction.** In the 86
  programs above, a pin keyed by spelling today would be keyed by row class. That merges instances
  only where two spellings share a row. The four type disagreements need triage before the switch:
  each says the column and the name denote different types, and only one of them is the pin.
