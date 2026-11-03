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

### M4. Per-instance arms for a call through an open function's parameter

A call through a parameter whose set differs per instance resolves its arms by the instance's set
(`monoTagSetAt`). A callee read off a holder (`a[0]`, a `for` variable, a `.map` lambda's
parameter) is typed at the instance as an `i32` id, so mono falls back to the template's single set
(`mintCallSoleSet`). #6005 records the set each instance's call goes through (`elabCallSetIn`).
Reading it in `monoTagSetAt` before the fallback is this mechanism's whole change. It is safe only
once M1 makes the instances distinct: with a shared instance it reads one key's set for both.

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

**Out of scope.** Sets whose identity varies per instance and escapes the instance; those stay
closures. A per-instance `fnTagBind` (#6000), which no witness needs yet.
