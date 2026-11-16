# L2: a member call on a parameter from inside a closure is picked per instance, 2026-11-16

(ii), the closure half of the alias-receiver family (D16877; D2520's closure cell). Stacked on
the alias half (`2026-11-16-l2-alias-receiver.md`). The coordinator approved it 2026-11-16, with
a stop rule: if a per-instance clone breaks captures or boxes, report rather than widen.

## Three places stopped it

1. **Checker.** `ufcsSitePinnable` required the call to sit in the owner's own body
   (`owner == curFnDeclIx`). Inside a lambda, the constraint owner is the outer generic but
   `curFnDeclIx` is the lambda.
2. **Rewrite.** `drwRecvIsTyParam` judged the receiver against the lambda being walked, so the
   rewrite fixed a closure's call to the in-scope function once, for every instance, before mono.
3. **Mono.** `monoPinBinOps` treated a lambda as a leaf. Its clone (`monoCloneLambdaSubst`, made
   per instance for a capturing lambda) shares the template's body.

## The change

- **Mono.** `monoCloneLambdaSubst` runs `monoPinBinOps` over the clone's body. It uses the
  instance's parameters and pins (`monoLamPinN`/`T`/`Ctx`, set around
  `monoMakeInstanceBodyPinned`), less the parameters the lambda binds. A nested clone inherits the
  narrowed set.
- **Rewrite.** `drwRecvIsTyParam` judges a receiver against the function whose parameter it holds
  (`aliasRootParamOwner`).
- **Checker.** `ufcsSitePinnable` drops the own-body requirement. The receiver's resolution to the
  owner's parameter is what the emitter now needs.

## The order-dependence the first version had

Without the rewrite fix, a string instance built first printed `fn` where `he` was owed (D2520's
old miscompile); built second, it was right. Grading every program in both orders of its
instances caught it. That check is now permanent:
`scripts/capability-probes/matrix/member-call-per-instance-both-orders.matrix.vl` holds 30 cells,
each program in both orders.

## Measured

Against #8805's fixpoint seed:
- **Grid:** 20 of 20 run. The adversarial closures run: two deep, in a record, returned, an alias
  inside. A lambda parameter shadowing the name is unchanged.
- **Both-orders matrix:** 60 of 60 cell-faces run, 20 of them gains.
- **`check-filed-witnesses --strict`:** 5,390 of 5,390 as filed. D16877 closes.
- **Fingerprint, one worktree:** 7 of 20,764 move.
  - The 2 new cases and the renamed D2520 fixture.
  - 4 `d3290_*_clo_*` named cells and `member-call-mutating-builtin-through-local.vl`: identical
    output, emitted bytes smaller (760 → 752, 774 → 766, 3,290 → 3,275).
- **Other gates:**
  - `regress.vl`: 0 / 0, no movement.
  - `decl-order-ab`: 0 clause-1.
  - 228 matrices: 0 lost, traps or silent.
  - Case suites: 8,124 pass. Fixpoint holds.
- **Cost:** seed +1,147 bytes. Self-compile fuel +0.015%.
- **Phase state:** `emit_rewrite` surface +1 (`aliasRootParamOwner`) and `emit_mono` hidden +3
  (the scoped `monoLamPinN`, `monoLamPinT`, and `monoPinCtx` in `monoLamPinBody`). The
  baseline is rewritten.

## Found and filed

[D16882](../inventory/D16882.md): a string or list built-in (`.slice`, a string's `.indexOf`)
called on an un-annotated parameter is refused at the pin as an unmet row demand, in a closure or
out of one. The member rule asks the demand as a field, never as the built-in at the solved
receiver.
