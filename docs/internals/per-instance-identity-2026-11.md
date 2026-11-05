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

### The composite-pin slices: mono re-deriving elaboration facts

The four slices planned as a composite-pin producer (D15107 classes B and G) each closed in mono, with no entry added to the elaboration key: the elaboration already held one instance, and mono split it on a fact it derived itself. A union pin keyed the argument's exact type and literal-union mark where the key's bindings fix the pin (#6061, #6085). A literal argument's spelling missed a union its type is held by (#6093). An instance was demanded at its pin's rep binding before its exact one (#6077). A record literal pinned at its own type where the elaboration stamps it at the parameter's record (D14140). Before adding a key entry for a split, look for the elaboration fact mono should read instead. D15107 class A's fresh-call deliveries are a fifth instance: mono pinned `idn(mk())` at the record the checker rebuilds `mk()` at (`recRebuiltLeafRow`, D8020), while the elaboration bound the call at its own type; the elaboration's call binding now reads that checker fact.

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

**The twins stay, measured 2026-11-03 on master `2bb36ff5c`.** Over the 5,569 `@run` files, 121
parentless keys of lambdas in an open encloser remain, in 45 files. Every one is covered by a parented
key with the same pins (the probe compares the pins sorted, since one key may store them in another
order). They are fed by four root routes that mint with no instance in hand: the template check's hole
rows (`elabDrainHoleRows`, 150 first mints and 1,196 uses), the early arms demanded through
`elabDemandFrom` (`elabArmEarly`), the root's set-call rows (`elabSetCallRows`), and the argument rows
(`elabArgValueRows`, 15 mints and 21 uses). A further 208 lookups carry an instance but still reach a
twin, because they walk a callee key that one of those routes minted with no instance. Three probes
tried to retire the twins one route at a time:

* b1, the `#from` credit at a direct callee and at a set call's members: the 208 fell to 206. The
  credited callee key exists, but the walks that pin the lambda are of the uncredited one.
* b2, the root's set-call rows skipped for a call in an open function's body: the 208 fell to 191,
  plus 15 parentless mints moved to `elabOne` with an instance in hand. Byte-identical, fuel +0.12%.
* b3, the root's whole call-bind row skipped for such a call: the table did not move, and
  `closures/hole-fn-list-returned-read-at-two-types.vl` went from running to an emit reject.

The routes are not independent: the root rows are load-bearing, and removing one moves nothing or
loses a run. Retiring the twins is a rework of how the root seeds instances, which needs its own
design. Until then they are the interim, at no measured cost (byte-identical, fuel +0.008%).

**Controls.** D15110 and its swapped and trap variants, its non-generic twin, the same-type case,
`generics/is-list-arm-anon-record.vl`, the 4b-i movers, the five shared-writer fixtures, the class-F
trio and per-frame's two slot-probe files, D14842, D15049, D15019, D15102 and D15068.

#### M5 follow-up: one producer of instance keys at the root (design only)

**The fact.** Which encloser instance a pin belongs to. Today two stages produce it. The instance walks
bank rows with the instance in hand (`from >= 0`). The root, meaning the template check and the
root-level row routes, banks rows for the same pins with no instance (`from < 0`), and
`elabDrainHoleRows` either mints them parentless (the twins) or keys them under encloser instances
itself. D15112 was the price of the second producer. The drain keyed each template row under every
instance of the encloser, so each instance held every other instance's pin. That was 28 cross keys
over the `@run` files. #6128 narrows the rule: a template row fills only an instance whose own walk
banked no row for that declaration.

**Measured on master `f265220a`, over the 5,589 `@run` files**, counting lambdas in an open encloser:
48 files, 425 keys, of which 131 are parentless and 0 are uncovered. With #6128 the total falls to 397 keys,
still 131 parentless and 0 uncovered.

**Why b1, b2 and b3 could not retire the twins.** Each probe changed one route and left the others
minting parentless keys.

* b1 credited a key. The walks that pin the lambda then walked a sibling key that a different route
  had minted with no instance (208 → 206).
* b2 skipped one route's rows. 15 mints moved to `elabOne` with an instance in hand, but the other
  routes still fed the rest (208 → 191).
* b3 removed a row whose pin no other route produced, and lost a run.

So the routes are not redundant copies that can be deleted one at a time. Each root row carries a pin
that some instance needs. What is wrong is only that the root decides which instance that is.

**Where the root rows come from, measured (slice a, master `6015a6da4`).** The plan first assumed
that a root row was banked by the template check, and recorded the innermost call being checked as
its site. On D15112's witness, all 6 of the lambda's root rows recorded no site. A trap at the bank
gave the stack `elabHolePinNote` ← `substHoleTy` ← `elabOne` ← `elabSettle`. The elaboration's own
walk banks them while it substitutes hole types, and they read `from < 0` only because no live
capture is open. A sweep over the 1,191 `@run` files that bank a root row then split the 55,835 root
rows three ways. 8,431 of them belong to a lambda keyed per encloser instance:

| where the row is banked | all root rows | per-encloser lambda rows |
| --- | --- | --- |
| inside an elaboration walk (`elabOne`) | 7,289 | 1,134 (251 with the encloser instance on the walked key's chain) |
| outside every walk, at a call an instance's walk reached (`elabCallKeys`) | 1,556 | 160 |
| neither: the checker's template check of the open body | 46,990 | 7,137 |

**The design.** Each bucket gets one producer, and no row is dropped.

1. **A row banked inside a walk belongs to the walked key.** `elabOne` records the key it walks
   (`elabWalkNow`), and a pin banked during that walk outside a live re-check takes that key as its
   `from`, as a pin banked in a live re-check takes the re-checked key. That is the instance in hand,
   so this bucket needs no site.
2. **A template row of a lambda in an open encloser holds at every instance.** Its pins closed in the
   template check, so no encloser binding chose them. Its home is under each encloser instance, as the
   deferred loop does today (and as #6128 narrows), never a parent -1 key beside them.
3. **The reached-call bucket is not given a producer of its own.** 160 lambda rows is 1.9%, so
   the call-site record is dropped. Those rows are template rows by the rule in 2.

**Slices**, each graded on the twin probe, b3's control
(`closures/hole-fn-list-returned-read-at-two-types.vl`), M5's controls, the D15110 and D15112 named
sets, `@run` output with the split plan on and off, and L2 fuel:

* a and b, landed together. The walk key is recorded (recorded alone, as a column, programs built
  byte-identical, and the probe above is its measurement), and a row banked inside a walk takes it as
  its `from`. The 1,134 lambda rows move from the root to an instance, and D15112's cross keys cannot
  recur even without #6128's rule.
* c, measured and dropped. Keying a lambda's template rows only under encloser instances moved
  nothing: on the 48 files with twins, the count stayed at 397 keys and 131 parentless, and every
  output stayed the same. The template rows were not where the twins came from. Every parentless key
  was the beside-mint in `elabEnqueue`, which minted a parent -1 key beside each parented lambda key,
  whatever route minted that.
* d and e, landed together. With the beside-mint deleted (and slice b in place), one reader still
  asked with no instance: mono's top-level `monoPinLamFromCheckedTy`, which pins a lambda from its
  checked type outside every walk (`generics/unannotated-callback-pins-generic-callee.vl`, a late
  demand). That lambda's checked type is closed, so it is one lambda at every instance, and its
  root key is correct. The elaboration now mints it during the run (`elabClosedLamRootKeys`), for
  each per-encloser lambda in an open encloser whose checked type the checker closed. The two other
  readers this slice was expected to need, a lambda handed to a hole callee
  (`closures/generic-returned-to-un-annotated-param-lambda.vl`,
  `generics/hole-call-generic-lambda-arg.vl`), were already served once slice b credited walk-banked
  rows to the walked key.

**Exit, measured on master `6e694945e` over every `@run` file.** Before d and e there were 402
lambda keys under an open encloser, 133 of them parentless, 0 uncovered. After, there are 344 keys,
75 of them parentless.

* **A parentless key is not the same thing as a twin.** All 75 belong to a lambda whose checked
  type is closed. That lambda is the same at every instance, and the root key is its only correct
  key.
* **6 of the 75 have no parented key at all.** They are in `generics/is-list-arm-anon-record.vl`
  (1) and `generics/is-list-arm-map-callback.vl` (5): lambdas no instance walk demands, which mono
  pins from the checked type. A probe counting every `elabEnqueue` of a lambda made with an
  instance in hand reads 0 for all 6. Its control reads 4 on
  `closures/hole-lambda-in-generic-returned-from-two-instances.vl`, whose lambdas are parented. So
  none of the 6 was ever asked for under an instance, and there is no instance key they should have had.
* **The twins are gone.** No parentless key remains for a lambda whose type is open, which was the
  exit criterion.

**Risks.**

* S2a's measured unsound reuse (`generics/hole-list-literal-local-nullable.vl`, a template pin run
  under one instance's bindings). Slice b enqueues a walk's row from its own key and never runs a
  template pin under an instance. The file runs as before.
* A root key for a lambda whose encloser is not open. Such a lambda is checked inside its
  encloser's scope, and walking it at the root raised `undeclared identifier` for its captures in the
  fixture suite. So `elabClosedLamRootKeys` keys only lambdas in an open encloser, as the beside-mint
  did.

### M6. A hole parameter's delivered record (D15173, design only)

**The case.** `u(a)` called with `r()`, a call the checker rebuilds at `J` (D14741), and with `{ f: 1 }`. Mono builds `u` at `J` and at `{f: i32}`, two row classes. The elaboration holds one key, `?u.0={f: i32}`, because it binds the hole at each argument's checked type.

**The fact.** Per call and per un-annotated parameter `i`: the record the argument is delivered at. That is the checker's rebuilt row for a fresh call or literal (`recRebuiltLeafRow`, D8020), and for a binding the single answer D15172 settles between `recRebuiltLeafRow` and `recBuildTyOf`.

**The producer.** The checker. The fact exists before the elaboration runs, so no stage derives it again. Once D15172 lands, one checker function answers it per argument, and the elaboration and mono both read that function.

**The readers.** The elaboration's call key gets an entry naming the delivered record's row class (`recordRowClassOf`), so `u` at `J` and at `{f: i32}` are two keys, each walked at its delivered record. Mono's hole pin then reads that key instead of `monoRebuiltLitRetName`.

**Why the hole's type stays untouched.** The hole binding `?u.0` is not only a key. It types the parameter for the hole solve, and it is what a call site delivers its argument at. Retyping it to the rebuilt row (#6105's rule applied to the hole, measured for D15173) made the call site deliver `{ f: 1 }` and `r()` at a type their builds do not have. The witness's own fixture became invalid wasm, and three files that hand record literals and lists to holes stopped building. So the delivered record is a separate entry beside `?u.0`. It splits the key and sets the instance's walk type, while the call-site delivery and the hole solve keep reading `?u.0`.

**Open question.** Whether an instance walked at its delivered record while the solve keeps `?u.0` needs any adapter at the call, a widening from the argument's build to the delivered record. #6105's sole-pin case needed none, because there the binding and the delivery agree. The first slice measures this on D15173's witness before any key changes.

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

   4b-ii, planned (2026-11-04, lane LWM). The witness is D15436: `let d1 = (y) => y` and a peer,
   in an instanced body, `d1` written from a nested `function w1() { d1 = d1 }` and called at two
   types. The decline is `ftInstLeafOk`'s `c == b && inFn`: a write from a nested function may run
   outside the instance. The fact it needs is the elaboration's, per capture cell: the writing
   function is declared in the same instanced body and is never itself a value that leaves it (not
   returned, stored or handed on), so the cell, the id written into it and every call through it
   stay in one instance. The elaboration already keys a nested declaration per encloser instance
   (slice 3, `elabMintHandedNested` / `elabNestNote`), so the fact is a per-key flag the
   elaboration sets where it mints that nested copy (`elabCellLocal`), not a syntactic scan here.
   Reader: `ftInstLeafOk` takes a nested write when the flag holds, in place of refusing every
   nested write. The early decision runs before the elaboration, so the admission is the late
   decision's (`fnTagRedecide`). Deletion candidate: `monoBindingAtPin`'s live-pin retry
   (`monoDeclLivePathPins`, its one caller) and the `monoBindSigFail` behind it, once a census over
   `tests/` shows no untagged binding reaching two live pins there; `monoDeclPathPins` itself has
   other callers and stays. The pin-helper baseline is lowered in the PR that deletes them.
   Measured before building the fact: admitting D15436 in `ftInstLeafOk` takes three things:
   - a call-only nested writer (`elabEncl`);
   - a self-write;
   - a copy into a `let` of the same body.
   That tags the set and builds invalid wasm in both plan states, because each instance's capture
   cell is still built at the closure type. So 4b-ii is two steps, in this order. First, the cell's
   element is built at the instance's rep for a tagged set (the emitter's cell, read per instance).
   Second, the decision's admission. The first step alone moves nothing, so it is graded by the byte
   sweep at 0 movers.
   Measured further: with mono keeping a tagged set's cell at the set's type
   (`monoRetypeLamCells`), D15436 at one instance runs. At two it is still invalid wasm, because
   the second instance dispatches to the first instance's lambda arm. So the admission also waits
   on M3 step 2's per-instance arms. D15434 (the `const`
   spelling) was clause 1 until 4b-i admitted a `const` seed of a captured `let` as the `let`
   spelling (#6330's `ftConstSeedsCell`); both spellings now run with the split plan on and refuse
   loudly with it off, and both close with 4b-ii.

**Out of scope.** Sets whose identity varies per instance and escapes the instance; those stay
closures. A per-instance `fnTagBind` (#6000), which no witness needs yet.
