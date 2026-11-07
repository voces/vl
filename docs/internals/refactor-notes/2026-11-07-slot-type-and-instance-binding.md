# Slot type, instance binding and slot deliveries

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Slot type, map values switched** (2026-11-06). `monoPinMapValues` takes the map's type from
`elabSlotTyAt` wherever it closes; `monoPinMapSlot` only instances the stored values at it, and a
disagreement is a loud refusal. Two fact fixes came first: a non-generic slot member answers from
its own signature (#6536), and a slot handed to an open function parameter declines (#6539); the
refusal found the second on D10311, D10383, D10401 and D14400. Where the elaboration declines, an
untagged map whose generic is called at two signatures, mono's spelling stays: it is a rep
spelling, not a type, and is the unbound default (D15494). Over 19,318 programs with
fixpoint seeds no byte moves, and 4,601 filed witnesses grade as filed.

**Slot type, record fields** (2026-11-06). `monoPinRecordField`'s 10 mono-only decisions were
gates in the slot close, not missing facts. An instance's binding now falls back to its
initialiser's closed type there (`elabNodeTy`), and a member not instanced per call answers from its
own signature: four now agree. The four D15494-shape decisions (a generic in a field called at two
types) join its grading list. The last two (`inRecord`: a written `let` of nested lambdas in an
instance) need a nested member read from its instances under the key; that admits the fact but mints
late demands for the lambdas, so it waits until the run foresees them. No byte moves over 19,318
programs.

**Slot type, field and map value read the fact alone** (2026-11-07, after #6589). The record-field
pin types the field at `elabSlotTyAt` and leaves a field the elaboration has no fact for as
checked. Its own derivation from the instance it took (`monoNodeTyAt`, `monoHoleLamAtAnnTy`,
`monoValueAtAnnTy`) goes, and `monoHoleLamAtAnnTy` with it. `monoPinMapValues` annotates a map
only at its slot fact. `monoPinMapSlot` still instances the stored values and types the map's
reads, and refuses a disagreement. Shadowed over 23,384 programs, counted by program:

| pin | agree | differ | mono only | elab only | neither |
|---|---|---|---|---|---|
| record field | 15 | 0 | 41 | 1 | 21 |
| map value | 32 | 0 | 15 | 4 | 13 |

The mono-only cells are fields and maps the checker already closed, and the D15494 maps whose
generic is called at two signatures. Dropping mono's answer there moves no byte. The one elab-only
field program, `generics/nested-capture-per-pin-binding.vl`, now takes the fact at its two fields
with the same bytes. The four elab-only maps are ones where `monoPinMapSlot` declines first, so nothing
changes. Over 19,316 programs no byte moves, and 4,605 filed witnesses grade as filed.

**Slot type, a map of nested function lists** (2026-11-07). `monoPinMapNestedFnLists` was held by
one program, its own fixture `closures/hole-fn-nested-list-map-value.vl`. There the elaboration
already has the map's whole fact, `{[string]: ((i32) => i32)[][]}`, and the leaf fact agrees with
mono's pin. `monoPinMapSlot` now types a list of lists of functions from the whole fact and records
the inner literals at it. A map of that shape without a closed fact is a loud refusal, which no
program reaches. The stored values need no instancing of their own here, because their deliveries
already instance them. The fixture prints the same, and over 19,316 programs no byte moves.

**`monoPinnedElemAnnTy` was unreached** (2026-11-07). It is the element-read arm of the pinned
receiver climb (`monoPinnedListAnnTy`), which a `.map` / `.filter` callback asks only where the
elaboration's walk type for the receiver is open. Over 23,384 programs that climb is entered by 3 and
closes in 2 (`closures/fn-list-mapped-to-functions.vl`, `closures/hole-fn-list-returned-reread.vl`),
both through a binding. The element arm is reached by none: since the tail table was measured the
walk type answers its fixture first. A probe at the call site fires there as the control. The arm
is now a loud refusal and the helper is deleted. The climb itself stays: declining it moves both
closing programs from runs to an emit refusal (`ref valtype with no interned shape`, `call to
unknown function`). Over 19,316 programs no byte moves.

**A re-pointed `let` handed to a function parameter takes the elaboration's parameter type**
(2026-11-07). `monoHandWrittenLet` instances every function the binding holds at the pin. That pin is
now `elabCallParamTy` at the call, and no longer mono's substitution of the callee's annotation.
Shadowed over 23,384 programs, 2 programs reach it with 4 decisions
(`closures/alias-of-written-let-handed-to-generic-fn-param.vl` and
`closures/written-let-of-hole-fns-to-generic-fn-param.vl`). The elaboration closes all 4, at
mono's pin. `monoWrittenLetRetsDisagree`'s refusal fired in none: the checker refuses that program
first (D9003, `holeLetWritesDisagree`). So it is deleted, with `monoBoundTys` and
`monoArrowParamTysAt`, which only it called. A missing elaborated type is a loud refusal. Over
19,316 programs no byte moves.

**The rest of the slot-type tail, measured** (2026-11-07, one probe over 23,384 programs, counted
by program).

- **`monoSigJoin` / `monoPinJoin` never join.** A quiet call signature joined another entry of a
  binding's signature list at a widened pin (a string literal union with `string`). No program
  joins two distinct signatures. `monoSigListAdd` now adds a signature once and never joins, and
  `monoSigJoin`, `monoPinJoin`, `monoPinCarriesString` and `monoPinWidened` are deleted. The
  vacated position's floor is the existing `MONO_BIND_SIG` refusal: a binding called at two
  signatures is refused loudly. Over 19,316 programs no byte moves.
- **`monoRenameInitAt` is class (c).** It is reached by 15 programs: 11 already hold an instance at
  the pin and 4 instance one, and its refusal fires in none. Its pin is the elaboration's
  (`monoDeclPathPins`); what it does is instancing and renaming.
- **Switched: the record-field family takes its type from `elabSlotTyAt`.** That covers
  `monoPinStoredRecords`, `monoPinFieldValue`, `monoPinObjFields` and `monoPinFieldContainer`. The
  fact confirms and does not enumerate: mono's gate still decides whether a field is typed, and the
  slot fact is the type it gets. In cad's shadow over 23,456 programs:

  | function | agree | differ | mono-only | elab-only |
  |---|---|---|---|---|
  | `monoPinFieldContainer` | 6 | 0 | 2 | 80 |
  | `monoPinObjFields` | 6 | 0 | 0 | 171 |
  | `monoPinStoredRecords` | 14 | 0 | 7 | 3 |

  The 254 elab-only cells are left as mono's gate leaves them. The mono-only cells keep mono's
  type, and that fallback is the **D15494 residue**: a record, map or container whose generic is
  called at two signatures has no single slot fact (an owner question). One of them is D15190,
  refused at the write. Over 19,316 programs no byte moves. `monoLetWritesAt`'s `t` is already the
  slot fact, so cad trims it to its fresh-`Map()` recording.
- **A binding's call signatures were only ever asked whether one exists.** After the join went,
  `monoBindCallSigs` had one reader, `monoWritesCoercedFirstCall`, and it asks only whether any
  call has gone through the binding yet. The table is now a set of called bindings
  (`monoBindCalled`). `monoSigListAdd` is deleted, and `monoNoteBindCall`, a two-line forwarder,
  is inlined into its three callers. Over 19,316 programs no byte moves.

**Instance binding: the union-arm and null binds, first measurements** (2026-11-07, 23,384
programs, counted by program).

- **`monoExactPinTyOf` was a second `monoPinSubTyOf`.** Both read `elabInstTyAt` at the instance
  and fall back to the pin. `monoExactPinTyOf` returned a closed pin untouched, while
  `monoPinSubTyOf` still substitutes it. The two differ in 63 programs, and in all 63 they are the
  same type at another id (`tySame`). `monoExactPinTyOf` is deleted and its five callers read
  `monoPinSubTyOf`. Over 19,316 programs no byte moves.
- **`monoParamPinnedNull` compares the annotation's type, not its spelling.** It is true in 5
  programs, and in each the annotation's type is `null`.
- **The rebuilt binding.** In 7,140 programs the key mono demands from its rebuilt binding is the
  call's own key (`elabWalkKeyOf(tplCall, true, decl)`). In 19 more the two keys type every
  parameter alike. In 90 the call key leaves a function-holding parameter open (`((_) => _)[]`,
  `{f: (_) => _}`, `(T) => T`) where mono's key holds the concrete rep. That is Fn#d's question:
  the elaboration minted the concrete instance, and no fact maps the call to it. In 13 a closed
  parameter differs by name, not value: an alias, literal union or narrower structure against
  its base (`NK` against `i32`, `{r: null}[]` against `Circle[]`), which is rowintern's row key.
- **Switched: the instance binding comes from the call key where the key settles it.**
  `monoCallKeyBinding` takes the instance's binding from `ekNames`/`ekTys` at the call's own key.
  It splits the binding as the rebuild did: type parameters onto the let binding, the holes of
  un-annotated parameters onto the hole binding. The gate is decided before any rebuild: every
  parameter at the call key is closed and holds no hole and no function (a literal-or-record cut
  stood here until D15537 closed; the counts below are from before). Otherwise `monoBindCols` and `monoHoleBinding` rebuild it, and that is
  the residue. Counted by program over 23,384, an instance takes:

  | branch | programs |
  |---|---|
  | the call key | 4,047 |
  | rebuild, no call key (lambda and value instances) | 3,001 |
  | rebuild, a literal or record in the binding (rowintern's row key, #6629) | 2,418 |
  | rebuild, a function-holding parameter (see the residue bullet below) | 1,258 |
  | rebuild, a parameter open at the key | 3 |

  The literal-or-record cut was forced. The candidate without it moved 4 programs out of `runs`:
  2 into invalid wasm and 2 into an emit refusal. They are the named set
  `ckb-callkey-binding-price`, and D15537 is the trap's witness. The key binds the argument's
  type where the rebuild pins the row the argument is built at. With the cut, over 19,316
  programs no byte moves.
- **The cut is gone (D15537, closed).** The key is right as a type and the rebuild right as a
  row, and the checker records both: `callBindTysAt` and `callBindRepTysAt`. `elabCallKeyBinding`
  now binds each type parameter at the rep row where the checker records one, and the call key
  keeps typing the call. A probe at every call where the two bindings differ found the rep row
  equal to the rebuild's in all 23 record decisions. The numeric literal unions (`NK` against
  `i32`) have no rep row and take the key's own binding; the one that could not lower was D3540,
  closed by #6651. Widening the producer instead (`elabRowTys` reading the rep row without
  `callBindRepKeyedAt`) breaks three of the four `ckb-callkey-binding-price` cells, because that
  guard keeps the call's own rows at the type wherever a parameter does more than hand its value
  on. So the row fact has one producer, the checker, and two readers asking different questions:
  how the call is typed, and what the instance's argument is built at. Graded by output over
  23,828 programs, 0 move. Over 19,346, two programs move bytes and not output: one instance
  splits where the key binds `T := K` at one call and `i32` at another
  (`numeric-litunion-beside-type-param-joins-one-set`), and one reorders.
- **Two of the guards are deleted.** Each was graded by a hand-written probe of the plainest
  program its sentence forbids, built with the guard on and off, because the corpus reaches
  neither. Counted from the emitted message, attributed by site, against a control that refuses.
  - **The niche check** (`monoNicheNulListCheck`, "a nullable-X list element has no rep") refused
    working programs. A `(T | null)[]` whose `T` binds to a function, inferred or annotated, and
    a generic record's `(P | null)[]` read through a lambda all build and print the right value
    without it. The position matrix (`nullable-fn-list-through-generic-{explicit,inferred}`) goes
    from refused at every position to 48 of 48 graded cells running in both templates, with 0
    silent. D2525's boundary fixture is refused one step later, at shape interning, and is
    unaffected. The two un-annotated probes each mint one late demand (D15539: `first` at a function
    element), which is recorded as their price.
  - **The seeded-binding check** (`monoLetTyParamMisfit`) is unreachable. The one probe of the
    shape it forbids is refused first, with "a generic function taken as a value reaches no call
    that fixes its type", in both states. That probe is now that refusal's witness.
- **The function-holding residue stays on the rebuild: mono's binding carries reps, and some
  arguments have no type.** Over the 2,470 programs whose instance takes the rebuild path, each
  function-holding parameter was bound in a shadow from the argument's identity
  (`elabNodeTy(arg)` at the call, then `elabNodeTyAt`) and compared with mono's binding. 129 agree.
  The value-instance key (#6645) is a signature fact and is not the source here. It splits
  per-identity instances into per-signature ones, which is the argument-keyed design and waits on
  the owner. The rest is the target, not a switch:
  - **Bind the type, not the rep (56 sites).** In 32 sites mono binds a bundle record
    (`{c0: (f64) => f64, c1: (i32) => i32}`) where the identity is `(_) => _`. In 24 it binds the
    table-index rep (`i32[]` for `((i32) => i32)[]`). The binding should hold the type and let the
    rep layer pick the bundle or the table index. This is the type-versus-rep conflation that
    `monoSameTyCtor` shows for adopted bundles.
  - **Type the argument (689 programs).** A named function or a lambda literal passed as a value
    has no elaboration type at the argument node, for example `[0, 1].mapIndexed(base)`. That is
    prerequisite (A), identity typing for concrete function values.
  - **23 sites are open on one side only.** In 11 the identity is concrete and mono is open
    (`{f: (i32) => i32}` against `{f: (T) => T}`). In 12 it is the other way round.
- **Switched: an instance's parameter maps come from the elaboration, and the shared-pin poison is
  deleted.** `instancePinnedMaps` reads each parameter's type as the instance's elaboration closes
  it, and falls back to the pin its call supplied only where the elaboration leaves it open.
  `monoPoisonSharedPins` had marked a parameter `-2` when a second call reached the same instance
  with another map. Over 23,384 programs, the two readers of those maps (the niche test and the
  soft-twin test) decide the same from either source wherever the elaboration answers: 116
  program-outcome rows, 0 differ. No decision read the mark. The one shape that reached it, a literal-union map and its
  plain twin through one instance, is still refused, and now by the soft-twin test whose message
  names the fix. Both call orders are fixtures (`error-literal-union-map-twin-through-one-instance*`).
  Over 19,316 programs no byte moves.
- **Switched: a cloned lambda's parameter takes the elaboration's type at the instance.**
  `monoLamSubstParams` already read the lambda's elaborated type (`elabNodeTy` at the walk key)
  for an annotation that rides a type parameter. Its un-annotated arm now reads it too: where
  `monoLamParamPinAnn` pins a parameter, the elaboration's closed type is used, and mono's pin
  only where that type is open. Shadowed over 23,384 programs, the arm acts in 690 programs. The
  elaboration agrees in 602 of them and differs in none, and is open in 89, which stay on mono's pin. In 74 more the elaboration
  closes a parameter mono leaves bare (69 `i32`). Those keep mono's answer: taking the closed
  type there too leaves 66 byte-identical and makes 5 invalid wasm, because one lambda literal
  serving instances at two types gets pinned at the walk key's type for both. The 5 are the
  fixtures `hole-param-alias-call-delivers-lambda-at-callee-type` and
  `hole-lambda-literal-two-instance-types`, and the witnesses of D14729, D5931 and D12235. The substitution arm never ran with the elaboration open, so that branch is now a
  loud internal refusal. About 140 programs reach the arm with the type closed and keep running.
  Over 19,316 programs no byte moves.
- **Switched: the union-arm and pre-bind bindings take the call's elaboration binding.**
  `monoBindBareUnionArm` (with `monoBindNullArm`), `monoPreBindPastUnionRest` and the
  argument pre-bind through `monoBindInnerUnionArms` still decide which type parameter a union
  arm binds. The type each binding takes is now `elabCallBindTy` at the call, where it is closed.
  Shadowed over the 9,013 programs that enter them, 45 program-outcome rows decide, and the
  elaboration answers all 45 and agrees with every one. `monoBindCols`' own call of `monoBindInnerUnionArms`
  never bound anything and is deleted. Then the binders went: `elabBindUnionArmsFromCall` binds
  each type parameter that stands as a union member or nullable inner of a parameter type, at any
  depth and through function results, at `elabCallBindTy`, behind the callers' own gates (a closed
  argument type, a known argument pin). `monoBindBareUnionArm`, `monoBindNullArm`,
  `monoBindInnerUnionArms`, `monoFnRetIsUnion` and `monoFnRetEnd` are deleted (`emit_mono` 967 → 962).
  Over 19,316 programs no byte moves, at each step.
- **Switched: a pinned node's type and a lambda-bound call's type come from the instance.**
  `monoPinnedTyOf` and `monoLamCallTy` waited on an elaboration instance for lambda bodies
  (D3616), which `elabInstNodeTy` now is. Mono still decides whether a node's type is settled;
  where it settles one, the type is `elabInstNodeTy` at the walk key when that is closed. Over
  23,384 programs they decide in 4,521 programs, 4,844 program-outcome rows: the instance type
  agrees at 4,698 rows and differs at none. It is open at 146 rows, which keep mono's substitution: 52 in filed witnesses, 29 in `closures`, 27 in
  corpus cells, 26 in `generics` and 12 elsewhere. At 2 of those, `listed-hole-fn-written-param-reject`
  and D15011's witness, the value-instance signature differs from mono, and mono keeps them.
  Over 19,316 programs no byte moves.
- **Switched: a nested list of hole functions reads its binding's slot fact.**
  `monoCbFnListRowSpell` spells a callback's row from the element of `elabSlotTyAt` on the binding,
  and `monoBoundFnListElemsTy` takes the const's slot fact as the list type, each where the fact
  is a closed list; mono's annotation spelling and bound type answer where it is not. The fact
  agrees at 4 of 4 and 1 of 1 decisions. Over 19,316 programs no byte moves.

**Binding type, adopt-init switched** (2026-11-07). `monoBindingAdoptInit` gives an open
binding the elaboration's closed type (`elabNodeTy` at the key of the function whose body holds it)
and refuses a disagreement. Each binding's key comes from a walk of every body in `monomorphize`:
an instance clone's nodes postdate the write index, whose parent table traps on them. The shadow
read 21 agree, 0 disagree and 156 mono-only. A capture cell `E[]` agrees with a value fact `E`, and
mono's cell is kept (#6573).

**Slot type, a named generic handed through a set** (2026-11-07). In `for f in fs { f(snd) }` the
holder's member `apply2(g)` has an instance whose `g` holds `snd`'s identity, `((_, _) => _)`, and the
pushed lambda `(g) => print(g("z", k))` is not top-level, so the holder declined. A call through a
set now records the generic declaration an open argument names (`fnSetCallGenAt`). A member's open
parameter closes to that generic's instance at the calls the member makes of it. A lambda member
reads those calls under each instance key of the function holding it. The parameter must be read
only as a callee and every call must agree, else it declines. The 8 list holders of D12940's
family now agree with mono, with no byte moves over 19,318 programs. Not closed by this:
`functions/exported-generic-reached-through-lambda-field-or-list-called.vl`, whose element returns
the generic (`(() => ((T) => T))[]`), and the 2 holders of
`closures/hole-fn-generic-pushed-list-spread.vl`. There the generic itself is the member, called
at two types, so they go to the reach lane's bundle fact.

**Slot deliveries, the reach rung deleted** (2026-11-06). `monoDeclPathPinsOrReach` and
`monoStoredSlotFnTy` fell back to value reach (`vrCalleeTy`) where the elaboration's slot pins were
empty. Over the 23,456 programs the reach rung never answered alone: at 1,553 site-hits the pins
agree 61 times, the elaboration alone answers 383, and neither answers 1,109. The rung and its
three functions are deleted. The written `let`'s seed signature (`monoSeedCallSigTys`, under
`monoCallIfBound`, `monoCallWrittenLet` and `monoCallIfValue`) is reached past its gates by 8
programs: in 6 its parameters agree with `elabCallParamBoundTy`, and in 2 neither closes (D15260's
shape, which runs).

