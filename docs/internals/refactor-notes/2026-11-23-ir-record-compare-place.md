# IR: a record compare operand at its place, 2026-11-23

Lane IR-N4. Base: master 6cf67777d. Class `record compare place operand`, 23 `@start` bodies and
two functions on master 953e649b's fixpoint.

## Change

When legacy's `structEq` route does not stash an operand (`structEqStagesLeft`/`Right` false, so
`unionEqOperandOk` holds), `emitStructEq` re-reads it from its place at every field: `structEqRoots`
gets the place, not a local. The IR took only a plain variable there, and a top-level `const` is a
global, so every compare in a start missed.

- **Builder** (`structEqSide`): an unstaged operand may be a place chain (`structEqPlaceRead`). Its
  AST is a `Member` chain over a name, and its nodes are exactly the chain's `let`s in order: a
  global's read (`RGlobalGet`), a narrowed nullable variable's (`RRecover`) or a variable, under
  field reads (`RGetField`).
- **Lowering** (`structEq`): such a side (`structEqPlaceSide`) takes no local. Its temps are
  consumed unwritten (`irLSkip`, which skips a field read's receiver), and `structEqRoots` writes
  the place as legacy does.
- **Narrowing** (`fieldNullTemp`): a typed `null` field whose kid rep `k` its type does not intern
  to (`repNodeOfTy(repTyOf(k)) != k`) is the named miss `record field null rep`. The wider coverage
  reached `type T = { name: string, l: T | null, r: T | null }`, whose first null field's kid rep is
  a provisional nullable its type does not intern to, so the temp failed verifier rule 3. Master
  fails rule 3 on the same literal at a call argument; that is now the named miss too. The rep
  layer's cause is the record-literal and field-storage lane's.

Every new piece is a helper, out of `node` and the object-literal loop, whose frames a nested
lowering pays per level.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `structEqPlaceRead`, `structEqPlaceSide` | `emitStructEq` through `structEqRoots` and `unionEqOperandOk` (`emit_base.vl`) |
| `fieldNullTemp` | none in legacy; it states `ir_verify.vl`'s rule 3 (`repNodeOfTy(vTy) == vRep`) |

## Legacy tails the IR calls

- None new.

## Witnesses

READINGS
