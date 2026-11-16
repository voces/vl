# L2: a member call on a parameter from inside a closure (D16877), design notes, 2026-11-16

Working notes for (ii), the closure half of the alias-receiver family. They record the mechanism
measured so far; the change is not built yet.

## Where it stops today

**Checker.** `ufcsSitePinnable` (`check_call_resolve.vl`) requires the call to sit in the owner's
own body (`owner == curFnDeclIx`). Inside a lambda, the constraint owner (`cstrOwnerTop`) is the
outer generic, but `curFnDeclIx` is the lambda, so the site is refused. The refusals are D2520's
closure cell, the overload closure cell, and `.indexOf`/`.slice`'s row demand.

**Emitter.**
- `monoPinBinOps` (`emit_mono.vl`) is the per-instance re-dispatch walk, the last rung of the
  instance-body pipeline (`instBody = monoPinBinOps(instBody4, pElemNames, pinnedTyIx)`). It
  treats `FuncDecl` as a leaf, so no site inside a lambda is re-dispatched.
- Lambdas are lifted into `fnStmts` slots before that rung. `monoCloneBody` rebuilds only the
  statement spine and shares every nested lambda.
- `monoCloneLambdaSubst` clones a lambda's signature, but shares its body, and only when an
  annotation substitutes. A lambda like `() => { a.get("a") }` is never cloned, so its one body
  serves every instance. `a.get` reaches emit with no callee resolved: D16877's
  `callee is not a function name`.

## What a close needs

1. **Force a per-instance clone.** When a lambda in an instance body holds a site whose receiver
   resolves (`aliasRootParam`) to the instance's parameter and no lambda parameter shadows it,
   force a per-instance clone. Install it through `monoLamInstallClone`, which sets the slot, the
   frame parent and the capture bookkeeping.
2. **Rewrite the clone's body** with `monoPinBinOps` under the outer pins minus the lambda's own
   parameters (`monoPinDrop`).
3. **Then widen the checker:** `ufcsSitePinnable` accepts such a site in a nested lambda. This
   goes last, because widening the checker before the emitter can lower the site would ship
   clause-1.

## Risks to measure

- Captures and boxes: a forced clone must keep `monoLamParentOf`'s frame, so free names resolve.
- Code size: only lambdas holding such a site are cloned.
- A lambda nested two deep, one returned, one stored in a record.
