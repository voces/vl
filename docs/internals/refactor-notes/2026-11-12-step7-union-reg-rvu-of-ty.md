# Step 7 L6 (lane G, cut 5a): a value union is registered from its type, 2026-11-12

The base is master `8e0bb32c`. `registerValueUnionNameAB(site, name, ty)` registers a value-union
row under `name`. The row's member set is split from that name (`recordUnMemTys`), so every
caller built a spelling to hand over. This cut gives the registry a typed entry,
`registerValueUnionOfTy(site, ty)`. It names the row by the spelling its type gives:
`valueUnionNameOfTy(ty)`, else `valueUnionKeyTextOfTy(ty)`, the names C3a's box path already uses.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, compared each call's
name with the name its type derives, over the sweep list (24,020 programs graded). Each call is
graded by what the registry does with it.

| site | calls | the derived name |
| --- | --- | --- |
| every site but 47 and 55 (21 call sites) | about 44,000 | equals the caller's name, or binds the row the caller's name is bound to (47 calls), or the type's key row (39) |
| 55, the inline registrar | 9,578 | differs in 243 calls in 187 programs (below) |
| 47, an optional call's result | 57 | none in 1 call: `D10130`'s `i32|null`, which the type declines |

The value-union verdict by type alone agrees with the verdict that also reads the name at every
site but 47 (the same call).

**Site 55's differences** are spellings of one union:

- member order: `f64|i32` against `i32|f64`;
- an alias against its literals: `K|i32` against `i32|K`;
- D4320's one-list: `f64[]` against `f64[]|f64[]`.

A row's tags are per kind, so a rename moves no tag. Site 55 is cut 5b, graded by sweep.

## What the census missed, and the first candidate's regression

The census graded the derived name, not every input the entry reads. One class still read the
caller's name: sites 56 to 59. They name the row by the inner member's rep kind
(`nulNumScalarUnionName`), so a function set's id registers as `i32|null`. `nulNumScalarUnionRowTy`
hands over a type only for a primitive inner. Otherwise the entry resolved the name
(`declTyIxOfName`), and the typed entry has nothing to resolve.

The first candidate converted all 13 of this lane's typed sites. `regress.vl` lost 147 classes,
every one `emitProgram: scalar map read has no value-box type` in the D15116 family (a map of
generic functions), and 47 inventory witnesses moved.

- **Bisected:** reverting sites 23, 50, 54 and 60 changed nothing; reverting 56 to 59 restored
  every class.
- **Suspected, then cleared:** those four sites have calls the entry skips (the type says no value
  union), where the entry still binds the caller's spelling to the type's row before skipping.
  With them converted again and 56 to 59 kept on the name, regress, the witnesses and every gate
  are clean.

The census method needs one addition before the floors below move: grade every call whose type
is -1, not only the name it derives.

## Changed

- `registerValueUnionOfTy(site, ty)` (`emit_union_atoms.vl`) is the typed entry.
- Eight call sites drop their names:
  - `emit_collect` 21 and 22 (the inferred `if`-expression and optional-chain lets), 23 (×2, the
    inferred let and join unions), and 54 (a list field's union code);
  - `emit_obj_lit_fits` 51's typed call;
  - `emit_sections` 50 (an `as` value union) and 65 (an `as?`'s numeric fallible result);
  - `emit_union_atoms` 60 (a map value's union).
- `emit_sections` no longer imports `asExprNumTgtName` or `registerValueUnionNameAB`.

## Floors, each with its reason

| site | why it keeps the name |
| --- | --- |
| 56, 57 (×2), 58, 59 | the name is the rep's (`nulNumScalarUnionName`); a non-primitive inner has no arena type here |
| 47 | D10130's `i32|null`: the type declines and spells no value union |
| 51's literal-set call | the widened set (`valueUnionNameOfSoftTy`) has no arena type |
| 55 | cut 5b: 243 renames by member order or alias spelling |
| lane E's 7, 8, 61, 62, 63 | lane E's file; handed over with this entry and the census (0 differences) |

## Proof

- **Seed:** fixpoint, 6,716,260 bytes.
- **Locally:** lint-self, regress (no runs lost), rep-fuzz, check-filed-witnesses `--strict` (0
  moved), late-demands, seed-size, render-parse, dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. Expected identity.
