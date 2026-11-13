# A call's union name carries its row; a declared union reads its alias members by type, 2026-11-13

Lane A, from lane G's list; it closes `unionNameOfCall`'s rows in closing census 5's failing
column. Emit only.

**`unionNameOfCall` (emit_classify).** Probe over the full sweep population (24,204 programs);
which rung named the call, and whether it recorded the row its type keys to:

| rung | sites / programs | row |
|---|---|---|
| declared callee's annotation | 751 / 66 | recorded |
| the same, literal-union annotation | 12 / 1 | none; the widened call type's row is the name's row at all 12 |
| inferred value-union return | 3 / 3 | recorded; its literal-member branch is never reached |
| inferred registered return | 7 / 5 | recorded |
| checker's recorded type (`nodeUnionName`) | 17 / 7 | recorded |
| registered struct union | 11 / 5 | recorded |
| list `pop`/`get` box, `$fnsig` value call, instance hole parameter, nested type parameter | 0 | — |

- The annotation rung now also records its row when the call's type with literal leaves widened
  (`widenLitTy`) keys to it.
- The unreached literal-member branch, and the four unreached rungs, are loud floors
  (`callNameFloor`), not names without a row. `callUnionNameOfTy`, used only by the `$fnsig`
  rung, is deleted.

**`collectDeclaredUnion` (emit_collect).** Its two `unionSetAtomsOf` splits of an alias member
now read the member's type (`unionTyArms`). Probe, member type against the spelling:
- **Nullable alias member** (15 programs): atoms identical.
- **Whether an alias member expands** (22 checks): the spelling counts a literal-union alias as
  one atom, and the type as one arm per literal. The decision is "more than one arm, and not a
  literal union" (`tyIsLitUnion`), and with that it agrees everywhere.
- The type resolved at every site; an unresolved one is a loud floor.

**Dead parameters.** `markRefArrayArms` and `markMapUnionArms` lose the name parameter #7702 left
unused, along with its callers' spellings.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,204 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.
