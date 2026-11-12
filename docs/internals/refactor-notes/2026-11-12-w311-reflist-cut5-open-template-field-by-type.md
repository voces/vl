# Step 7 L6: a template field's open ref-list row is keyed by its type; `rlSlotByName` is deleted, 2026-11-12

Lane F's cut 5. The last two callers of `rlSlotByName` were the template-field floor. A struct
field whose element is an open type (`T | K`) was minted under its stored name and found by that
name. The field column now records the open type (`sFieldElemTyIx`), so the open type keys and
classifies the row. Stacked on cut 4 (`2026-11-12-w311-reflist-cut4-d15778-ref-list-field-by-type.md`).

## What changed

| site | was | now |
| --- | --- | --- |
| `sFieldRefSlot`, field at an open type | `rlNameMint(tn, ty)`, then `rlSlotByName(tn)` | `rlOpenRowMint(tn, ty)`, keyed by `ty`, then `rlSlotOfTyOrTwin(ty)` |
| `sFieldRefSlot`, field with no type whose name resolves to none | `rlNameMint(nm, -1)`, then `rlSlotByName(nm)` | -1 |
| `rlRowOfNameMinted` (`emit_collect.vl`) | name lookup, then a name-keyed mint | `rlRowOfOpenTyMinted`: `rlSlotOfTy(ty)`, else `ensureRefElemTys(nm, ty, ty)` |
| `rlSlotByName`, `rlSlotByNameK` | the name lookup | deleted, with no caller left |
| `repRowOfName` and its helper `renderFaithful` (`emit_rep.vl`) | dead since cut 4 | deleted, along with the five test comments that named it |

The no-type arm is reached by exactly one program over the sweep population:
`generics/generic-record-of-list-param-list-return.vl`, a field of `{xs: string[]}` whose element
name is empty. Before this cut, an empty name minted nothing and the lookup found nothing, so the
answer was -1 then too. A loud floor there cost that program (runs → emit reject), so the arm
returns -1 instead.

## Sweep

Fixpoint seeds, cut 4 (with master merged) against cut 5, the whole population (24,178): 24,177
the same, 1 bytes-only, 0 output movers, 0 runs → not-runs, 0 new compiler traps. The mover is
`closures/maker-returns-record-holding-bound-list-of-fn-records.vl` (D15922's template field). It
is 2,051 → 2,048 bytes with the same 51 types, one local fewer and the same output.

## Counts

- `rlSlotByName` and `rlSlotByNameK`: deleted.
- The reflist name producers in `vkind-census.vl -- --slots-list` drop from 4 to 2:
  - `calleeAnnRetRefListSlot` stays a floor by kind: it resolves the callee function's symbol and
    finds no row by a type spelling;
  - `rlRowOfOpenTyMinted` is listed because it takes the stored label as a string. Its key is the
    open type.
- render-parse is unchanged (13 / 28).

## `rlElemName`'s readers, graded

The coordinator asked for each reader of a row's stored name to be graded:

- **LABEL:** output (a module name, a diagnostic, a printable key). A label needs nothing.
- **DECISION:** something is decided off the name. A decision converts, or is a named floor.

There are 19 readers on master after cut 1.

| site | reader | grade |
| --- | --- | --- |
| `driver.vl` type-index → name | a diagnostic | LABEL |
| `emit_collect.vl` list-of-lists `emitFail` | message | LABEL |
| `wasmEmit.vl` `rlWidenElemName` | message | LABEL |
| `emit_collect.vl` `rlListOfRowMinted` | the label stored at a mint keyed by `mkArrayTy(rlElemTyIx[r])` | LABEL |
| `emit_sections.vl` `typeSeeds` | the seed text that orders type indices | LABEL (an ordering key, no semantics) |
| `fn_ret_shadow.vl` | the A/B shadow of `fRetRArrElem` | LABEL (checks the row below) |
| `emit_reloc_keys.vl` `rl:<name>` | the reloc section's link symbol | floor: a printable link key, like `clo:` |
| `emit_shape_rows.vl` `rlElemStructRow` | `structIndexByName(nonNulBaseOf(name))`, its last rung, 18 callers | DECISION |
| `emit_union_registry.vl` `rlElemUnionName` | the name, where no single registry row holds the member set, 14 callers | DECISION |
| `emit_union_atoms.vl` `elemUnionHasArrayMember(name)` | parses the spelling | DECISION |
| `wasmEmit.vl` `unionBoxEqColumns(name)` | picks the compare columns | DECISION |
| `emit_classify.vl` `refListElemNameOfExpr` | the name handed to 2 callers | DECISION |
| `emit_classify.vl` spread destination row | the name handed on | DECISION |
| `emit_classify.vl` `forInPairUnionElemName` | a union name, 2 callers | DECISION |
| `emit_classify.vl` `forInIterUnionElemName` | a union name, 3 callers | DECISION |
| `emit_classify.vl` closure element of an `Index` | the name resolves a signature | DECISION |
| `emit_map_value_slots.vl` `annBareRefArrElemName` | the name handed to 3 callers | DECISION |
| `emit_obj_lit_fits.vl` | the name returned | DECISION |
| `emit_collect.vl` `buildFnMapPutRow` | `fRetRArrElem`, read as `repOfFnSlot`'s element name | DECISION |

That is 6 labels, 1 link-key floor and 12 decisions. In size order, the decisions are:
`rlElemStructRow`'s name rung (lane H's census also assigns its `nonNulBaseOf` to this lane),
`rlElemUnionName`'s fallback (union registry, lane G), the two union-column readers, and five name
hand-offs in `emit_classify.vl`. Each needs the reader to take `rlElemTyIx[slot]` instead.

## Proof

Refresh to a fixpoint, at 6,718,888 bytes. `lint-self.sh`, `regress.vl` (no runs lost),
`rep-fuzz-check.sh` (exact), `check-filed-witnesses --strict` (4,849 as filed), late-demands,
seed-size (+2.0%), plumb-shape-cost and the render-parse budget pass.
