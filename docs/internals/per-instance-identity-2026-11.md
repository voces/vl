# Per-instance identity: an id or an arm names a different value per instance — design, 2026-11

Four lanes hit one wall. A tagged set's id, a call's arms, or a function value built inside a body
has to name a different thing in each instance of a hole or generic function, and today some
layer keys it once for every instance. Lifting the guard that hides each case gives silently wrong
output, so each one was parked behind a refusal.

The rule: **the tag decision produces a set's identity, the elaboration mints instances keyed by
it, and mono only reads the key.** No layer re-derives identity from a representation. A tagged set
is stored as an `i32` id, so a key spelled by the stored representation merges any two sets.

## The cases and their hard controls

Each slice is graded on all of these, with the split plan on and off.

* **D15049** (census L-map, parked). `take3(a) { return a.map((f) => f(3)) }` is handed `[inc0]` and
  `[dbl0]`. Want `2.25 4 4 6`. With the partial mark lifted alone, it printed `2.25 4 4 4`. Its
  spellings are the index body `[a[0](3)]`, a flat `take2`, and the census file
  `closures/hole-fn-list-returned-mapped-in-hole-param.vl`.
* **D14842** (closed, the L-nested control). `run(h) { function inner() { for f in [apply2] { f(h) } };
  inner() }` with `run(add); run(mul)`. Want `3 4 2 3.75`; the silently wrong output is
  `2 3.75 2 3.75`. Its spellings are the census file
  `closures/forwarded-hole-param-captured-by-nested-fn-at-two-sets.vl`: a `const` lambda, two levels
  deep, and returned.
* **D15019** (closed). A list element's call handed a hole parameter, where the element's closure
  signature would take an id for a ref: `closures/fn-in-two-lists-handed-hole-param-fn-and-named-fn*.vl`.
* G1's D15062 item 2, and the per-frame lane's rows filed after D15100 in its block (a lambda member inside a
  generic body; a written `let` handed at two pins in a generic body). Their witnesses join this list
  as the lanes file them.

## Mechanisms, measured

### M1. An instance key for a pin holding a list of a tagged set's ids drops the set

Mono keys an instance by its pins' spellings and discriminators (`monoKeyPinSeg`). A pin holding a
tagged set is keyed apart from a closure of the same signature by `monoSetPinDiscrim` (`#set<n>`).
A pin holding a *list* of the set's ids is spelled by its storage (`fnTagListRepName`: `i32[]`), and
the discriminator reads only a bare set. So `take3([inc0])` and `take3([dbl0])` share one key, and
mono serves the second call from the first's instance. The elaboration already minted both
(`?take3.0=((_) => _)[]#6` and `…#13`); mono only demands on a cache miss, so `#13` is never
reached. Measured on `lane/g2-lmap`: call 78 demands key 3 (`#6`); call 86 finds no usable checker
instance, its pin is `i32[]`, and no demand follows.

**Measured fix.** `monoSetPinDiscrim` walks a list type down to its element, and a tagged element
keys the pin `#set<n>[]`. The pin's spelling stays `i32[]`, because the spelling is parsed back
into the parameter's valtype: a spelled suffix fails the valtype ladder. On the probe, with
`elabMintFactAt`'s partial exemption and #6005's fact read in `monoTagSetAt`, D15049 and its index
and flat spellings print `2.25 4 4 6`, the one-set control prints `2.25 4 4 4`, and the census file
prints its `@log`.

### M2. A function value built at a template node is one for every copy of the body

With `inner` instanced per `run` instance (nested-per-encloser slice 2), mono walks two `inner`
copies and keys two `apply2` instances apart (`#set1` under one, `#set2` under the other). The
emitted module still has one closure trampoline for the list element `[apply2]`, and both copies'
`call_indirect` go through it. The value a function name becomes where it is not a direct callee
(a list element, an argument, a binding) is built once per template node, not once per instance
being walked.