**Slot deliveries, switched** (2026-11-07). The parameter pins were already the elaboration's
(`monoDeclPathPins` reads `elabSlotDeliveries`). Mono still derived the slot type's result, and
for a written `let`'s call a signature from instancing the seed at that call
(`monoSeedCallSigTys`). Shadowed over 19,336 programs (`tests/cases`, the distilled cells and the
named sets) against the one closed function type the elaboration delivers the slot at, 228
decisions in 85 programs:

| site | decisions (programs) | agree | differ | mono only | elab only | both decline |
|---|---|---|---|---|---|---|
| `monoPinListElems` | 110 (50) | 103 | 0 | 4 (3) | 2 (1) | 1 |
| `monoStoredSlotFnTy`, with `monoRetLitElemTy`'s | 69 (24) | 66 | 0 | 3 (2) | 0 | 0 |
| `monoStoredSlotFnTy`, no single pin | 13 (5) | 0 | 0 | 0 | 0 | 13 |
| `monoCoerceWrittenCell` | 19 (5) | 16 | 0 | 0 | 0 | 3 |
| `monoCallIfBound`, pin | 11 (5) | params 11 | result only, 11 | 0 | 0 | 0 |
| `monoCallIfBound`, seed | 2 (2) | 0 | 0 | 0 | 0 | 2 |
| `monoCallWrittenLet`, seed | 4 (3) | 1 | result only, 3 | 0 | 0 | 0 |

