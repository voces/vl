# Which closure is built at the delivery — design, 2026-11

One question answered once: when a value holding a hole lambda or a generic reaches a call,
which built closure does the call run? Two lanes need the answer and must not mint two rows for
it: the D14841 bundle (one parameter called at two signatures, inc3) and the per-delivery token
(a value crossing a binding, a result or a container before its call, step7 slice 2).

Status: draft. The mechanism half is inc3's; the population and acceptance half is step7's.

## Mechanism (inc3)

### The shared row

**One row per built closure: `(creation site, instance, closed signature) → fe`.**

- *Creation site* is the arena node where the closure's environment is captured: the lambda
  literal, or the declared function's name read where it becomes a value.
- *Closed signature* is the `TyFunc` the closure is built at, with every hole closed. A tagged
  set's type counts as closed; its rep is the member id.
- *Instance* is the elaboration instance whose body holds the creation site, or `-1` where the
  site is in no instanced body. It is in the key from day one, though a nested body is not yet
  instanced per encloser: adding it later would rewrite every reader twice, and a reader written
  in between would key wrong for exactly the D14842 shape. The writer knows the instance where
  mono mints the clone.
  As landed with (b), the column is the function node of the mono instance whose body holds the
  site (`monoCadInstOf(fnIx)`, the node a reader in `fnIx` already holds), not the elaboration
  key: one elaboration key can hold two mono instances (nominal twins `C`/`D`, or a parameter
  pinned at `null` beside one pinned at its type), and keying by the elaboration key gave those
  two clones one key.
- *fe* is the emitted function slot whose body is the lambda instanced at that signature.

**A creation site inside a generic instance is per instance.** If a list literal of hole functions sits in the body of a function with two instances, a member handed each instance's own set needs one closure per instance. Today the element-at-set path (#5693) keys the element node once (`monoElemAtSet`). That is why #5673's shared-member partial clause has to stay. Measured on `run(h) { const fs = [apply2, apply3]; for f in fs { f(h) } }` with `run(add); run(mul)`: dropping the clause prints `3 4 3 4` for `3 4 2 3.75`. So the row keys the instance beside the site (below), and the clause narrows to holders shared across instances only once a nested body is instanced per encloser.

The key is three i32s, never a spelling. This follows the destringify ruling: no new name
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
  First slice (2026-11-02): a lambda literal written at a direct call, to a parameter read only as
  a callee and bound to lambdas alone. The emitter's half is `compiler/emit_bundle.vl`; the row
  answers each field. A lambda in an instanced body is admitted by the elaboration taking a
  bundle pin at the call's own instance, so every encloser shares the callee. The written-let
  bundle is not built (coordinator, 2026-11-02): D14841 grades the 15 W-lam files that would need
  it, and none qualifies under the binding conditions above.
- (c) The delivery token reads the row (step7's half).
  First slice (2026-11-02, coordinator ruling (ii)): a maker, a non-generic function whose
  result is an open function value, is instanced by the elaboration at each closed result a use
  demands: a read delivered at a declared function type (`fvaMakerRowAt`), or a call whose `const`
  binding is only called, at one signature (`fvaMakerCallRows`). Each is the maker's wide twin;
  mono mirrors it (`monoMakerTwin`), and the twin's returned read takes the row's closure
  (`monoTokenFe`). A result γ tags is left as the tag. Left: a call in an instanced body, a maker
  with an un-annotated parameter, and D14825's file as a whole, where one use delivering the
  maker's generic as a closure keeps γ from tagging its set for a hole-parameter maker beside it.
  Second slice: a maker call delivered where the destination's type closes the result (an
  annotated binding, a typed parameter, a return, a record field) is built at it, when that type is
  exactly an instance of the maker's open result. A maker is instanced only when every read of it
  takes an instance (`fvaMakerCoverCheck`): the root the others reach shares its body with them.

### Dispatch arms (measured 2026-11-05, lane LWM)

The row is already on master, keyed `(site, monoCadInstOf(fnIx), sig) → fe`. It is written at
three sites, not one: `monoCadNoteInstance`, `monoCadNoteLamClone` and `monoCadNotePinnedLam`.
It is read by `monoBundleFe`, `monoBundleReadFe` and `monoTokenFe`.

A tagged set's lambda arm does not read it yet. Mono instances a lambda arm by renaming its
callee in place (`monoArmLamFe`), and #6338 gave each instance clone its own lambda arm node
(`fnTagCallCopy`) so that the rename is per instance. That is the interim.

Retiring the rename was measured by stopping it (`monoNoRename` for a lambda arm) with the arms
shared again. Every lambda arm then refuses in mono, before the emitter is reached, with `the
function binding ``, a copy of a reassigned binding, is called at more than one…`. The
non-generic D15433 refuses too. So the switch is three readers moving together:

- mono's instancing of a lambda arm writes the row once per frame at the frame's signature
  (`elabNodeTyAt(arm callee, fnIx)`), with no rename;
