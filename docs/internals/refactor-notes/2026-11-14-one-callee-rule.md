# 2026-11-14 — one rule for "the function a call through a binding runs" (D16072, lane I)

## What changed

`calleeFnOfDecl` (check_scopes) is now the one place that resolves a binding to the function a call
through it runs: a `FuncDecl` resolves to itself, and an un-annotated `const` bound to a lambda
resolves to that lambda. An annotated `const` stays excluded, because calls go through its declared
type, which may convert. `calleeFnDeclOf` asks it for an `Ident`.

These now delegate to it:

- emit_elab's `elabCalleeFn`, which had its own copy of the rule;
- mono's delivery path (`monoDeliverCallAt`, `monoRetsReachHoleLam`), where D16070 had added a
  third copy, `monoIdentCalleeDecl`, now deleted.

## What stays `FuncDecl`-only, and why

Routing more readers through `calleeFnOfDecl` was tried and measured against #7905's head over
the 24,265-program sweep population. Two programs stopped running:

| reader | program | refusal |
| --- | --- | --- |
| emit_elab's 14 `identFnDeclOf` readers | `functions/hole-lambda-const-by-name-to-unread-hole-param.vl` | `parameter g of apply is pinned at another type than the elaboration's` |
| `monoCalleeDeclOf` (value_reach; `vrArg`, `monoRetSlotsSplit`, `monoInertArgFns`) | `objects/records-of-generics-at-two-types-into-one-narrower-param.vl` | `a generic function taken as a value reaches no call that fixes its type` |

So those readers keep answering only a `FuncDecl`. A `const`-bound lambda read there is a value,
with a pin of its own, not a direct callee. emit_mono's argument-position `identFnDeclOf` reader
stays too, since an argument is not a callee. Bisected one group at a time.

## Measured

- **The change as landed, merged with master `b1999185`:** two refreshes cmp-identical. Sweep
  against that master's fixpoint seed: 24,286 of 24,286 programs the same, 0 bytes-only movers,
  0 output movers, 0 `runs -> not-runs`, 0 new compiler traps. Against #7905's head before the
  merge, 24,265 of 24,265 were the same.
- **The position matrix** (`hole-lambda-returned-by-{lambda,function}-at-two-types`): unchanged at
  33/48 and 39/48. D16072's six cells are a pin-path gap, not a resolver gap (see the row).

## Found on the way

D16073: 16 emit-time `fnName == ""` / `!= ""` tests run after `collectFns` names every lambda
`__lambda_N`. A trap-on-renamed-lambda build swept to convergence found them.
