# A nested function's body is instanced per encloser instance — design, 2026-11

A function declared inside a hole or generic function is one declaration, but each instance of
its encloser binds the encloser's parameters to different types and sets. Where the nested body
reads such a parameter, it is a different program per encloser instance. Today the elaboration
builds no instance for it, so the tag decision has to treat its reads as shared by every encloser
instance and decline them. This design names what is missing, says which facts move, and scopes
the slices. It is the census group L-nested.

## The witness

`closures/forwarded-hole-param-captured-by-nested-fn-at-two-sets.vl` builds only through the
split plan. Its first shape:

    function add(a, b) { return a + b }
    function mul(a, b) { return a * b }
    function apply2(g) {
      print(g(1, 2))
      print(g(1.5, 2.5))
    }
    function run(h) {
      function inner() {
        for f in [apply2] { f(h) }
      }
      inner()
    }
    run(add)
    run(mul)

It must print `3 4 2 3.75`. With the plan off it is a loud emit reject, `call to unknown function`.
The file also holds three more nested spellings: a `const` lambda called in place, two levels of
nesting, and a nested function returned and called later.

**The control is D14842's fixture, which is this program.** D14842 was silently wrong: #5703 took
the forward of `h` from inside `inner` as each instance's set id, but `inner` had one body for both
of `run`'s instances, so `run(add)` ran `mul` and printed `2 3.75 2 3.75`. The close stopped noting
a forward through a set from a nested function (`elabMintHandedNested`, "one body's for every
instance"). That guard is what makes the witness refuse today, and any change here must keep the
fixture printing `3 4 2 3.75`.

## What is missing, measured

Measured on master `aa6f36cef`, plan off:

* **No instance of `inner`.** The elaboration mints `?run.0=Fn#7` and `?run.0=Fn#15` for `run`,
  and two keys for `apply2`, and nothing for `inner`. `inner`'s body is walked only as part of each
  `run` instance (`elabMintHandedNested`), so no fact can say which instance a read in it belongs
  to.
* **Why `elabNestedPerEncl` does not make one.** It instances a nested declaration per encloser
  instance when the declaration is typed from its context and its body calls a generic, or when
  its body reads a captured value its template types as open and a snapshot was banked for it.
  `inner` has no parameters, so `elabParamsAnnotated` holds vacuously and the first branch is
  skipped. The second branch needs `elabSnapIx` at `-1|inner`, which `elabNestNote` records only
  for a declaration whose signature is open, and `inner`'s is `() => void`.
* **One encloser instance is not enough.** With only `run(add)`, and `inner` called, the witness
  still refuses: the guard declines the forward whether or not a second instance exists. A slice
  that only admitted an encloser with one instance would not move the census file.

## The design

### 1. The producer: a nested declaration that reads a captured hole parameter is instanced per encloser instance

`elabNestedPerEncl` gains a third branch. A nested declaration with a closed signature whose body
reads a parameter of an enclosing declaration, where that parameter's binding differs between the
encloser's instances (a hole, or a type parameter), is enqueued once per encloser instance, under
that instance (`elabEnqueue(d, ekNames[a], ekTys[a], a)`, as the existing branches do). The reads
test is the one `elabParentFor` already uses (`elabReadsChainOf`), so the instance is keyed under
its encloser and a demand from inside the encloser's instance reaches it.

This is the one producer of "which body this read is in". Nothing else mints it.

### 2. The mint facts read the nested instance

With `inner` instanced under each `run` instance, its body is an ordinary instance body. Its facts
are minted the way a non-nested body's are (`elabMintFactsIn` over the nested key), with the
captured parameter resolved to the encloser's (`elabCalleeParam` already resolves a `Param`). The
forward of `h` through `[apply2]` is then the same list-element fact `run`'s own body would give
(the ablation in D14842: the same loop in `run`'s body runs).

`elabMintHandedNested` stays only for a nested declaration that is not instanced per encloser,
which keeps D14842's guard exactly where its reason still holds.

### 3. The tag decision reads which nested declarations are per encloser

Five tag-side sites decline a parameter read in a nested function through `ftReadInNestedFn`:
`ftParamBoundTagged`, `ftParamHandedWithin`, `ftReachHandSets` (a parameter a function is handed
to), `ftParamIndexIn` and `ftParamForwardsSet`. Each guards the same fact, "a nested body is one for every
instance". They read a new elaboration fact instead
(`elabNestedPerEnclOf(d)`, the set of declarations step 1 instanced), and decline only for a nested
declaration not in it. No syntactic test is added to the decision.

### 4. Mono builds and calls the nested instance per encloser instance

**Corrected 2026-11-03, after slice 2 was built on `lane/g2-nested2` (not merged).** With steps 1–3
the elaboration minted `inner` under each `run` instance, and mono did walk two `inner` copies, each
reaching its own `apply2` instance (keyed `#set1` and `#set2`). D14842's witness still printed its
old wrong output, `2 3.75 2 3.75`. Both `inner` copies dispatch the list element `[apply2]` through
one closure trampoline: the closure value mono builds for the template's list literal is one for
every copy of the body that holds it. So "mono already builds a nested declaration per enclosing
instance" is true of the declaration and false of a function value built inside it. That value's
identity per instance is `per-instance-identity-2026-11.md`'s mechanism M2, and slice 2 waits on it.

## Interactions

### D15049 — the same per-instance call keying

D15049 (the census L-map file, parked) is a hole function over a list handed two sets' lists. The
elaboration keys an instance per set, but mono serves both calls from one instance, and the tagged
call in its body resolves to one set: lifting the partial mark alone prints `2.25 4 4 4` where
`2.25 4 4 6` is right.

A per-encloser nested body needs the same two mono reads:

* **The call row takes the elaboration's key.** For D15049, `take3([dbl0])` must demand the
  `{dbl0}`-keyed instance. Here, `inner()` from `run(mul)`'s instance must demand the `inner` keyed
  under it. The parent chain gives the second for free once step 1 mints the key; the first needs
  mono's row lookup to read `elabSetArgBind`'s set-keyed instance for a list-literal argument.
* **A tagged call resolves by the instance's own set.** Both need an elaboration fact "the set this
  instance's call goes through", read by `monoTagSetAt` before its template fallback. The parked
  branch `lane/g2-lmap` built that fact (`elabCallSetIn`, keyed `instance|call`, noted in
  `elabMintFactAt`). It is correct per key; it only failed there because the second call shared the
  first's instance.

So the order is: the per-instance call-set fact lands first, as a slice of its own with no behaviour
change (no reader acts on a key the build never walks). Then this design's step 1, which makes the
nested key exist and so lets that fact act. D15049 then needs only its call-row read.

### Capture cells — `fnTagBind` (#6000)

#6000 records "binding `b` holds tagged set `s`" once, at commit (`fnTagBindNote`), and the
emitter's capture kind reads it (`fnTagBindHolds`), so a closure's capture of a tagged `let` is the
`i32` id, not a closure ref.

The fact is per declaration, not per instance. A per-encloser nested body can read a captured `let`
of the encloser, and that `let` is a cell per frame. Two cases:

* **The binding holds one set in every encloser instance.** The per-declaration fact is right for
  every nested instance, and nothing changes.
* **The binding holds a different set per encloser instance**, for example `let k = h` beside
  `run(add)` and `run(mul)`. Then one fact per declaration cannot say both. Step 3 must keep
  declining such a read: the tag decision admits a nested read of a captured `let` only when
  `fnTagBind` would record one set for it. A per-instance `fnTagBind` is out of scope here. It is
  the same keying question one level down, and no census file needs it.

`cell-peer-called-at-two-types.vl` is the per-frame lane's slice (#6000's follow-up, a binding
written inside a nested function). It is not this design's, but it reads the same nested-body facts,
so step 1's producer should be the one it reads too.

### A nested function returned as a value

`viaReturned(h)` returns `inner` and calls it later: `viaReturned(add)()`. A set's members are
declarations, not instances, so `{inner}` cannot say which encloser instance's `inner` a value
holds. The returned value stays a closure, as today. Each closure is built inside its own encloser
instance, so with step 1 it is the right body. The tag decision must not tag a set holding a
per-encloser nested declaration that escapes as a value. It already declines a value read for a
declaration with captures (`ftNestedCaptureFree`, #5990).

## Slices

**Slice 1: the per-instance call-set fact, with no reader acting.** It is `elabCallSetIn` from
`lane/g2-lmap`, without that branch's partial-rule change. Acceptance: byte-identical outputs over
every `@run` file, plan on and off, and late demands 0.

**Slice 2: the producer, the nested mint facts, and the tag guard reading the fact (steps 1–3), for
the nested `function` and `const` lambda spellings.** Acceptance:

* D14842's fixture prints `3 4 2 3.75` with the plan on and off. This is the control, and it is
  checked first.
* The census file's first two shapes run with the plan off.
* All `@run` files keep rc and output with the plan on and off. `regress.vl` loses 0 runs, on and
  off. Late demands 0.

**Slice 3: two levels of nesting, and the returned spelling.** Then the census file leaves.

**Out of scope.** D15049's call-row read (step 4's first bullet), which needs mono's call keying
and stays parked until its owner takes it. A per-instance `fnTagBind`.
