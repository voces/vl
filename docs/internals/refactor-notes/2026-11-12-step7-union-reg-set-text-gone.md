# Step 7 L6: the member-set-text lookup is deleted, 2026-11-12

`unRowOfSetText` found a row from an unbound member-set spelling through the softened key
(`unKey`), behind `unionRowOf`. It was the last reader of that key with hits. The census on
master `b817b7f1` counted 806 hits in 17 programs: 792 through site 53, the map value's union
row (#7389), and 14 through text callers.

## Changed

- **Site 53** (`mvShapeOfValNameArmTyGo`) asks whether the spelling is bound to the type's row
  (`unRowOfName`), not `unionRowOf`. A spelling bound elsewhere, or bound nowhere, takes the
  name of the row the type keys to.
- **`unionRowOf`** answers from the bound row alone. `unRowOfSetText` is deleted.

## The 14 text hits

Each of the 14 was in one of six programs. On an L1 build without the set-text lookup, all six
print master's output. So do the cluster's own program and every other program the census
found reaching the lookup. Their callers already fall back to the row the union's type keys to.

## The movers, graded

A probe compiler recorded each spelling site 53 renames. Every bytes-only mover is a rename of an
unbound member-set spelling to its type's registered row name. None is an `#anon` name. Each
mover's output is unchanged.

| program | rename |
| --- | --- |
| D1037, `maps/recursive-alias-declared-first.vl` | `f64\|JO\|null` → `f64\|{[string]:J}\|null` |
| D15058 | `{k:i32}\|{s:string}` → `U` |
| D3511 | `i32\|i64` → `U` |
| `generics/union-projection-into-hole-param.vl` | `i32\|string` → `Val` |
| `maps/churn-sliding-window-every-rep.vl` | `{kind:"c",r:f64}\|{kind:"s",side:i32}` → `Shape` |
| `maps/map-value-union-struct-map-field.vl` | `{f:{[string]:boolean}}\|f64` → `Boxed` |
| `maps/narrowed-alias-union-value-print.vl` | `i32\|i64` → `U`, `i32\|string` → `V`, `i64\|i32` → `D` |
| `unions/is-twin-arms-lone-literal.vl` | `{tag:"a",v:i32}\|{tag:"b",v:i32}\|{w:i32}` → `W` |
| `unions/narrowed-arm-read-through-index-place.vl` | `i32\|{r:i32}` → `M` |
| `unions/narrowed-arm-unannotated-binding.vl` | `i32\|{r:i32}` → `M` |

Lane w310's warning case, `maps/inferred-map-literal-record-list-union-narrowed.vl`, whose row
is named `#anon0[]|i32[]`, prints master's output and is not a mover.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `b817b7f1`:

  ```
  same                            23965
  bytes-only movers                  11
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```

  These are the same 11 as site 53's change alone: the deletion adds none.
- **Locally:** lint-self (an unused import removed, and the seed is byte-identical after it),
  rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling tests,
  emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan, seed-size,
  late-demands, and the dead-export and render-parse budgets.
