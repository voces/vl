# Step 7, lane H, cut 1: the field-code ladder reads no spelling without a type, 2026-11-12

`fieldCodeOfSpelling` and `nameFieldCode` (`emit_shape_rows.vl`) answered from the field's
arena type where the caller passed one, and from its spelling where it passed none. Two VKind
producers fed the ladder from the spelling alone: `scalarListRepOfName` and `nulScalarListKind`.
This cut removes the spelling-only input.

The base is master `e071cea1` (compiler as at `cf01f012`), with a fixpoint seed on both sides.

## Census

The probe was a scratch compiler, never refreshed into a seed. Each probe site added a tag to an
accumulator, and `emitProgram` raised every tag as one `emitFail`. The channel was checked first
against a control: an unconditional tag fired on a plain program. The population is the sweep's,
24,070 programs.

**Untyped reaches of the ladder.** Every arm was tagged, with its caller.

| caller | spelling | programs | answer |
| --- | --- | --- | --- |
| `internShapeAs` | `i32` | 775 | 0 (`i32`) |
| `nameFieldCodeTy` (`internInlineShapeTyGo`) | ` i32` | 377 | -1 |
| any other caller, or any other arm | — | 0 | — |

`internShapeAs`'s rows are struct-alias unions: `type AB = A & B`, `type MyCat = Cat`, and arms
that all spell one shape. Its type `cUserTypes[key]` is a `TyUnion` whose members are that shape's
`TyObj`, in all 10 distinct row/shape pairs. `shapeFieldRowOf` asked the union for a field and
found none.

**The two spelling producers against the type's rep**, at every reach:

| producer | agree | spelling null, type a scalar list | disagree | untyped |
| --- | --- | --- | --- | --- |
| `scalarListRepOfName` | strlist 751, list 343, f64list 70, i64list 34 | 0 | 0 | 0 |
| `nulScalarListKind` | nuli64list 44, nulstrlist 39 | 0 | 0 | ` i32` only (null) |

The rep column compared against is `repOfTy(ty)`'s covered kind.

## What changed

- **`nameFieldCode`** answers -1 for a field with no type. Its arrow test, and the ladder's
  literal-union, list, nullable-string, nullable-boolean and nullable-literal-union arms, ask only
  the type. The spelling legs they had are gone: `annArrowAt`, `nameIsLitUnionType`, `nameIsArray`,
  `nameIsNulString`, `nameIsNulBool` and `nameIsNulLitUnion`.
- **The list arm** asks `scalarListRepOfTy`, the type's covered rep when it is a non-null list
  other than the ref list. `scalarListRepOfName` (`emit_mv_slots.vl`) is deleted.
- **The nullable scalar-list arm** asks `nulScalarListFieldCode(ty)`, the type's covered rep when
  it is a nullable list other than `nullist` and `nulreflist`. `nulScalarListKind` is deleted.
- **`internShapeAs`** reads each field's type from `aliasShapeObjTy(asTy)`, the alias union's first
  member. Every variant spells the one shape (`unionStructAliasShape`). The row's own type alias
  (`structTyIxAlias`) still records `asTy`.

## Measurement

- **Seed:** 6,735,476 → 6,735,437 bytes, both fixpoints.
- **render-parse:** parses fall 40 → 36 (`nulScalarListKind`'s `nullablePartOf`, the ladder's
  `nameIsLitUnionType` and `nameIsArray`, and `nameFieldCode`'s `annArrowAt`). Renders stay at 12.
  The baseline is rewritten in this PR.
- **vkind-census:** the "rendered name" family is 2 → 0.
- **Sweep** (`sweep.vl diff`, fixpoint seeds both sides): 24,170 same, 0 bytes-only movers, 0 output
  movers, 0 `runs → not-runs`, 0 new compiler traps. The cut is byte-identical on the population.

## What is left in the ladder

The arms that still read `t` are reached only with a type: `t == "i32"` and the other scalar
names, `nameIsInlineLitUnion`, `nameIsOneStrLit`, `nameIsString`, `isValueUnionName`,
`isUNameDeclAB`, `nameIsStructDecl`, `armFieldStructRow` and `armFieldDeferredRowOk`. Cut 2
compares each against a typed predicate. `funcTypeShapeLowerable` and `internShapeAs` call
`nameFieldCode` directly, not `nameFieldCodeTy`. In 836 programs the descriptor codes a
`funcTypeShapeLowerable` field 15 where the ladder answers -1 (the nested-shape recursion), so
routing those callers through the descriptor moves behaviour, and is a separate cut.