**Measured, 2026-11-03: the copies already exist, and one lookup reads the template's.** Each
`inner` copy has its own body, its own `for` loop and its own list literal (in D14842's witness,
loops 69 and 81, lists 65 and 77, against the template's 38 and 33). `monoCalleeElems` finds a
`for` variable's list through `monoInstDeclCopy`, which searches only a generic-instance frame.
An `inner` copy is not one, so the lookup fell back to the template's loop, whose element node 32
both copies then renamed: the last instance won.

**The fix, slice 3.** `monoNestedLoopCopy`: in a frame whose source declaration the elaboration
built per encloser instance, `monoCalleeElems` takes that frame's own copy of the loop. No body is
cloned. The fact that decides "per encloser" is **`mintNestedPerEnclOf(d)`**. The elaboration writes
it (`elabNestedPerEncl`'s third branch, nested-per-encloser step 1, noted in `elabMintFacts`), and
mono and the tag decision only read it (`monoNestedLoopCopy`, `ftReadInNestedFn`). On the probe,
D14842's witness prints `3 4 2 3.75` with the plan off. The census file's nested-function,
`const`-lambda and returned shapes each run alone. Its two-levels-deep shape still refuses, so the
file waits on slice 4.

### M3. A set whose member is itself per instance

A lambda declared in a generic or hole body is a value per instance, and so is a nested declaration
instanced per encloser. A set's members are declarations, so `{lambda, other}` cannot say which
instance's lambda an id names. The tag decision declines such a member (`ftWithinInstancedFn`).

The identity a set needs here is `(declaration, instance)` per member. The design keeps sets of
declarations, and tags a set with a per-instance member only where every id of it is made and
dispatched inside one instance. Then the id's arm is the member's copy in that instance. The arm
callee is resolved by declaration (`fnTagArmCalleeOf`, #5990), and in an instance body it must
resolve to that body's copy (`monoDeclCopyIn`), not to the template's declaration. An id that
leaves the instance (returned, stored outside) keeps the set a closure, as today.

**M3 step 2, planned (D15110, per-frame's class F).** Measured: a lambda's elaboration key has no
parent, so one `?#L…` key covers every instance of its encloser, and a lambda no instance calls
gets no key at all. Mono then decides "per instance" with a predicate of its own
(`monoLamNodeIsTemplateCore`), and the tag decision with another (`ftWithinInstancedFn`). They
disagreed on D15110, which built one closure at the first instance's type. The floor
(`monoSharedLamGuard`) refuses that case on the elaboration's "no key" fact. The build:

1. The elaboration keys every lambda declared in an instanced body under its encloser instance
   (`ekParent` set), including one no instance calls. It records "per instance" as that key's
   binding differing between two encloser instances.
2. The tag decision reads that fact in place of `ftWithinInstancedFn`'s syntactic test. Mono's
   clone reads it in place of `monoLamNodeIsTemplateCore`, which is deleted.
3. A set holding a per-instance lambda is built over (lambda, instance), as M3 above, so each
   instance's arm is its own copy.

Controls: D15110 and its two variants, the non-generic twin, the four 4b-i movers, the five
shared-writer fixtures, per-frame's `hole-lambda-bundle-positions`,
`captured-hole-fn-handed-on-two-generics` and `nested-generic-capture-callers-that-run`, and the
hard controls. Priced in guest fuel on the scaling-shape gate and the L2 self-compile, since every
instanced lambda gains a key.

### M4. Per-instance arms for a call through an open function's parameter

A call through a parameter whose set differs per instance resolves its arms by the instance's set
(`monoTagSetAt`). A callee read off a holder (`a[0]`, a `for` variable, a `.map` lambda's
parameter) is typed at the instance as an `i32` id, so mono falls back to the template's single set
(`mintCallSoleSet`). #6005 records the set each instance's call goes through (`elabCallSetIn`).
Reading it in `monoTagSetAt` before the fallback is this mechanism's whole change. It is safe only
once M1 makes the instances distinct: with a shared instance it reads one key's set for both.

### M5. A per-instance value handed or returned out of its instance (step 2, S2a')

Measured on master `b90c2ed2e`. In `closures/hole-lambda-bundle-positions.vl`, `capT<T>` hands a
lambda capturing its `k: T` to the hole function `lapT`, which calls it at `i32` and `f64`. The
elaboration keys `lapT` by its argument's type, `(?#L.0) => ?`, which is the same from `capT<i32>`
and `capT<string>`. So both reach one `lapT` key, and the lambda's pins are made once, inside that
shared instance. Mono keeps the two apart only by frame (`30#|T=i32`, `32#|T=string`). D15110 is
the same shape through a return: `a(1)(2)` pins the lambda at a call outside every instance.

**The key component.** A per-instance value carries its creating instance. Where a call hands one
to a hole function's parameter `i`, the callee's key binding vector (`ekNames`/`ekTys`, the vector
A2b's delivered-arm entries go into) gains the entry `#from.i`, naming the lambda's own key: the
one S2a mints under its encloser instance. Two creating instances then key the hole function apart,
and a pin made in its instance is enqueued from a key whose chain names the creating instance.
`elabParentFor` follows `#from.i` back to it. A value returned by an instance is credited the same
way: the callee of `a(1)(2)` is a call whose key is `a<i32>`, so the outer call's pin is enqueued
from that key. A value that is not per instance (S2a minted it no instance key) adds no entry, so
those keys do not split.

**What it replaces in mono.** The encloser half of mono's instance key (`monoEnclosingPinRow` and
`monoBindEnclosingPins`, the `|T=…` segment) and the frame-keyed instance head
(`monoMakeInstanceKeyHead`, `monoNestedCallFrame`), wherever they key a callee by the instance a
handed value came from. Those read the elaboration key once it carries `#from.i`, and are deleted
for that case. Mono's clone predicate (`monoLamNodeIsTemplateCore`) goes in S2b. #6068's floor
(`monoSharedLamGuard`) goes when D15110 runs.

**Cost bound.** Keys split only where a call hands a per-instance value, so the added keys are
bounded by those calls times their creating instances. Before the readers move, a probe counts, over
the `@run` files, the hole functions that gain a `#from` entry and the keys added. It is priced in
guest fuel on the scaling-shape gate and the L2 self-compile, the bar being a few percent.

**S2a, landed: two keys per lambda, an interim.** An anonymous lambda with an un-annotated parameter,
in an open encloser, takes that encloser's instance on the `from` chain as its key's parent
(`elabParentForAt`). Where that rule alone gives the parent, the parent -1 key it had before is still
minted beside it. Reusing an instance's key for a template pin instead was measured unsound:
`generics/hole-list-literal-local-nullable.vl` went from running to trapping, because the template
pin ran under one instance's encloser bindings. The parent -1 keys are the template's view until every
pin is credited to an instance. Three late-demand causes shaped the rule. Lifting renames a lambda
`__lambda_N`, so the rule reads the lifted name. A lambda with no un-annotated parameter has nothing to
key. And mono asks for a callback with no instance in hand.

**S2a''s exit criterion.** No lambda key is minted with parent -1 inside an open encloser. These are
the readers that still ask with no instance (`from` -1), the list S2a' empties:

* `elabDemandFrom`'s callers that pass no instance: `elabDemandCandidate`, `elabArmEarly`,
  `elabResultAtParams` and
  `elabHoleCallAt`;
* the hole-row drain's template rows (`elabHolePinNote` outside a live re-check);
* `elabEarlyCallRows`, `elabArgValueRows`, `elabListSigRow`, `elabSetRepRow`, `elabLamRepInstance`,
  `elabSoleRekey`, `elabEnqueueAtParams` and `elabArgResultAt`.

**Controls.** D15110 and its swapped and trap variants, its non-generic twin, the same-type case,
`generics/is-list-arm-anon-record.vl`, the 4b-i movers, the five shared-writer fixtures, the class-F
trio and per-frame's two slot-probe files, D14842, D15049, D15019, D15102 and D15068.

## Producers and readers

| fact | producer | readers |
| --- | --- | --- |
| a set's identity | the tag decision (`fnSets`, `ftCommit`) | everything below |
| the set-keyed instance of a callee handed a set or a list of one | the elaboration (`elabSetArgBind`, existing) | mono's instance key (M1) |
| the set each instance's call goes through | the elaboration (`elabCallSetIn`, #6005) | `monoTagSetAt` (M4) |
| a nested declaration built per encloser instance | the elaboration (nested-per-encloser slice 2) | the tag decision (`ftReadInNestedFn`, through `mintNestedPerEnclOf`); mono's nested walk |
| a holder that is the instance's own parameter | the elaboration (`elabCalleeParam`) | `elabMintFactAt`'s partial rule |
| a member's copy in the instance being walked | mono's body copy (`monoDeclCopyIn`, existing) | the arm callee (M3), a value's closure (M2) |

Mono adds no identity of its own. M1 and M2 are mono reading the walk key or a set the tag decision
named, in places that today read a representation instead.

## Slices

Each slice is graded on every hard control above, with the split plan on and off, along with:
0 `runs` lost in `regress.vl`, late demands 0, and all `@run` files keeping rc and output.

1. **#6005**, the per-instance call-set fact. No reader. Landed or queued.
2. **D15049.** M1 (the discriminator through lists), M4 (the `elabCallSetIn` read), and the partial
   rule's exemption for a holder that is the instance's own parameter (the elaboration fact, not a
   syntactic test). This closes D15049. D14842 must keep `3 4 2 3.75` (it does not change
   here, since nothing nested is instanced yet). D15019's fixtures must keep their output.
3. **L-nested.** nested-per-encloser slice 2's producer and facts, with M2's
   `monoNestedLoopCopy`. D14842 must print `3 4 2 3.75` with the plan off. This is the slice's
   first check, before anything else is graded. D15068 joins the hard controls. Report seed size
   and plumb-shape fuel deltas. Built: D14842's Repro and the three spellings in
   `closures/nested-fn-forwarding-captured-hole-param-per-encloser-instance.vl` run with the plan off.
4. **Two levels of nesting** (4a), the last census L-nested shape, and **per-instance members
   (M3)** (4b), with the per-frame lane's rows as witnesses, and G1's D15062 item 2 graded against
   M4's reader from slice 2.

   4a, measured: the checker snapshots the bindings around a nested declaration (`elabNestNote`)
   only when its own or its encloser's signature is open. In `viaTwoDeep`, `b`'s encloser `a` is
   `() => void`, so `b`'s instance re-check had no snapshot, typed `h` as an error, and built
   `apply2` at it, which the late tag decision then declined. The fix is checker-side: snapshot when
   any encloser up the chain is open. The elaboration's per-encloser test and its mint redirect
   (`elabReadsEnclParam`, `elabEnclOwning`) walk the same chain. D14842's pin now carries two- and
   three-deep shapes and a generic-calling middle, all running with the plan off.

   4b, measured: D15101, D15102 and D15103 are three mechanisms. Lifting `ftWithinInstancedFn`'s
   decline everywhere moved 4 of 5,497 `@run` files with the plan off: two gains, whose binding is
   written only in the instance's own body and only called, and two losses, where the binding is
   written inside a nested closure or stored into a list or record. **4b-i** admits the member in
   the first shape only (`ftInstLeafOk`, check_fn_tag.vl): the binding is written only in the body
   that declares the lambda, and every read is a call. That closes D15102. **4b-ii** is D15101, a
   write inside a nested closure, where the id meets a closure-typed capture cell. **4b-iii** is
   D15103, a delivery at a type that differs per instance (`ftCtxOk`). Writing 4b-i's escape control
   found D15110, a returned per-instance lambda that runs at the first instance's type.

**Out of scope.** Sets whose identity varies per instance and escapes the instance; those stay
closures. A per-instance `fnTagBind` (#6000), which no witness needs yet.
