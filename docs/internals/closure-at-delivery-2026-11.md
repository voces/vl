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

**A creation site inside a generic instance is per instance.** If a list literal of hole functions sits in the body of a function with two instances, a member handed each instance's own set needs one closure per instance. Today the element-at-set path (#5693) keys the element node once (`monoElemAtSet`). That is why #5673's shared-member partial clause has to stay. Measured on `run(h) { const fs = [apply2, apply3]; for f in fs { f(h) } }` with `run(add); run(mul)`: dropping the clause prints `3 4 3 4` for `3 4 2 3.75`. So the row's creation site is the node in the instance's copy, or the pair (node, instance), and the clause narrows to holders shared across instances only once that keying lands.

The key is an i32 pair, never a spelling. This follows the destringify ruling: no new name
spelling and no extension of an existing one. The row is written in exactly one place, where
mono mints the clone (`monoCloneLambdaPinned`, or the private-body clone). Every reader asks
the row; no reader re-derives the clone. The emitter-state audit holds it as per-program state.

### What the elaboration answers

The elaboration answers *at which signatures*, never *which closure*.

- `elabBundleSigs` (WIP, `claude/inc3-s14`) maps (instance, declaration node) to the closed
  signatures that instance calls the declaration's value at. The declaration is a parameter, or
  a binding the bundle admits (below). They are deduplicated and kept in first-call order.
- Two or more signatures, on a set the tag decision leaves untagged, make a bundle.
- The WIP keys this map by a `k|i` string (callee instance, parameter index); it moves to the
  i32 pair (instance, declaration node) before landing, which serves a parameter and a binding
  alike.

A nested lambda has no elaboration instance of its own today. The shared row is what supplies
one: the creation site plus the signature. Two dead ends found by step7 on G1, so nobody
repeats them:

- `elabKeyAtPos(nested lambda)` answers the ENCLOSING instance's key: 3 traps and 1 wrong
  output.
- `elabNodeTy(elabSrcDecl(fx), k)` stays open for a nested lambda.

### The bundle (D14841)

A parameter or an admitted binding called at two or more signatures holds one closure per
signature, carried as one value.

- **Lowering:** an anonymous arena record `{c0: sig0, c1: sig1, …}`, one field per signature,
  in `elabBundleSigs` order. Each field is the shared row's closure for (the argument's creation
  site, that signature).
- **Decision:** mono decides the bundle at the top of `monoPinHoleParam`, from
  `elabCallBundleSigs`. There is no post-elaboration rewrite of the tree.
- **The callee's body:** each call through the parameter reads the field for its own
  signature.
- **The elab fact:** stays the signature list; the parameter keeps its function type there.
- **Scope:** a parameter, or a binding that is local, never re-pointed (`const`, or a `let` with
  no write), and whose every read is a callee or a positional argument to a parameter that is
  itself bundled. The record lives in the binding's local instead of crossing as an argument. A
  binding returned, stored in a container, or read by a function nested in its owner is no
  bundle: the first two are the delivery token's (below), and the third has one body for every
  instance (D14842). Crossing a result or a container belongs to the delivery token.

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

A value holding a hole lambda or a generic is polymorphic until it is called. Where it crosses a
binding, a function result or a container, the crossing must carry the closure that is BUILT for
the signature the destination calls it at. That closure is the shared row's answer for (creation
site, closed signature). Three measured populations reduce to "which closure is built here".

### The rule the populations follow

- A read of a binding that holds one built closure keys by that closure's lowered signature: the
  held-value rung in `calleeCloSigKeyOfRead`, kept and documented by #5727. That stays.
- A crossing whose destination closes the signature (a typed parameter, a container element whose
  call closes it, a result whose caller calls it at one signature) takes the row's fe for that
  signature, not the template lambda's.
