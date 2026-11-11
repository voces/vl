# Step 7 L6: the union registry's callers hand over the type their spelling names, 2026-11-11

The union registry census (`2026-11-11-step7-union-registry-census.md`, cut order item 5) found
splits where the type a caller hands over is not the named union's: `null` for `i32|null`, the
inner of a nullable, a narrowed arm. A lookup can only be re-keyed by type once its caller holds
the right type. This PR threads that type at every such site the probe below finds.

The base is master `92de53cf`.

## The probe

A scratch compiler, built in the scratchpad and never refreshed into a seed, recorded every
reach of a typed registry entry where the spelling names a row and the canonical key of the type
in hand (`utkTyKeyText`) is not that row's key (`unTyKey`). The entries are the census's: the
`*AB` seams with their site, plus `msSetOfNameTy`, `unionArmsOfTy`, `unionSetAtomsOfTy` and
`unionSetHasNullTy` with their caller's file and line. Each program that reached the end of emit
with a record failed with it, so one `vl check --batch --json --codegen` pass over `tests/cases`
(7,725 files) read them all.

A split counts as a wrong type when the two keys' members differ after softening literals and
newtypes to their base, so the spelling-coarser classes (a literal the spelling softens, a newtype
member, two literal sets under one spelling) are left out. Those are the ruling's, not a caller's.

| | wrong-type reaches | programs |
| --- | --- | --- |
| master `92de53cf` | 452 | 81 |
| this PR | 53 | 7 |

Over all splits, 2,040 reaches in 155 programs become 1,638 in 86.

## Changed

Each family names the type its spelling renders:

| family | reaches (programs) on master | the type handed over now |
| --- | --- | --- |
| a nullable function set boxed as `i32\|null` (`emitCoerced`, and `emitAssignIdent`'s recorded box) | 266 (42) | `boxRecordUnionTyOf`: `i32 \| null`, the type `boxRecordNameOf` names |
| a union field's member set in `emitCoalesceUnionField` | 33 (13) | the narrowed box's type (`memReadBoxNarrowTy`), else the field's declared element type |
| the print plan's member set and its map-miss `null` (`printUnionPlanCode`) | 67 (10) | `unionBoxTyIxOfExpr` |
| `memberUnionFieldName` (site 13) | 24 (4) | `unionBoxTyIxOfExpr` |
| a box compared or tested against a literal (`msSetOfUnionBox`) | 22 (9) | `unionBoxStoreTyOf`, else the read's own type |
| the `??` join of a nullable record or boolean (sites 83, 85 below it) | 4 (1) | `boxDstTyOf`: the type of the row the recorded union names |

- **`unionBoxTyIxOfExpr`** (`emit_classify.vl`) is the type `unionNameOfExpr` names for a read of a
  box. For a map read, that is the map's value union, not the read's `V | null`. For a narrowed
  read, it is the storage the read is narrowed out of (`readNarrowedStoreAt`). Otherwise it is
  `unionDeclTyIxOfExpr`. `unionBoxStoreTyOf` is the same without the declaration fallback.
- **`boxDstTyOf`** (`wasmEmit.vl`) is `boxDstNameAt`'s twin: the type of the row
  `unRowOfRecordTy` finds for the recorded union, else the value's own union.
- The print plan's leaf types (`printPlanLeafTys`) still read `unionDeclTyIxOfExpr`. Only the
  set lookups move.

## What is left

The 53 reaches in 7 programs:

- **Spelling-coarser, the ruling's** (40 in 5): a map value's literal set
  (`{[string]: 1 | 2}` under `{[string]:i32}`), a newtype (`F32x4 | null` under `v128|null`), a
  numeric-literal list arm (`Z[] | i32` under `i32[]|i32`, D4320). The classifier keeps these
  only because they also change a member's shape. The type is right, and the spelling is coarser.
- **A local bound to a map read** (4 in 1, `literal-unions/atom-store-into-mixed-union.vl`):
  `const x = mm["p"]` names the map's value union `K|f64` while its storage is `K | f64 | null`.
  The name drops the miss's `null`, so the type is right and the name is not.
- **An open map value inside a hole instance** (5 in 2,
  `unions/shared-mixed-field-read-through-hole-param.vl`): the map's value type is the
  template's `_`. It is open on master too.

## Proof

- **Bytes.** Every `tests/cases` file (7,725) was built with a master L1 seed and with this
  candidate's L1 seed, both built by one seed. 7,725 of 7,725 are the same: exit code, module
  bytes, and the diagnostic with digits erased. The comparer was checked on a control: against
  the probe compiler it reports all 3 control programs. CI's sweep grades the whole population.
- **Locally:** one refresh, lint-self, rep-fuzz, distilled `regress.vl`, seed-size,
  late-demands, and the dead-export and render-parse budgets.
