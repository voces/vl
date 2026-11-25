# IR: a built record list's rep is the row legacy lays it out on (lane COV-UNION, 2026-11-25)

The adopted-storage-row family (coordinator, 2026-11-25): a value's IR rep follows the row legacy
lays it out on. Three lanes found pieces of it: COV-UNION's eight `index element coercion` rows,
COV-START's object field, argument and map rows, and COV-IS's kept-maker list rows. This change
takes the list half.

## Mechanism

`exprRepOf` asks `listRowRep` after `rowlessRecordRep`. A built value (no place read: not an
`Ident` or a `Member`) whose type is a list of plain records, and whose ref-list row
(`refListSlotOfExpr` → `rlElemTyIxAt`) holds another plain record, takes the list of that row's
element. `outTyOf` types its temp at that row's list, and so does `spreadLit`, which had typed its
temp off `exprTyOf`. Bindings inherit the rep from their initializer. `refListSlotOfExpr` is the
function the lowering's element read already takes its row from, so the builder and the lowering
cannot disagree about the row.

The typical source is a kept maker: `mk2()` returns `{ f: null }`, `const dA: J = mk2()` keeps it,
and legacy builds every `mk2()` record at `J`'s row. Every list of them is `J`'s array while the
checker types it `{ f: null }[]`.

## Tried and dropped

- A binding-level rule (a list local or global takes its own `letRefListSlot` row): 31 bindings in
  22 programs, none of the targets. The mismatch is in the values a binding is initialized from,
  so a global is noted at its initializer's rep before any binding rule runs. No gain; dropped.
- A record rule (a built record takes its `structIndexOfExpr` row where that is another plain
  record): no gain on COV-START's record rows. `getX`'s literal is laid out on its own type's row,
  and the open question there is the IR's record subtyping (`sub $1`). D17402 and the rowless arm
  row differ in field reps. Dropped.

## Measurements

- Population (full census + self, counting probe): the rule fires 491 times in 461 programs (146
  cases, 239 distilled, 74 witnesses, 1 probe) and once in self (`emitPassTable`, which stays
  claimed).
- Master vs this tree over those 461 programs + self: claimed 23,012 → 23,025, unclaimed 52 → 41,
  0 claims lost. Gained the start bodies of D16212, D16615, D16765, D16784, D16792, D16838,
  `d16132_spread_of_built_unann.vl`, `annotated-callback-over-built-list.vl`,
  `record-holding-list-of-built-lists-element.vl`, `same-elems-result-in-literal.vl` and
  `record-built-wider-in-literal-beside-declared-shape-runs.vl`, plus self's two new helpers.
  `list-callback-at-kept-maker-build-runs.vl` moves from `print operand rep` to `index element
  coercion` and stays unclaimed.
- Self: the fixpoint holds (a second `refresh-compiler.sh` is cmp-identical, 7,512,992 B). Master's
  compiler source compiled by this tree's seed and by master's own compiler is cmp-identical, so
  `emitPassTable`'s bytes do not change and there is no self-compile fuel delta.
- rep-fuzz: exact, 0 new, 0 stale.
- Q58 sweep `tests/cases/lists/kept-maker-records-list-at-adopted-row-in-each-position.vl` (a list
  literal, a slice, a filter, a spread, a list of lists, a record field): its start missed `index
  element coercion` before and is claimed after; output equal to master's.

## Open in the family

- `generic-list-call-binding-beside-own-instance-runs.vl`, `d15293_bound_returned.vl` and
  `list-callback-at-kept-maker-build-runs.vl` (`index element coercion`).
- COV-START's maps (D13902 and two cases): legacy picks the map cell's slot per binding
  (`letCellSlot`).
- COV-START's record rows (D17402, the rowless arm field, `getX`) and D16916's list → list field.
- COV-CLOS's D17015.