- A parameter, or a binding the bundle admits, called at two or more signatures takes the bundle
  (inc3's half). A container or a result called at two or more is not a bundle: named members
  dispatch through the tag's arms (below), and lambda members are open question 1.
- Keying a callee read by the CALL's per-instance type, rather than by what was built, is refuted
  (D14825): it traps in `closures/block-local-maker-of-generic-in-generic-body-at-two-types.vl` and
  prints a wrong value in `closures/generic-fn-value-one-binding-two-pins.vl`.

### Population 1: D14901 class B, the 8 lambdas nested in an instance

No result type is recorded for these, because a nested lambda has no elaboration instance of its
own. Two dead ends are measured (G1): `elabKeyAtPos` of a nested lambda returns the enclosing
instance's key (3 traps, 1 wrong output), and `elabNodeTy(elabSrcDecl(fx), k)` stays open.

| lambdas | file |
| --- | --- |
| `__lambda_0`, `__lambda_1` | functions/hole-call-const-alias-chain-of-lambda.vl |
| `__lambda_0` | functions/hole-lambda-param-called-at-two-types.vl (the D14841 shape: shared with inc3) |
| `__lambda_10` | closures/captured-hole-fn-handed-on-by-nested-fn.vl |
| `__lambda_16`, `__lambda_17` | closures/captured-hole-fn-handed-on-two-generics.vl |
| `__lambda_7` | closures/captured-cell-hole-lambda-seed-in-generic-body.vl |
| `__lambda_3` | closures/closure-result-map-union.vl (plain nested) |

Accepted when each is minted through the shared row at its closed signature, its recorded result
is that signature's, and the result-kind shadow grades it `kind agree`.

### Population 2: D14901 class C, 36 functions with a type-variable result

Mostly plain functions whose result holds a hole-function value inside a list, map or record. The
result closes per delivery. The token such a result crosses as is the row's fe for the signature
its caller calls the element at. The file list is re-derived from the result-kind shadow's census
at the base commit before building (D14901 records the count, not the files).

Accepted when the shadow's class C count is 0 and no class C function is excluded from the flip.

### Population 3: D14784 class 4, a container of functions through a parameter (15 sites, 10 files)

Rung K pins these with no elaboration key, because the stored generic is called through the
container at two types:

| sites | file |
| --- | --- |
| 1 | closures/generic-list-sibling-written-unreached.vl |
| 1 | closures/generic-list-to-unannotated-param.vl |
| 1 | closures/generic-list-written-through-parameter-beside-other-type.vl |
| 2 | closures/generic-set-through-map-param-called-at-two-types.vl |
| 1 | closures/hole-fn-generic-map-handed-two-maps.vl |
| 4 | closures/hole-fn-generic-map-stored-through-parameter.vl |
| 1 | closures/hole-fn-generic-pushed-list-spread.vl |
| 1 | closures/hole-fn-list-written-then-called.vl |
| 2 | closures/hole-fn-map-to-hole-param.vl |
| 1 | closures/written-let-of-generic-listed-at-two-types.vl |

A container element has one rep (DECISIONS.md, "A function value in a container keeps its set's
one rep"), so a container called at two signatures does not hold two closures per element. It
holds the set's tag, and each call's arms call the members directly (γ's reading, below); the
row is read only for a lambda member. Accepted when rung K's probe reports 0 class-4 sites and the
10 files run with unchanged output.

### Acceptance for the whole design

- The three populations above are empty by their own instruments (result-kind shadow, rung-K
  probe).
- A byte-diff sweep over `tests`, `examples` and the distilled corpus names only the files the
  change moves, each run against its `@log`. regress reports 0 runs lost, and witnesses `--strict`
  report 0 MOVED.
- Both matrix templates for a hole lambda through a result (`hole-lambda-through-hole-fn-result`
  and its `<F>` twin) stay at their current `runs` count or rise.
- D14825's two refutation files keep their output: `block-local-maker-of-generic-in-generic-body-at-two-types.vl` and
  `generic-fn-value-one-binding-two-pins.vl`.

### With the split plan OFF (measured 2026-11-01 on master `41663d897`)

The split plan (D6210) rewrites a parameter called at two signatures into copies, so a file that
runs with it on does not show whether the closure-at-delivery mechanism covers it. Measured with
γ's OFF instrument: `driver.vl` returns after the first compile, and mono never takes the
`holeFnSplitHas` arm.

| population | files | split ON | split OFF |
| --- | --- | --- | --- |
| D14784 class 4 | 10 | 10 run | 10 run (rung K pins them; γ's per-call and per-instance tag arms dispatch) |
| D14901 class B | 6 | 6 run | 6 run |
| D14825's refutation files | 2 | 2 run | 2 emit refusals |
| γ's open gaps (b), (c) | 2 | 2 run | 2 emit refusals |

The four files that need the split today are the design's acceptance cells for replacing it:

- `closures/block-local-maker-of-generic-in-generic-body-at-two-types.vl`: "a function-value call
  has no interned signature — parameter 1 of type `` has no representation in the function-value
  ABI" (42:8).
- `closures/generic-fn-value-one-binding-two-pins.vl`: "a generic function taken as a value reaches
  no call that fixes its type" (32:24).
- `closures/hole-fn-list-element-called-at-two-fn-types-in-loop-closure.vl` and
  `closures/hole-lambda-pushed-onto-hole-fn-list-called-at-two-fn-types.vl`: "a function this call
  reaches through a list or join is already taken at another function type by an earlier call
  through it". These are γ's backlog (b) and (c). Generic members held in a container and called at
  two types are γ's (a), and stay γ's.

How a container is called, as the tag rule reads it (γ, 2026-11-01): the container holds the
set's one rep, an i32 id. Each call through it gets its own arms (`fnTagArmsAt(call, set)` via
`ftBuildArms`). A call site reached at two signatures because its body is instanced twice gets
per-instance arms (`fnTagInstanceArms`). Each arm is a direct call that mono instances at that
call's types, so nothing on the set side is per-signature. Slice 2 therefore adds nothing for a
container of NAMED members. Its share of class 4 is the lambda members, whose built closure the
shared row names.

### Open questions for the coordinator

1. **A lambda member of a container called at two signatures.** The tag admits only a lambda
   `ftLambdaIdOk` passes (γ's L4, which reads nothing but its own and the module's bindings). A
   capturing lambda stays a closure at one signature. So the shared row would need one closure per
   signature for that lambda, but a container element has one rep. Today this is γ's gaps (b) and
   (c), refused with the split plan off. Proposal: γ's backlog owns it; this design names it and
   does not cover it.
2. **D14825's two refutation files need the split plan.** With it off they refuse (see the table
   above). Read against inc3's binding-bundle conditions (a local `const` or unwritten `let`, every
   read a callee or a bundled argument, never returned, stored or captured):
   - `generic-fn-value-one-binding-two-pins.vl` fits: `const a = mk()` then `a(1)` and `a("s")`.
     The binding is bundled, and the creation site its closures come from is `k`, which reaches
     the binding through `mk`'s result. Finding it is the delivery token (this half); holding two
     closures is the bundle. The file needs both, and lands after (b) and (c).
   - `block-local-maker-of-generic-in-generic-body-at-two-types.vl` is not a bundle. Each
     instance of `g` calls `a` at one signature, so it is one closure per INSTANCE. Its creation
     site, the read of `k` in `mk`, sits in a function nested in `g`, whose one body serves both
     instances. That is the per-instance creation site above, and the D14842 shape. It is accepted
     only once the row keys (node, instance) and a nested body is instanced per encloser.
