# Step 7 L6: an `__array_new__` ref list mints by its fill type; `rlElemStructRow`'s name rung is a named floor, 2026-11-12

Lane F's cut 6, stacked on cut 5 (`2026-11-12-w311-reflist-cut5-open-template-field-by-type.md`).
It takes one of the decisions read off a ref-list row's stored name, graded in cut 5's note, and
measures the largest one.

## `refListElemNameOfExpr` is deleted

`collectArrNewIntr` (`emit_collect.vl`) interned a ref-list `__array_new__`'s row under the name
`refListElemNameOfExpr` gave. That name was the expression's row's stored name, else the fill
record's struct-row name. It was that function's only caller.

Validated `emitFail` probes, over the sweep population (24,178 programs), first marker per program:

| probe | programs |
| --- | --- |
| control: the ref arm reached | ≥ 26 |
| the call mints a row where the expression already has one | 0 |
| it mints a row where the expression has none, with a fill type | 3 (`D1629`'s object-literal fill) |
| the expression has no row and no fill type | 0 |

So where the expression has a row, the call only finds that row again. The arm is now three cases:

- the expression has a row: return;
- it has no row but a fill type: mint keyed by the fill type, labelled by the fill record's struct
  row;
- it has neither: an invariant `emitFail`, which no program reaches.

`refListElemNameOfExpr` and the `rlInternName` import are gone.

Fixpoint seeds, cut 5 (with master merged) against cut 6, the whole population (24,186): all the
same, 0 bytes-only.

## `rlElemStructRow`'s name rung, measured: a floor

`rlElemStructRow` (`emit_shape_rows.vl`) finds a ref-list element's struct row in four rungs.
Three read the type. The last is `structIndexByName(nonNulBaseOf(rlElemName[slot]))`. Lane H's
`nonNulBaseOf` census assigns that rung to this lane.

Validated probes: the control reaches the last rung in ≥ 989 programs. The name rung answers in
15. A type rung cannot reach any of the 15:

| class | programs (first marker) | the row's recorded type | the name's row |
| --- | --- | --- | --- |
| a field holding a function hole (D15804) | 8 | `{f: (_) => _}`, which renders "" | the tagged set's `{f:i32}` |
| a record of functions (D15552) | 6 | `{fs:((i32)=>i32)[],x:i32}` | the same render, a row keyed by its function-value sets |
| D15922's open template row | 1 | the open type | `#anonN` |

These rows are the ones `rlKeyTyOf` declines (cut 2). The rung, and its `nonNulBaseOf`, stay as a
named floor.

**The contracts for these floors:**

- **A function-value-set row has no element type, so it is keyed by its set.** That covers
  `rlElemStructRow`'s name rung for D15804 and D15552, and `rlKeyTyOf`'s decline of a record or
  list that holds a function.
- **A type that holds a type parameter is not a rep.** A template's row is keyed by its open type
  (`rlRowOfOpenTyMinted`, cut 5). Each instance's row is keyed by its closed type. `rlKeyTyOf`
  therefore declines an open type as a closed key, and D15922's open template row reaches the name
  rung only for its label.

`sFieldRefSlot` and the former `rlRowOfNameMinted` are converted in cut 5: the open type keys
them, and no name does.

## The ref-list name producers: none is keyed by a name

`vkind-census.vl -- --slots-list` classifies a producer by its first parameter. After cut 5 it
still listed two reflist producers as `name`. Neither was keyed by a name, so this cut changes
their signatures:

- **`calleeAnnRetRefListSlot`** took the callee identifier's text, but only to resolve that
  identifier in scope. It now takes the identifier node and reads the text itself. **Contract:**
  a call's callee is resolved as a symbol in scope, and the row is the one its declared return
  annotation banks (`annBareRefArrSlot`); no type spelling is read. **Witness:**
  `tests/cases/closures/hole-fn-list-unbound-and-returned.vl` runs. A validated probe shows it
  reaches the annotation row; it is the one fixture in `tests/cases` that does.
- **`rlRowOfOpenTyMinted`** (and `rlOpenRowMint`) take the open type, its key, first, and the
  stored label second.

The census now reads `node` and `type` for them, so no reflist producer reads `name`. Fixpoint
seeds before and after this change, over the whole population (24,191 programs): all the same.

## The `emit_base.vl` predicates this lane's stack frees

The coordinator asked for this list, so that lane E can delete the predicates. Each one below has
no caller in `compiler/` at this tip, other than its own definition. Each had at least one on
master `f7b6b8d9`:

| predicate | freed by |
| --- | --- |
| `mapValNameOf` | cut 3 (`shapeFieldElemName`'s map legs) |
| `nameIsI32ListArray`, `nameIsMapArray`, `nameIsClosureArray`, `parenUnionArrElemName` | cut 4 (the refArr* cluster) |

`nameIsI32KeyedMap` and `tyIsStructWithLitUnionField` have no caller on master already.

## Proof

Refresh to a fixpoint, at 6,716,628 bytes. `scripts/gate.sh` passes in full: deno tests,
ci-native, self-compile, lint-self, seed-size, late-demands, plumb-shape cost, dead-export and
render-parse budgets, rep-fuzz, filed witnesses and the distilled corpus.
