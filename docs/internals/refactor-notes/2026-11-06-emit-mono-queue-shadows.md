# Shadows of the queue, the fallback sources and bucket 1

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Three of the queue close without a switch (2026-11-06).**
- `monoNarrowedNominalPinName` is DECISIONS.md's rung 2 (D25, "Which channel owns a NARROWED
  argument's type at a monomorphization pin"). It reads the argument's checked type, or
  `elabClosedTyAt` inside a generic body, and pins the narrowed name where that type is a member of
  the annotation's union. Shadowed against the elaboration's binding of the type parameter at the
  call (`elabCallBindTy`, the call found through the write index's argument edge), over the 23,103
  programs (5,203 reach it):

  | outcome | events |
  | --- | --- |
  | both answer, agree | 28 |
  | both answer, differ | 4 |
  | old only | 0 |
  | new only | 10,021 |
  | neither | 5,816 |

  The 4 that differ pin `Circle` where the elaboration binds the whole union
  (`soundness/nulvariant-generic-pin.vl`, `std/array-reduce-narrowed-variant-init.vl`). That is the
  ruling: the pin narrows below the binding. The new-only cells are calls the rung leaves to the
  ladder. No elaboration fact carries the narrowed pin, so it stays.
- `monoIfChainRebuild` computes no pin. It rebuilds a rewritten `else if` chain, and its one
  decision arm gives each rebuilt link its original's checked type. Its per-instance twin
  `monoIfChainRebuildPinned` is the one with pin logic.
- `monoMakeInstanceGo`'s instance note is the instance key, already the elaboration's ("The call
  half and the value half" below). The only spelling left is an instance the elaboration has no key
  for; the 4 bundle members that section names are keyed since #6461.

**`monoIfChainRebuildPinned` is aligned (2026-11-06).** It retypes a rebuilt value `if` link in an
instance at a pinned join. Shadowed by rep (`repCanonKey`) against the instance's elaborated type
of that `if` (`elabNodeTy(at, elabWalkTop())`, where closed and other than the template's type), over
the 23,103 programs (2,638 reach it):

| outcome | events |
| --- | --- |
| both answer, agree | 983 |
| both answer, differ | 5 |
| old only | 0 |
| new only | 384 (227 programs) |
| neither | 6,101 |

The 5 that differ are narrower or boxed pins: `string` where the elaboration has `string | i32`
(D3366), `(A|B|null)` against `(A|B)?`, and `f64?` against `(f64|i32)?`. Retyping at the
elaboration's type wherever mono retypes leaves 499 of those 500 programs byte-identical, and the
one that moves prints the same. Whether to retype at all stays mono's gate (ruling (a)), so the
function stays.

**The gate reads the elaboration** (2026-11-06). `monoIfChainRebuildPinned` retypes a link at
`elabNodeTy(at, elabWalkTop())` wherever that is closed and is not the template's type, its union
box registered as before (`monoPinUnionBoxed`). Re-measured at `e925b06a`: 983 agree, 5 differ,
0 old only and 457 new only (293 programs). The six helpers only the old gate used, and four they
alone reached, are deleted (`monoIfArmsAllTy`, `monoIfArmsPinJoin`, `monoHoleJoinPinsString`,
`monoHoleJoinHasAtomArm`, `monoPinKeepsMembers`, `monoCoalOverTpJoin`, `monoArmPinsLitUnion`,
`monoArmTailIsTy`, `monoHoleJoinPinTy`, `monoTySameOrVar`).

The 5 that differ take the elaboration's type. Four of their programs are byte-identical and the
fifth (`generics/match-join-of-nullable-param-keeps-concrete-arm.vl`) prints the same. Taking the
new retypes made the `boolean` instance of `generics/generic-optchain-map-get-coalesce-scalar.vl`
invalid wasm. That was [D15500](../inventory/D15500.md), live on master in other spellings: a
generic's `?.get` default `null` read the template's open stamp. `nullOwnAt` now reads the
instance's context there.

The byte sweep against master's fixpoint moves 5 of 23,103 programs, each printing the same:
`coalesce-join-tag-in-instance`, `generic-if-null-join-coalesce-scalar`,
`generic-optchain-map-get-coalesce-scalar`, `match-join-of-nullable-param-keeps-concrete-arm`
(`generics/`) and `maps/optional-chain-get-nullable-map`.

**Shadow of `monoHoleGenFnPin`** (the signature a generic handed to a hole parameter takes), against
`callArgRepTy` over `elabCallParamTy` at `monoPinHoleParam`: 83 programs agree, 0 disagree, and 4 get
no elaboration answer: `closures/generic-fn-value-returned-through-identity-hole.vl`,
`closures/hole-fn-if-join-result-handed-hole-fn.vl`, D12340 and D15455. Each is a signature fixed
past the call, by calls through the result, which only the flow table carries. The switch to the
elaboration's answer waits for those four, so it lands with the derivation's deletion and not beside it.

**Shadow of `monoCloneGenericCalls`' recorded type** (2026-11-06, master `361a98fd`, parked). A node
the instance body clone re-makes records `monoCgcTplTy(ix)`: the template's checker type with the
instance's holes read in. That was compared against `elabTyIn(ix, ek)`, with `ek` the elaboration
key `monoMakeInstanceGo` builds under, over 19,316 programs. 1,214 reach the arm. Counted by programs
showing each class at least once:

- 952 agree;
- 282 open: the old type names a type variable that a later pin substitutes, so they are not graded;
- 21 differ: i32/f64 in 10, string against a number in 4, an `<error>` template type in 6 (the
  elaboration has the instance's type, e.g. the recursive call in
  `generics/recursion-at-same-type-runs.vl`), and boolean/f64 in 1;
- 488 old-only. 448 of them are `elabTyIn`'s own -2, "the emitter retyped this node since", and 40
  have no entry;
- 243 new-only: the template node records no type and the elaboration does, mostly function lists
  and nullable function values. Switching would type nodes mono leaves untyped today.

The 448 retyped cells are not a missing fact. The elaboration knows the emitter retyped the node, so
the open question is which pass owns the node's type. Order the passes before switching this arm.

**Shadow of `monoPinLamFromCheckedTy`'s pin** (now `monoPinLamAtDelivery`) (2026-11-06, same population). The lambda's
contextual parameter types, read off the checker (`monoFnValueParamTys(nodeTyIxOf(lam))`), were
compared against the one closed delivery `elabSlotDeliveries(lam, [], elabKeyAt(lam))` gives at the
lambda's arity. 968 programs reach the function, 950 of them leave at the gate because the body calls
no generic, and 1 takes the D9712 row spelling. Of the 22 that reach the pin, 18 agree and 4 have no
closed tuple on either side. None differs, none is one-sided, and none has two deliveries. Switched:
the pin reads `elabLamDeliveredParams` (emit_elab), and the function is `monoPinLamAtDelivery`. It
deletes nothing: `monoFnValueParamTys` has three other callers.

**Shadow of `monoCloneLambdaSubst`'s return pin** (`monoLamPinRetAnn`, same population). The
elaboration's per-instance result of the lambda (`monoLamElabRet`) is asked first, and the binding's
substitution is the fallback. 690 programs reach a return still naming a type variable. The
elaboration answers in 272 of them and the fallback runs in 429, closing a pin in 489. The pins are
mostly scalars, nullables and literal unions (`string` 61, `i32 | string | null` 56, `i32` 51). The
fallback is live, so the arm and its helpers (`monoSubstInst` at the result, `monoLamReachParamTy`,
`monoRetReadsHoleParam`) stay until the elaboration types a cloned lambda's result under the instance
key in those programs. That gap is this family's real blocker.

It was not a missing fact. `monoLamElabRet` asked the elaboration only at an instance with hole
pins. Asked at every instance, with a hole the walk keeps open read from the binding, it gives the
fallback's pin in 376 of the 429 programs and closes nothing in the other 53. It answers 1 program
the fallback left open (`generics/generic-value-slot-written-in-generic-body-at-two-instances.vl`)
and closes 1 the fallback closed only by substitution (`generics/hole-lambda-calls-per-instance.vl`,
whose `(_) => _` walk type the binding closes). It differs in none. Switched: the fallback block is
gone, and `er` keeps its old meaning (the hole instance's own elaboration answer) for the box
registration and the literal-member gate, so the switch is byte-neutral over all 19,316 programs.
The helpers went with the parameter side, below.

**Shadow of `monoLamParamPinAnn`** (the parameter side, same population). The binding's substitution,
else `monoLamReachParamTy` (D7181), was compared against the elaboration's walk type of the parameter,
with a hole read from the binding. 654 programs reach the pin: 597 agree and 37 close nothing on
either side. 53 are old-only, where the elaboration keeps the parameter open: a type variable of
another declaration (`U`/`V`) on a lambda held in a written `let`, a capture cell or a returned
lambda called across instances, or a hole `_`. 10 are new-only, and none differs.

The binding's substitution stays first, so what the elaboration has to replace is the reach rung
alone, and every one of the 53 is a cell the substitution answers. `elabLamParamTy` (emit_elab)
climbs from the lambda node under the walk top's reach closure, records the calls its value
reaches as callee, and takes the one closed parameter type across their delivered types. A call
inside another lambda counts only where that lambda's own parameters close the same way. On the
reach rung's own cells (programs, 19,316 run): 4 agree, 3 new-only, 0 old-only, 0 differ.

Two narrower readers came first and each was refuted by a witness. One that also took the
lambda's walk type and slot deliveries pinned a lambda's own per-call hole at the type one call
delivers (D1795's `use(p)`), which broke 7 filed witnesses and 8 `tests/cases` programs. Counting
every call inside a lambda pinned D12235's `g`, whose capture `n` stays open, which turned a loud
emit refusal into invalid wasm. Switched, and `monoLamReachParamTy` is deleted. Of the 3
new-only, 2 build byte-identical, and `generics/hole-lambda-calls-per-instance.vl` moves bytes
but prints the same output.

`monoRetReadsHoleParam` (D2878) asked syntactically whether a `const` lambda the instance only
calls returns a hole parameter or a field chain off one. Asked instead whether the template's
return names a variable that the elaboration types closed, and not a function, at the instance:
4 programs agree, 0 old-only, and 58 new-only lambdas (mostly `() => <capture>` with a closed
scalar or nullable result) build byte-identical. Switched, and the helper is deleted with the
`monoCgcHoleParams` table and `monoHoleParamNames` that only fed it. Against a master fixpoint,
both switches together move the bytes of 1 of 19,316 programs, the one named above.

**Shadow of `monoWalkIdentCall`** (the instance a generic call is pointed at), re-measured on
2026-11-06, master `611070b80`, with `scripts/inst-shadow/run.sh` over 23,380 programs: `tests/cases`,
the distilled cells and named sets, and every filed witness. 8,678 of them make such a call. Mono's
side is the parameter types of the instance the call itself made or hit. The elaboration's is
`callArgRepTy` over `elabCallParamTy` at the walk top. Mono's own frame key (`monoFrameInstTmpl`)
never answers where the walk top does not, and the walk top answers 22 parameters it misses.

| call | calls | programs |
|---|---|---|
| agree | 26,399 | 8,541 |
| disagree | 2 | 2 |
| the elaboration has no closed type | 807 | 348 |
| mono's own pin is not closed | 1,969 | 573 |

A parameter whose two types differ still agrees under a named rep rule. Each rule was checked
against the emitted wasm:

| tag | params | programs | the difference |
|---|---|---|---|
| `litrep` | 89 | 46 | a literal union against its base, member by member (`N \| null`, `i32 \| null`) |
| `repeq` | 55 | 26 | a `Set` against its boolean map |
| `bundle` | 45 | 10 | mono's closure bundle record, whose fields are `elabCallBundleSigs` |
| `monoopenrec` | 19 | 10 | a record of generic functions mono leaves open and the elaboration closes |
| `nulfn` | 15 | 5 | `F` against `F \| null`, one closure reference either way |
| `colstub` | 12 | 4 | mono's pin column reads `i32` for a generic handed to a hole; the wasm takes the closure (`via(app)`, `generics/hole-call-generic-lambda-arg.vl`) |
| `annrow` | 2 | 2 | a concrete annotation, emitted as the parameter's type whatever row mono's column records (D4300) |

The two disagreements build no wasm. D3178 is an open emit reject: mono's `{f: () => boolean}`
against the declared `{f: () => boolean} | null`. `soundness/error-generic-nulreflist-field-pin.vl`
is a check-reject fixture. No call is left where mono is right and the elaboration wrong.

Where the elaboration has no closed type (parameters):

- `no:openhole`, 520 in 211 programs: the instance's parameter is a hole function type, a hole
  parameter handed a closure or a bundle (`closures/bundle-parameter-called-from-a-capturing-closure.vl`).
  This is `monoHoleGenFnPin`'s ground, re-measured after its switch.
- `no:nokey`, 292 in 125: the call has no elaboration key. Two kinds:
  - a non-generic callee at a storage row, whose rep is `recArgRepOf`, so no fact is missing
    (`soundness/built-container-read-handed-to-annotated-callee-runs.vl`);
  - a call that needs a key: through a generic value
    (`generics/call-through-generic-value-owns-only-its-constraints.vl`), cross-module UFCS
    (`modules/generic-ufcs-overload-set/`), or an empty list at an unbound type parameter.
- `no:noframe`, 39 in 20: keys exist, none from the instance being walked
  (`closures/generic-list-to-unannotated-param.vl`).

**The fallback sources, graded** (2026-11-06, master `361a98fd6`, the same population). For each
parameter the walk top leaves without a closed type, `scripts/inst-shadow` grades eight other
elaboration sources against mono's pin, in the order the switch reads them:
1. the instances the parameter carries;
2. the argument's own type;
3. the bundle signatures;
4. the tagged set the argument carries;
5. the parameter's type with the shadow aliases a rename minted (`T__sh<d>`, a spelling difference);
6. the open type, where mono spells it the same;
7. the single signature `elabCallBundleSigs` drops;
8. the checker's closed type for a solved hole parameter.

A non-generic callee with no key is graded against `recArgRepOf`, else its annotation (`argrep`):
all 118 parameters in 55 programs agree, so that bucket needs no new fact.

| bucket | params | answered and agreeing, by source | no source |
|---|---|---|---|
| `openhole` | 520 | 447: bundle 251, tagged set 122, same open spelling 33, shadow alias 31, own instances 8, argument 2 | 72 |
| `nokey-gen` | 86 | 24: checked type 16, argument 8 | 62 |
| `nokey-plainhole` | 71 | 68: checked type 66, argument 2 | 3 |
| `noframe` | 39 | 27: argument | 12 |
| `nokey-emptylist` | 10 | 0 | 10 |
| `nokey-value` | 7 | 0 | 7 |

One source disagrees, and it is no gap. `closures/lambda-bundle-through-hole-param-at-several-signatures.vl:19`
hands a function that takes the bundle; the signature the elaboration records belongs to the
inner call.

What no source answers:

- **A generic function value whose instance is fixed past the call** (72 `openhole`, 35
  programs). The value is handed into a hole parameter, a map or a list, and mono pins it from the
  calls made through it later: D9480, D9890, D10023, `closures/generic-fn-value-returned-through-identity-hole.vl`.
  Most of these run today. The missing fact is the one D15298 pins: function-value identity in the
  type (`Fn#d`, §2.2 steps 3 and 4). This bucket is blocked on it.

**Bucket 1 is untagged sets, in five groups** (2026-11-06, master `d0f6b772`, re-measured with
inst-shadow: 50 parameters in 19 programs). `Fn#d`'s machinery has landed: function sets on
`TyFunc`, the tag, and per-member dispatch. Every bucket-1 parameter is a set the tag decision
leaves untagged, or no set at all. A probe naming the refusal of each set and the mono rung that
pins it splits them:

| group | params | programs | what refuses the set | mono's pin |
|---|---|---|---|---|
| G1, a generic handed back by a hole identity | 8 | 1 | hand-back through a forwarder; an annotated hand-back (D15490) | `monoHoleGenFnPin`'s flow sub-rung |
| G2, a map of generics handed to a hole parameter | 13 | 4 | the map's value carries no set: identity is lost at an un-annotated `Map()` write (D15298) | the argument's checked type |
| G3, a list of hole functions handed to a hole parameter | 15 | 7 | `mintSetPartial`, or a coerced holder | `monoArgPinName`, `monoPinnedListElemPin` |
| G4, a lambda calling its parameter with a generic at two types | 9 | 4 | `ftLambdaIdOk` | `monoClosureBundlePin` (D3975) |
| G5, a set nothing calls through | 5 | 4 | never tried: the closure rep by design | the rep cascade's default |

G5 is a default, like bucket 2, not a missing fact. G1 closed with D15490 (S1), which leaves 42
parameters in 18 programs. S2 (D15491) tags a list whose helper pushes one of its own elements back
onto it, by a hole parameter or by `T` beside `T[]`, and S2b the method spellings `v.insert(0, v[1])`
and `v.fill(v[1])`, whose receiver is the declared callee's first parameter. `monoPinnedListElemPin`
answered 5 calls in the whole population: S2 and S2b move 4 onto the tagged set, and the fifth, an
annotated function slot, reads the elaboration's closed type for the parameter. The function is
deleted. Mono pins the `T[]` at the list of ids, and a hole parameter handed a held map at the
held map (`monoPinHoleParam`), spellings no elaboration key uses: a held rep is a storage rep, and
keying the run at it makes the instance's re-check refuse the helper's own store. So the call's own
set-bound instance answers such a pin instead (`elabPinsUnheld`, `elabCkHeldUsable`): late demands
fell from 7 to 1 running program; the two refusing fixtures that guard a helper shared by maps of
different sets count one each. The one left, `use` in `closures/listed-hole-fn-escaping-list.vl`,
is the closure-list rep of D15010, which mono should read from the elaboration. One helper instance
serves holders of different sets, since a tagged id is its member's declaration index in every set.
#6650 raised the count from 2 to 4 by deleting mono's niche guard. That guard had refused two
programs that run: a generic whose `T` binds to a function through `(T | null)[]` is instanced
late at the concrete signature. This is D15539, held by Fn#d's value-instance key (#6645), and it
is a different mechanism from `use`.

G2's write through a parameter (D15492) lands in the caller's map with its set; what refused it
was the store into the parameter's slot, which the tag rule now takes when every call hands a
holder of the set or a wider one decided with it (`ftParamHolderHolds`), and only for a written
value naming a declared function, whose set no call changes. Bucket 1 is 32 parameters in 16
programs. The map pin (`r5_rt`, the argument's checked type) answered 13 at #6530: 5 in D9480's
fixture, whose map holding a non-generic keeps the set untagged, 3 written as a record `{f: id}`,
3 an uncalled set (G5), and 2 outside bucket 1. The 3 record-written hits are all in
`closures/hole-fn-generic-map-stored-through-parameter.vl`, whose `{id}` set three maps keep on
mono, each alone: `c`, written only directly (served since D15532); `b`, a map of records a helper
widens to two generics (served since D15493: a map slot's record joins each function field with every
function written there, `elabSlotRecJoinTy`); and `h`, a map of functions a helper widens to two
generics (served since D15531: the helper's write is the member's leaf, `fnTagMapWriteLeavesOf`,
whether or not the member has another). All three are served, and the file now tags.

Two of the 13 are residuals with a named blocker, not a missing admission:

- **D9480's mixed map** (5): one store node `mm["k"] = id` in `fill` lands as an id of `{id}` in
  the instance for a map holding only generics, and as `id@i32`'s closure in the instance for a map
  that holds a non-generic `inc` (its value type is closed, so a generic written there is
  instanced, by design). The tag decision is per node, so it refuses the set for both. It needs a
  per-instance rep for one node (the per-instance mint; `fnCloCoerceSetAt` gives up at -2 for the
  same reason). Controls: a map holding `inc` and written `id`, directly or through `fill`, called
  at two types, is a check reject at both spellings, as the design says. The per-instance mint's
  population was measured over the same programs: `fnCloCoerceSetAt`'s -2 had 0 hits.
- **The map-of-records holder kind** (3, and D15493's gain): holder kind 8, a map binding of the
  set's records, is a holder whether it is written directly or through a helper's parameter. Every
  literal written into it is stamped at the binding's held rep's record, and emit builds a stamped
  literal at that record's own row (`mintPinnedObjLit`) rather than minting an id row of its own.
  collectA interns the held rep's value row and mv slot (`fnTagHeldRepOf`), the rep `Map()` and
  every read of the binding already resolve to; without it a map written only directly had no slot
  (`closures/map-of-records-beside-list-of-same-record.vl`, D15532). Mono still pins a helper's
  parameter at the held rep (`monoPinHoleParam`); that pin is the instance's type, not only the
  intern, and without it the helper's store refuses. An entry read through `?.` is not a holder:
  `drwOptGuard`'s call gets no id member call, so
  `closures/generic-record-written-into-map-through-param-read-through-optional.vl` runs on mono as
  on master (a decline, not a refusal). Two different generics in one map of records join field-wise
  and run (D15493); written by `.set`, a record literal is not admitted, so that spelling refuses.

The `r5_rt` rung itself is deleted. Re-measured after D15531 it fired 15 times over `tests/cases`
(11 function-holding pins in D9480's fixture, G5's, the stored-through-parameter file and the `?.`
decline; 4 `i32` pins of un-annotated helpers), and in every one `monoArgPinName` answers the same
pin: without the rung every fixture and the compiler's own build are byte-identical, the corpus and
the filed witnesses do not move. The residuals above stay where they are, served by that fallback.

`monoHoleGenFnPin`'s flow sub-rung (`monoHoleGenFnFlowTy` and `monoChoiceArmFlowTy`) pinned 33
parameters on master: G1's 7, and 26 whose instance already agrees with the elaboration's. It is
not deleted. It already reads the elaboration (`elabSlotDeliveries`), and switching it to the
elaboration's parameter type was measured at the function after S1: 35 calls agree, 1 is old-only,
about 600 are new-only and 22,518 decline on both sides. The byte sweep moves 4 files, one of them
`runs` to a refusal, the same three #6485 found and one more.
- **A type parameter the call leaves unbound or ambiguous** (62 `nokey-gen` and 10
  `nokey-emptylist`). Mono defaults it (`monoDefaultUnboundTyParams`): `f(Map())` (D14735),
  `one(Set())` (D15040), `len([])` (D12581), and `F<A, B>(v: A | B)` at `5` (D14803). This is a
  named fallback, a defaulting rule rather than a missing fact. The elaboration should own the
  default eventually, but not in this change. After the two `nokey-gen` key fixes below, the 2 `nokey-gen`
  parameters remain, both this default: `id` called inside a lambda forwarder no call instances
  (`generics/mono-lambda-forwarder-uninstantiated.vl:49` and `:54`), which mono pins at `i32`.
- **A call inside a body mono cloned** (12 `noframe`), which the walk top does not index:
  `len$m…$2` in `generics/typaram-list-union-param-forwards-to-generic.vl`, `inc3$1` in
  `closures/hole-fn-record-field-called-at-other-param.vl`. Closed by #6515: mono's closed-pin
  key refines the call's open-keyed instance (`elabKeyRefines`), and none is left without a source.
- **A call through a value** (8 `nokey-value`, 5 programs), and three solved hole parameters the
  checker leaves open (D15331). These are aligned, not a gap: a closed-typed callee needs no
  instance key; its checked type is the fact.
- **A generic call with no key** (22 `nokey-gen` with no source): module UFCS imports (`$m`) and
  `[]=` index operators. Unowned.

**`nokey-gen` is the unbound default alone** (2026-11-06). Of its 22 parameters on master, 20 were
a call node mono made that never pointed back at the call the elaboration keyed:
- 14 were a UFCS member call that `monoPinMemberCall` lowers to a direct call. The lowered call now
  reads the member call's bind row (`monoNoteCallTpl`).
- 6 were a free `"[]="` operator's dispatch call, which records its assignment through `drwOpCall`
  since #6522.

Instance shadow: `nokey-gen` 22 → 2, 0 new REAL. Fixpoint seeds over 19,318 programs
(`tests/cases` and the distilled corpus, `std/idtable-*` among them): 0 bytes move.

Mono declines 1,969 calls (573 programs). For 662 of their parameters (183 programs) the
elaboration closes the type anyway (`eo:yes`). Those are the decline set, and the switch keeps them
declining.

**The ladder already reads the elaboration first** (2026-11-06, master `96d805081`). A coverage
probe over `monoInstantiateCallIn`'s rungs labelled each of 37,711 pins in 8,682 programs with the
rung that produced it. The heavy rungs are reads of the elaboration, spelled as mono keys the
answer:

| rung | pins |
|---|---|
| `monoElabPin` of the walk-top answer | 10,346 |
| `monoPinOfClosedTy` | 1,816 |
| `monoRecordRowPin` | 1,251 |
| the tagged set | 2,077 |
| the bundle rungs | about 300 |
| the annotation and composite pushes | about 18,000 |

Every rung has hits, so deleting rungs at zero hits deletes nothing. The mono-derived rungs
(`monoArgPinName`'s rep cascade, `monoPinnedListElemPin`, `monoHoleGenFnPin`, and the first-use
type-parameter binding behind the bare and composite pushes) fire only for parameters the order
above leaves unanswered. The alignment is done, and what is left is that fallback tail.

The tail is closed by four things:
- function-value identity in the type (`Fn#d`, D15298), for the generic function values fixed
  past the call (42 after D15490, in the four groups above that are not defaults);
- an elaboration-owned default for an unbound type parameter (72);
- the 16 calls in cloned bodies and through values, the cloned-body ones closed by #6515 and the
  value calls aligned as above;
- anything a wider population finds.

Widened to every call `monoInstantiateCallIn` instances, not only `monoWalkIdentCall`'s, the
shadow adds 31 calls: 26 agree, and one is a call through a value. No new class appears. The
consolidation of the spelling rungs into one function is a pure refactor, graded by a
byte-identical seed and corpus. It ends the tail in a loud refusal, "no elaboration answer for this
parameter's instance (§3.4 fallback)", which no corpus program reaches.

**Three more of the queue, graded** (2026-11-06, the 23,456-program population):

- `monoPinNoteReturns` reads `elabValueReturnsFrom`, the climb's RET/TAIL edges (#6489).
- `monoCloPinAnnNodeOfExpr`, the closed function type of a forwarder's read that its own recorded
  type does not carry, reads `elabNodeTyAt` at the instance. Of the reads it answered, 81 agree
  (79 at a parameter annotation, 2 at a `let`). Neither side answers alone, and 18,367 reads have
  no answer on either side. The annotation walk is deleted.
- `monoCloneGenericCallArm` (D12702) is closed as node mechanics, not switched. At each identifier
  callee the earlier arms leave to it:

| `monoCalleeElems` fires | callee type | per-instance type | site-hits | files |
|---|---|---|---|---|
| yes | open | moves | 13 | 7 |
| yes | open | same | 193 | 94 |
| yes | closed | same | 2 | 1 |
| no | open | moves | 2,971 | 811 |
| no | closed | moves | 316 | 157 |
| no | open | same | 463 | 126 |
| no | closed | same | 13,929 | 3,906 |

  No typed condition reproduces the arm. "The type moves" holds at 3,287 site-hits the arm declines,
  and the arm copies 195 callees whose type does not move. The arm copies a callee node read out of
  a list literal, a `for` variable or an `if`. The callee's per-instance type is already the
  elaboration's (`monoHoleNodeTy`), and no elaboration fact owns the choice to copy the node.