- mono's binding-signature checks take an arm whose member the row answers as dispatched;
- the emitter's call path resolves an arm callee through the row (`monoBundleReadFe` from
  wasmEmit.vl). It cannot do so from `elabArmFeOf`, since emit_elab.vl does not import mono.

#6338's per-arm minting can be reverted only after all three land.

**As built (2026-11-05, step 2's first PR).** The three readers moved together, with two
departures from the plan above, both measured:

- *The arm's signature.* `elabNodeTyAt(arm callee, fnIx)` stays the lambda's open type
  (`(_) => _`) in every frame, so no row keyed by it closes. The arm is keyed by the signature it
  is called at there: its arguments' types to the call's own (`elabArmSigAt`, emit_elab.vl, which
  mono and the emitter both read).
- *The site.* Keyed by the lambda's declaration, two calls of one lambda at one signature in one
  frame shared a key, though mono can give them different instances (a callback baked into one):
  `let-hole-lambda-reassigned-fn-param.vl` counted a conflict and called the unbaked instance. The
  site is the arm's callee read, as `monoBundleReadFe`'s other reads are.

The write sits where the callee is handed its instance, beside `monoNoteOpenArgs` at the
registry hit and at a new instance (`monoArmRowNote`). `monoLastInstFe` after `monoInstantiate`
names the last instance minted anywhere under the call, including the generics the new body calls,
and reading it built `lambda-list-element-called-at-two-function-types.vl` as invalid wasm. The
emitter stages the row's answer for `elabArmFeOf` around each arm of a dispatch
(`elabArmStagePush`), and a hole lambda's arm the row does not answer is refused by name.

Over the 3,944 test and corpus files that spell `=>`, the build is byte-identical to master with
the split plan on and off. D15433 and D15436 print as filed both ways.

**Step 2's second PR (2026-11-05).** #6338's per-instance lambda arms are retired: an arm node is
shared by every instance again, as a named member's is, and D15436 still runs with the plan on and
off. The seed shrinks by 898 bytes. One file's bytes move in both modes and print the same:
`literal-unions/coalesce-hole-call-retyped-dead.vl`. A shared arm's arguments are the template
call's nodes, so `applied`'s `f(g())` arm calls `g` through the closure parameter, where the
instance clone's `g()` had been resolved to a direct call.

### Matrix

The bundle record is an anonymous record, so its position matrix must include a same-shape
USER record (`{c0: (i32) => i32, c1: (f64) => f64}` written by hand) beside the bundle, and a
NOMINAL twin with the same field names (`type B = {c0: (i32) => i32, c1: (f64) => f64}`), the
user record most likely to share an interned row with the bundle. That proves the bundle never
shares a row it should not.

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

- (d) Scheduled 2026-11-02: the bundle-typed closure parameter. It is the bundle for a callee
  reached only as a closure value.
  - **The shape it serves.** `const lap = (g) => { g(1); g("s") }; function use(k) { k(id) };
    use(lap)`. Today's bundle is decided at a direct call, on the parameter of a function instance
    mono builds per call. `lap` is one closure instance reached through `k`'s `call_ref`, so no
    call can decide its `g`. The tag path does not serve it either: `ftLambdaIdOk` refuses a lambda
    that calls its own parameter, and dropping that clause makes the witness refuse with the split
    plan on as well (measured 2026-11-02).
  - **ABI shape.** A closure whose parameter is bundled takes the bundle record
    `{c0: sig0, c1: sig1, …}` in that slot, and its function-value signature key names the bundle
    (a `bundle(sig0, sig1, …)` parameter kind in the closure signature key), so a `call_ref`
    through it type-checks against the record. The signature list is the lambda's own: the
    signatures its body calls the parameter at, which `elabBundleSigs` already computes for a
    function's parameter, read at the lambda's one instance.
  - **Conversion at the `call_ref`.** A call through a value whose members bundle a parameter
    builds the record from its argument, as `emitBundleArg` does at a direct call. Each field is
    the shared row's closure for (the argument's creation site, that signature). An argument
    that is itself such a bundle is passed as is. The signature list comes from the members: every
    member of the callee's set must bundle that parameter at one list, or the call refuses loudly.
  - **Scope.** This holds only while every delivery of the lambda is to an un-annotated hole, so
    the bundled ABI never meets a declared function type. A lambda delivered to
    `(g: (x: i32) => i32) => void` keeps its one-signature closure, and a conversion between the
    two shapes is not part of this slice.
  - **What it retires.** bundle-lam in the split-plan census: 5 `@run` files and D6481, D6706,
    D14824, D14845, which run today only through the split plan. D14942, the same shape with a
    named `lap` that refuses even with the plan, is graded beside it; serving it also needs the
    named function's parameter bundled when it is reached as a value. Not W-lam, a written
    `let` of hole lambdas, which is the binding bundle and parked on the owner's flow-typing
    ruling. Not M-record.
  - **Slice 1, built.** An anonymous lambda of one parameter, called at two or more signatures,
    handed to a hole parameter that is only called, each call handing a named generic.
    Elaboration notes the signatures per lambda declaration (`elabLamParamSigs`). Mono pins the
    parameter at `(bundle) => R` (`monoClosureBundlePin`) and instances the generic at each
    signature at the call (`monoCoerceBundleArgs`). The `call_ref` builds the record
    (`emitBundleReadArg`). It declines under a split plan, for a reassigned binding, for a
    lambda handed at the call, and for a lambda of more parameters. It serves D6481's and
    D6706's fixtures without the plan. D14824 (a reassigned `let` beside the calls) and D14845
    (the list push) are left for later slices.
  - **Slice 2, D14942, served by the tag decision, not the bundle.** A named `lap` is a tagged
    one-member set, so `k(id)` dispatches to it and no closure is built. What refused was `id`'s
    set: the decision took an argument of a call through a parameter as an id only for a
    binding, element or field callee. It now also takes it for a parameter callee when the sets
    its calls go through hold only named functions, each taking the set there
    (`ftParamSetsTake`). A lambda member keeps slice 1's bundle.
  - **Slice 3, D14824, built.** A lambda called with a named generic it calls at two signatures,
    beside a consumer calling that generic at one, so `{id}` is partial and untagged. The
    elaboration notes a lambda instance's signatures whatever its parameter's members are
    (`elabBundleSigNote`), and mono hands the named generic as the bundle of its instances
    (`monoBundleNamedPin`). Emit builds the record at a direct call (`emitBundleParamRead`) and
    at a `call_ref` whose key's parameter is a bundle row (`bundleKeyParamTy`). It declines under
    a split plan, as slice 1 does.

  - **Slice A (read as value), a forward, built.** A bundle parameter handed whole to another hole
    parameter holds the one record on both sides: the elaboration joins the signatures of
    parameters such hands link (`elabBundleForwardsJoin`), mono pins the callee's parameter at the
    caller's record (`monoBundleHandOnPin`), and emit passes the record on as it is. A chain where
    no instance binds the parameter to a set stays refused. The capture half of
    `hole-lambda-bundle-param-read-as-value` is slice B.
  - **Slice B (read as value), a capture, built.** A call through a bundle parameter from a closure
    that captures it is noted at the ancestor instance binding the parameter
    (`elabCapturedBundleSigNote`), mono admits a nested function that only calls the capture, and
    a captured read names the binding frame's bundle parameter (`bundleParamOfRead`), so the
    closure calls a field of the record it captured, from a closure at any depth (each frame
    re-captures the record). A returned capture stays refused.

