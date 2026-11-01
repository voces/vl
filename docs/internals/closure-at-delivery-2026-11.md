# Which closure is built at the delivery — design, 2026-11

One question answered once: when a value holding a hole lambda or a generic reaches a call,
which built closure does the call run? Two lanes need the answer and must not mint two rows for
it: the D14841 bundle (one parameter called at two signatures, inc3) and the per-delivery token
(a value crossing a binding, a result or a container before its call, step7 slice 2).

Status: draft. The mechanism half is inc3's; the population and acceptance half is step7's.

## Mechanism (inc3)

### The shared row

**One row per built closure: `(creation site, closed signature) → fe`.**

- *Creation site* is the arena node where the closure's environment is captured: the lambda
  literal, or the declared function's name read where it becomes a value.
- *Closed signature* is the `TyFunc` the closure is built at, with every hole closed. A tagged
  set's type counts as closed; its rep is the member id.
- *fe* is the emitted function slot whose body is the lambda instanced at that signature.

The key is an i32 pair, never a spelling. This follows the destringify ruling: no new name
spelling and no extension of an existing one. The row is written in exactly one place, where
mono mints the clone (`monoCloneLambdaPinned`, or the private-body clone). Every reader asks
the row; no reader re-derives the clone. The emitter-state audit holds it as per-program state.

### What the elaboration answers

The elaboration answers *at which signatures*, never *which closure*.

- `elabBundleSigs` (WIP, `claude/inc3-s14`) maps (callee instance, parameter index) to the
  closed signatures that instance calls the parameter's lambda at. They are deduplicated and
  kept in first-call order.
- Two or more signatures, on a set the tag decision leaves untagged, make a bundle.
- The WIP keys this map by a `k|i` string; it moves to an i32 pair before landing.

A nested lambda has no elaboration instance of its own today. The shared row is what supplies
one: the creation site plus the signature. Two dead ends found by step7 on G1, so nobody
repeats them:

- `elabKeyAtPos(nested lambda)` answers the ENCLOSING instance's key: 3 traps and 1 wrong
  output.
- `elabNodeTy(elabSrcDecl(fx), k)` stays open for a nested lambda.

### The bundle (D14841)

A parameter called at two or more signatures receives one closure per signature, carried as
one value.

- **Lowering:** an anonymous arena record `{c0: sig0, c1: sig1, …}`, one field per signature,
  in `elabBundleSigs` order. Each field is the shared row's closure for (the argument's creation
  site, that signature).
- **Decision:** mono decides the bundle at the top of `monoPinHoleParam`, from
  `elabCallBundleSigs`. There is no post-elaboration rewrite of the tree.
- **The callee's body:** each call through the parameter reads the field for its own
  signature.
- **The elab fact:** stays the signature list; the parameter keeps its function type there.
- **Scope:** a parameter only. A bundle crosses as an argument and is never stored. Crossing a
  result or a container belongs to the delivery token (below).

### Landing order

- (a) The shared row and its one writer. Existing clones are recorded; nothing reads the row
  yet, so the seed is byte-identical.
- (b) The bundle. `monoPinHoleParam` decides, and the callee reads fields. Graded on D14841's
  grading list with the split plan off.
- (c) The delivery token reads the row (step7's half).

### Matrix

The bundle record is an anonymous record, so its position matrix must include a same-shape
USER record (`{c0: (i32) => i32, c1: (f64) => f64}` written by hand) beside the bundle. That
proves the two never share a row they should not.

## Population and acceptance (step7)

*To be written by step7:*

- D14901 class C (36);
- the 8 class-B lambdas;
- D14784 class 4 (15 sites).

Each comes with its witness files and the grade that counts as accepted.

Overlap file between the halves: `functions/hole-lambda-param-called-at-two-types.vl` is the
D14841 shape itself.
