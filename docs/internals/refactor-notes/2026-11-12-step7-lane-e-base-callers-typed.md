# Step 7 L2: emit_base's scalar-list predicates' last callers read the type; eleven predicates deleted, 2026-11-12

Lane E, cut E4, by coordinator ruling. Lanes F and G cleared the callers in their files.
`emit_base.vl` held 6 render-parse parse sites behind a family of spelling predicates:

- `nameIsI32Array` and `nameIsStringArray`;
- `nameIsLitUnionArray` and `nameIsStrLitSet`;
- the `nameIsNul*List` niche lists;
- `nameIsNulLitUnion` and `nulLitUnionScan`;
- `nameIsNulString` and `nameIsNulBool`.

Their callers outside the family were six sites:

| site | file | decides |
| --- | --- | --- |
| `checkArrName` | emit_shape_rows, from `collectATypeRef` | an array annotation's rows are the i32 list's |
| `rlElemStoredName` | emit_shape_rows, from `rlInternNameTy` | a ref-list row's stored spelling folds to `i32[]` or `string[]` |
| `gaeArgIsTyParam` | emit_shape_rows | a type-parameter argument named for a literal-union alias is not a parameter |
| `shapeFieldElemName` | emit_shape_rows | a code-4 field records its literal-set element |
| `annShapeIndexOf` ×2 | emit_shape_intern | a code-4 field's atom bit, and the dedup split on it |

## The typed predicates

Three new `emit_base` predicates read the list's element type:

- **`tyIsI32List(ty)`.** True for a list with an element of `i32`, `boolean` or `null`, a string
  literal set (one literal included), a numeric literal union over `i32`, `boolean | null`, or a
  literal set with `null`.
- **`tyIsStrList(ty)`.** True for a `string` or `string | null` element.
- **`tyIsStrLitSetList(ty)`.** True for a string literal set, one literal included.

## Probe

A scratch compiler, never refreshed into a seed, tagged every reach of every site. It compared
the spelled answer with the typed one into one accumulator per program, raised as a single
`emitFail` at the end of `emitProgram`. A plain program with an `i32[]` annotation was the
reach control. The population was the sweep's 24,191 programs.

| site | reached (programs) | first draft disagreed | shipped |
| --- | --- | --- | --- |
| `checkArrName` | 2,006 | 39: numeric literal-union lists (`Z[]`, `(1 \| 2)[]`) render `i32[]` | 0, with the numeric literal-union arm |
| `rlElemStoredName` | 7,203 | 9 typed, plus 43 with no key hint; one changed fold (`K[]`) | 0 |
| `shapeFieldElemName` | 1,058 | 0 | 0 |
| `annShapeIndexOf` ×2 | 0 | — | — |

Two notes on these rows:

- **`rlElemStoredName`.** The key hint is -1 by design at three callers:
  - `ensureRefElemTys`, which holds the element's type as `kindTy`;
  - the empty-literal nested rescue and the literal list mint, which keep a literal's name key
    (D15770).
  These now pass the element type they hold through `rlInternNameTyK`'s `kindTy`, which decides
  only the fold, never the key. For the two literal sites, that type is the literal's build-type
  element. The literal's own node type was tried first and disagreed on D10770's
  `("a"|"b"|null)[][]`, whose inner literal records `string[]`. The element kind alone was also
  tried: it disagreed on `f64[]`, `i64[]` and `u8[]`, which share kind 4.
- **`gaeArgIsTyParam`.** It is decided without a probe. Its argument is a bare identifier that
  `gaeParamShadowed` has already declined to be `i32`, `boolean` or `null`. For such a name,
  `nameIsI32Array(base + "[]")` holds exactly when `base` is a declared literal-union alias.
  That is now `tyIsLitUnion(cUserTypes[base])`.

## Deleted

- From `emit_base`: `nameIsI32Array`, `nameIsStringArray`, `nameIsLitUnionArray`, `nameIsStrLitSet`,
  `nameIsNulBoolList`, `nameIsNulStrList`, `nameIsNulLitUnionList`, `nameIsNulLitUnion`,
  `nulLitUnionScan`, `nameIsNulString` and `nameIsNulBool`.
- From `tyname`: `arrElemIs`.
- `checkArrName` becomes `checkArrTy(ty)`.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `cb558bf3` against the candidate: 24,191 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass, on the branch and on the tree merged with master `68905c69`.
- Render-parse with `--findings`: 9 renders, 10 → 6 parses. `emit_base.vl` goes from 6 to 2.
  `--write-baseline` is in this PR.

## What stays in emit_base

`nameIsMap` and `nameIsMapMemberUnion`, 2 parses. Their only caller is `nameIsBareMap`, from
`emit_map_value_slots.nulMapInnerName`, which the coordinator assigned to lane H. They go when
it reads the type.

Comments in other files still name the deleted predicates, as the structural duals they were.
They are left for lane F's comment sweep.
