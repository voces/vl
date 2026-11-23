# IR coverage: a join of member literals into an atom (2026-11-20, lane IR4)

`pre-path atom hook` was the only blocker for 8 self-compile functions at master 5463886d. A
scratch-labelled seed showed that every one of them, and every one of the 11 self rows at the
merge-base, fires the hook's third arm. That arm is a join of member literals the checker typed
`string`, delivered to an atom destination. Examples:

- `const k: K = if c { "ab" } else { "cd" }`;
- the same through `let`, an assignment, or an argument.

A `return` of the same `if` was already covered. Legacy's hook (`emitExpr`, after
`nodeHasWideStrLit` and `strReppedLitUnionAt` decline) writes `emitIfExprAs(if, fnIx, 127)`:
an i32-typed `if` whose arms take the atom destination, so each literal is its id.

## What changed

- **`hookTakesAtom` splits** into `hookTakesAtomPure` and the `rawReadNode` test.
  `hookTakesAtomPure` is the type-only half: `hookMayConvert`, then `strLitTakesAtom`. Legacy
  calls both in the same order as before, so its bytes do not move.
- **`atomHookIfJoin(ix, fnIx, live)` is the third arm's decision**, in the hook's order:
  `hookTakesAtomPure`, not a string literal, `!nodeHasWideStrLit`, `!strReppedLitUnionAt`, then
  `ifJoinArmsAllStrLit`. `live` also asks `rawReadNode`.
- **`ifExprPlainWhy` splits off `ifExprShapeWhy`.** That is the shape `emitIfExprAs` owns: an
  `else`, lone arm values, walked preludes, no optional guard, no integer switch. The join-rung,
  ref and valtype checks stay with `ifExprPlainWhy`, which describes `emitIfExpr`'s own dispatch;
  the hook bypasses that dispatch with a known blocktype.
- **The builder**, in `deliver`, handles an `RAtom` destination whose node's pre-path is exactly
  `pre-path atom hook` and `atomHookIfJoin(ix, fnIx, false)` holds:
  - it builds `ifExprAt(…, dst, dstTy | repTyOf(dst))`, the first link at the destination's rep
    and type, so each arm delivers its literal at the atom;
  - such a link asks only `ifExprShapeWhy`;
  - a chain misses `atom if join chain`;
  - a non-literal arm leaves the predicate, and its `if` misses `expression if atom join`.
- **The lowering re-asks.** `valuedIfOpen`, for an atom out whose node `atomHookIfJoin(…, false)`
  names, requires `atomHookIfJoin(…, true)` and opens at blocktype 127, the type the hook passes.
  Otherwise it misses `atom if join raw read`.

**`rawReadNode` at these sites.** `emitExprRaw` sets it to one node while that node is read as
the string it is stored as. Its callers are a condition (`emitCondExpr`), `as` to a literal union
(`emitAsBoxToLitUnion`), the string-to-atom writers (`emitStrToAtom`, its chain,
`emitDestStrToAtom`) and `emitStaticLitAtom`. The hook compares only that node. A builder delivery
of the same node never runs inside such a read, so the pure half and the live one agree wherever
the builder takes this arm. The lowering's re-ask covers a door fragment rooted at a node a raw
read is in progress for: there the live answer is false, and the fragment misses.

## Grading

Fixpoint seeds at merge-base 48a54c094 against the head.

| | base | head |
|---|---|---|
| self covered | 19,049 | 19,055 |
| self matched | 19,048 | 19,054 |
| self `pre-path atom hook` | 11 | 0 |
| self `atom if join chain` | — | 3 |
| corpus covered / matched | 95,643 / 95,629 | 95,643 / 95,629 |

- **Self:** the one covered-but-unmatched function, and master's `encArms` rule-3 row (#9289's,
  fixed on ir5-stagefix), are the same on both sides.
- **Corpus:** its 33 `pre-path atom hook` rows take the hook's other two arms (the wide literal
  and the string-repped union), so they do not move.
- **Witness: tests/cases/literal-unions/if-join-of-member-literals-into-atom.vl.**
  - A declaration, an assignment and an argument are each matched.
  - A non-literal arm stays a named miss.
  - The program prints its `@log` lines under both seeds.
- **The checker refuses a literal outside `K`:** "`"zz"` is not one of K".

| bar | result |
|---|---|
| `ir-identity --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity --cases` | identical 7,542, differ 0; witnesses 60/60 |
| base-vs-head tests/cases A/B (legacy's hook changes shape) | 7,610 programs, 7,542 built, differ 0 |
| mode 3 | identical; 19,034 claimed (base 19,024) |
| L2 fuel, candidate vs base fixpoint | +0.010% (104,625,921,038 → 104,635,932,373) |
| matrices `atom-cell-narrowed-to-one-literal-at-atom`, `atom-in-mixed-string-eq` | 62/62 and 64/64, 0 runs → not-runs |
| plumb-shape cost, `gate.sh --fast` | ok / passed |