- The mono-only rows are a slot the elaboration delivers at two types, of which mono kept the one
  left after the calls the flow rewrite repointed (`mfrSetCalls`). That omission is slot held fns'
  fact, and `elabSlotDeliveriesOmitting` reads it there. The elab-only row is
  `closures/hole-fn-generic-pushed-list-spread.vl`, the reach lane's bundle above.
- **A call helper's `=> void` result is a pin spelling, not a type.** It means the result is not
  pinned. Taking the elaboration's full type there instead moves three programs from runs to a
  loud emit reject (`cannot take the generic function … as a value`):
  `closures/hole-fn-if-bound-called-through.vl`, `closures/hole-fn-labelled-block-loop-declared.vl`
  and `functions/nested-hole-fn-namesakes.vl`. Those are the regression cells for anyone who
  changes the spelling.

The switch: `monoStoredSlotFnTy`, `monoPinListElems` and `monoCoerceWrittenCell` take the slot's
type from the one delivery (`monoSlotDeliveryTy`, omitting the repointed calls where the pins came
from `monoFlowSlotPins`). `monoPinListElems` falls back to `elabSlotTyAt`, which answers its one
mono-only decision left after the omission. Where neither answers, `monoStoredSlotFnTy` refuses
loudly (reached by no program), and `monoPinListElems` leaves the list as
checked, as it did: an open generic's delivery is no answer
(`functions/exported-generic-reached-through-lambda-field-or-list-called.vl`). Two gates stay,
because a delivery is the slot's type, not each value's (`monoValsOwnFnTy`). `monoStoredSlotFnTy`
declines values whose own results at the pin disagree, and both it and `monoPinListElems` (which
keeps `monoListStoresAgree`) type the slot at the values' own agreed type where that is not the
delivered one, so a write of another result is refused where it is made, with the contract message.
Without them D15353 and a list read before a helper writes a function of another result
(`closures/error-fn-list-element-returns-other-than-a-write-through-param.vl`) build check-clean and
trap at the call (`indirect call type mismatch`), and D15190's refusal moves from the write to a
mechanism message at the call. The fixture adds one late demand, pre-existing on master and newly
counted by `closures/error-fn-list-element-returns-other-than-a-write-through-param.vl`. It is D15136's
`put` at the argument's own type, demanded by the root call `put(xs)`. `hand` is never built: its
second call of `put` makes `fnWriteOnlyInto` decline, so the elaboration delivers `xs` at `half`'s type.
It exists only on that refusing build, and it goes with D15136's own fix. The baseline's other entry,
`closures/listed-hole-fn-escaping-list.vl`, is `use` minted at `((i32) => i32)[]` inside `take`'s
instance. It is the signature twin of an instance the elaboration holds by identity
(`((T) => T)[]`), and the twin's signature is mono's choice, so it is parked in Fn#d's identity
territory, not foreseen. `monoCallWrittenLet` instances its writes at the delivery's pin, and
`monoCallIfBound` no longer falls back to the seed. Mono's result derivation then decides nothing
in the population, so `monoListSlotPinnedFnTy`, `monoPathSlotPinnedFnTy` and `monoHeldSrcsFnTy` are
deleted. `monoSeedCallSigTys` stayed for `monoCallIfValue`, an inline
`if` with no binding; it went with that function's signature step, which no program reaches.