### Open questions for the coordinator

1. **A lambda member of a container called at two signatures.** The tag admits only a lambda
   `ftLambdaIdOk` passes (γ's L4, which reads nothing but its own and the module's bindings). A
   capturing lambda stays a closure at one signature. So the shared row would need one closure per
   signature for that lambda, but a container element has one rep. Today this is γ's gaps (b) and
   (c), refused with the split plan off, graded as D14844 (b) and D14845 (c). Agreed (coordinator,
   2026-11-01): γ's backlog owns it; this design names it and does not cover it. A lambda that
   captures nothing and is held only as a list element is served by the tag instead (D14845,
   `ftArmOnlyLams`); a capturing one stays γ's.
2. **D14825's two refutation files need the split plan.** With it off they refuse (see the table
   above). Read against inc3's binding-bundle conditions (a local `const` or unwritten `let`, every
   read a callee or a bundled argument, never returned, stored or captured):
   - `generic-fn-value-one-binding-two-pins.vl` fits: `const a = mk()` then `a(1)` and `a("s")`.
     The binding is bundled, and the creation site its closures come from is `k`, which reaches
     the binding through `mk`'s result. Finding it is the delivery token (this half); holding two
     closures is the bundle. The file needs both, and lands after (b) and (c).
     Measured 2026-11-02, one program per function, split plan off: 8 of its 10 shapes already
     run, `const a = mk()` with `a(1)` and `a("s")` among them. A named generic crossing a
     maker's result is the tagged set's id and each call dispatches through its arms, so those
     need neither the bundle nor the token. Two refuse: `valueRead`, where one use of `mk` closes
     its result's signature (`const h: () => (x: i32) => i32 = mk`) beside a use the tag serves,
     which needs a maker instance per demanded result signature (the elaboration's, coordinator
     ruling 2026-11-02); and `local`, a maker nested in a function, which is not tagged (D14940,
     step 4 γ).
   - `block-local-maker-of-generic-in-generic-body-at-two-types.vl` is not a bundle. Each
     instance of `g` calls `a` at one signature, so it is one closure per INSTANCE. Its creation
     site, the read of `k` in `mk`, sits in a function nested in `g`, whose one body serves both
     instances. That is the per-instance creation site above, and the D14842 shape. It is accepted
     only once the row keys (node, instance) and a nested body is instanced per encloser.
