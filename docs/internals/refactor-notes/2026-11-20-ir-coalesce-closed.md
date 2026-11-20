# IR coverage step: the closed coalesce arm, 2026-11-20

Lane F2. A coverage step under `ir-design-2026-11.md` §10. Measured on fixpoint seeds of this branch
and master `c13255ce8`.

## Why this class

`coalesce closed` held 75 corpus functions on its own. These are generic instances whose `??` left
operand is closed to a type with no `null`, such as `orD<T>(x: T, d: T): T { return x ?? d }` at
`i32`, and legacy writes the left operand alone.

The arm was parked behind STORE's map-receiver step (#9191). Most of these instances also read
`m[k] ?? d` on a parameter map, so before #9191 they missed there instead.

## What landed

- **The decision, shared.** `coalClosedWidensAtom(lhsIx, exprIx, fnIx)` is exported from
  `wasmEmit.vl`. It decides whether legacy's closed arm widens an atom left operand to the `??`'s
  own rep: the member string, or the box of a join (D16530). Legacy's `emitCoalesceGo` asks it in
  place of the inline test it replaces.
- **IR.** `coalesce` builds the `closed` arm as the left operand at its own rep. Where the decision
  widens the atom, it misses with `coalesce closed atom`. Where the left operand's rep is not the
  `??`'s, it misses with `coalesce closed coercion`.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| corpus functions covered (45,678) | 37,467 | 37,542 |
| self-compile functions covered | 16,846 | 16,848 |

Shadow mode 1: everything covered is verified and matched. Compiler lines: +22 net (25 added, 3
deleted). The 3 deleted lines are legacy's inline test and its comment, moved into the shared
decision.
