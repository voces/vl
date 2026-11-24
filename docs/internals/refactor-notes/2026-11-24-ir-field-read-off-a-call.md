# IR: a field read off an open-typed call, 2026-11-24

Lane IR-N2. Base: master 637158ab8. Class `start: field read coercion`, family H (D17163).

## Change

- `buildMember` (`ir_build_ref.vl`) typed its receiver with `nodeTyAt`. For a hole maker's call
  that is the template's open record (`{f: (_) => _}`), whose kid rep is a closure over `unsup`.
  `irBExpr` builds the same receiver at `exprTyOf`'s type, the callee's result as the IR holds it
  (`resultTy`, `{f: (i32) => i32}`). The read wants that kid, so it missed.
- `builtRecvTy` takes `exprTyOf` for an open-typed call or member receiver; any other receiver,
  and any receiver typed closed, keeps `nodeTyAt`.
- `exprTyOf` types an open field of a call-built receiver at its kid type in the receiver's built
  record (`builtFieldTy`), so `mk2(inc0).r` is asked at the rep its own read builds; the chain
  recurses (`mk5(inc0).a.b.c.d.f`).

## Predicates and their callers (R8)

| function | callers |
| --- | --- |
| `exprTyOf` (existing, now exported) | `irBExpr`'s operand types; `builtRecvTy` |
| `builtFieldTy` (new) | `exprTyOf` |
| `builtRecvTy` (new) | `buildMember` |

Legacy reads the field at the receiver's storage row (`structIndexOfExpr`, row 0
`{f: () => void}`); its bytes do not depend on the type chosen here, and the witness module is
byte-identical claimed and claimless.

## Left open

- A module binding of the field (`const r = mk2(inc0).r; r.f(5)`) keeps `field read coercion`,
  unchanged from base; its cause is not established. It is the remaining `@start` miss of
  `hole-fn-in-nested-maker-record-read-inline.vl`. Of the six cells, the one that declines by a
  different name is this change's own fixture (`shared member callee kid`, its `?.` lines).
- `mk(inc0)?.r.f(3)` and `mkn(inc0, true)?.r.f(3)` decline by name (`shared member callee kid`,
  `open temp type`).
- Found while probing, on master and claimless alike, filed separately: a nullable record of a
  hole function bound and read (`emitProgram: ref valtype with no interned shape`), and
  `mk(inc0).r?.f(3)` (`object literal field count does not match struct`).
