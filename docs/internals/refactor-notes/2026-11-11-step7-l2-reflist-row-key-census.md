# Step 7 L2 §7: the ref-list row registry under a type key, census (docs), 2026-11-11

The L2 deviation says every ref-list row is still minted under a name. This note measures what a
type key would merge or split, before any conversion. Base is master `8c3feff9` plus #7169. The
population is the sweep's 23,885 programs. Counts are **programs**.

## What keys a row today

`rlInternNameTy(name, kind, ty)` dedups on `repElemIdOfNameTy(name, ty)`:

- When the caller passes a type, the key is `repElemId(ty)`, the type's rep key.
- When it passes -1, an `#anonN` struct row first takes its literal's record type
  (`anonRowTyOfName`). Any other spelling is resolved to a type (`resolveAnnot`), or hashed as a
  name where it does not resolve.

So the registry is already keyed by type wherever a type arrives. The name decides the key only on
the unhinted mints.

## Who mints with no type

The probe was an `emitFail` in `rlInternNameTy` on `ty < 0`, tagged by call site. It reports the
first unhinted mint of each program. The control: a program that runs on base fails with the
tagged marker on the probe build.

| first unhinted mint (by site) | programs | of them, the spelling resolved |
| --- | --- | --- |
| `rlInternName` (the map-value record arm rows, `newArr`'s untyped fill) | 1,767 | all |
| `ensureRefElemKindTail` (a nominal element's key hint is withheld by design) | 1,305 | all but 1 |
| `collectAArrayLit`'s list mint (`arrLitElemHintTy` declines) | 1,193 | all |
| `collectA`'s parameter-list mint (`rlInternNameTy(pn, k, -1)`) | 32 | all |

## Would a type key give the same row?

At each unhinted site, the probe compares the name key `repElemIdOfNameTy(name, -1)` with the type
key `repElemId(T)` of the type the caller holds. There is one compiler per site, firing on
disagreement. A control compiler fires on agreement at every site.

| site, `T` | agree (control, first per program) | disagree |
| --- | --- | --- |
| map-value arm row by arm name, `T` = the arm type | ≥ 922 | **0** |
| map-value record row `sNames[vsi]`, `T` = `sTyIx[vsi]` | ≥ 678 | 92 |
| `ensureRefElemKindTail`, `T` = `kindTy` | ≥ 1,329 | 24 |
| `collectAArrayLit`'s list mint, `T` = the list literal's element type (`rlHintElemTy`) | ≥ 890 | 624 |

The disagreements by class:

| class | arm-row record | kind tail | list mint |
| --- | --- | --- | --- |
| `#anonN` literal row against a record type | 80 | 9 | 2 |
| the type holds an inference hole (`(_) => _`) | 6 | 5 | 260 |
| the type holds a type parameter | 6 | 0 | 29 |
| a declared name against another type (`R` against `{f: (i32) => i32}`; `Circle` against `Shape`) | 0 | 7 | 109 |
| a list element name against the list literal's type (`i32[]` against `(i32 \| null)[]`) | 0 | 0 | 136 |
| a placeholder closure name (`(()=>void)`) against a typed closure | 0 | 0 | 55 |
| other or cut | 0 | 3 | 33 |

## What this says

- **The arm-row mints convert as they stand.** The arm's type gives the same key in every program.
- **`#anonN` rows have two type producers that disagree.** The row's `sTyIx` and the literal's
  record type (`anonRowTyOfName`) differ (`emit_union_atoms.vl` names this). The type key needs one
  record type per anonymous row first.
- **A declared name is keyed nominally on purpose.** `R` and its structural twin stay apart. A type
  key must keep the declaration identity, which is Family B's
  (`2026-11-11-step7-famb-decl-identity-census.md`), not a structural key.
- **A hole or a type parameter in the type is not a key.** These rows wait for the instance's type.
- **The list mint's available type is the wrong one.** `rlHintElemTy` is the list's element type,
  and a literal of `Circle` in a `Shape[]` mints `Circle`'s row. The literal's own element type
  (`arrLitArenaElemRow`) is the comparison to measure next.
- **Placeholder closure names** (`(()=>void)`) are spellings that denote no type. Converting them
  removes a name that keys rows by accident.

## Proposed order

1. Pass the arm type at the map-value arm-row mints (0 disagreements, expected byte-identical).
2. Give each `#anonN` row one record type. Then pass it at the record-row and kind-tail mints.
3. Measure the list mint against the literal's own element type, and convert the classes that agree.
4. A declared name keeps its declaration identity through Family B. Hole and type-parameter rows
   stay named until the instance's type exists.

## Changed in this PR: step 1

- The map-value arm-row mint passes the arm type: `rlInternNameTy(armNm, RLK_STRUCT, armTy)`. The
  key agreed in every program that reached it (0 of ≥ 922). The row's recorded type changes from
  `fieldElemTyIxOfName(armNm)` to `armTy` in 4 programs, all the `Dot` arm
  (`distilled/cells/b02142{5,6,8,9}.vl`). The 4, and 22 sampled from the 954 that reach the site,
  build byte-identical wasm against the base seed.
- One refresh, at 6,613,982 bytes. `regress.vl` reports no runs lost. lint-self, rep-fuzz (exact),
  seed-size and the render-parse budget pass. The full population is graded by CI's Sweep job.
