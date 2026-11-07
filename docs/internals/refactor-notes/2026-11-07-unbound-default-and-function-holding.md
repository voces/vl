# The unbound default, the open design questions, and the function-holding fact

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**The unbound default family, closing state** (2026-11-07, master `254c6ee2`). What the
elaboration can own, it owns: the D4551 default (`ELAB_TP_DEFAULT`, `elabTpDefaulted`; #6563, #6569),
the uncalled slots (`elabUncalledSlotTy`) and a hole generic's flow instance (`elabHoleGenFlowTy`,
`ELAB_EMPTY_LIST_ELEM_DEFAULT` for D6542; #6583), with `monoBindTyParamDefault` folded away (#6580).
What stays in mono is named: `monoDefaultTyParamsOnlyGenFns`, a per-call rule at 10 sites no
elaboration fact states; `monoChoiceArmFlowTy`'s arm walk; and the frame plumbing listed below as
having a twin in the elaboration. The maps and lists whose slot is called at two signatures (D15494,
`closures/hole-fn-generic-pushed-list-spread.vl`) are no bundle: they hold uniform closure structs
and each call site reaches its own signature, so their one-signature spelling is a rep spelling the
default supplies. Both run today, and both wait on a design answer, not a lane: what the elaboration
says for an open slot called at two signatures.

**Open design question beside it: argument-keyed instances.** The elaboration keys an instance by
its closed type arguments. Mono also specializes a function per function value it is handed. The
elaboration has no key for such an instance, so it can resolve no call through that function's
parameter. This is the root of both populations the instance-choice comparison leaves to one side:
- the 1,052 mono-only calls (mono-owned callback specialization, below);
- the 2,079 elab-only calls declined under ruling (a).

Like D15494, it waits on a design answer, not a lane.

**Open design question: identity typing for concrete function values** (owner level). §2.2 gives
every function value its singleton `Fn#d`, but the checker gives one only to the values whose sets it
tracks. Argument-keyed instances are its first client: 1,500 of 1,573 specialized arguments have no
set (measured under the canonical instance key below).

**The function-holding fact, scoped** (2026-11-07, Fn#d, master `72b31030`, the full population).
The concrete rep a function-holding value takes at a site blocks four queues: node type's holders
(Fn#d's 8 and `monoLetWriteRhsTyRec`), lane F's instance bindings, `monoBindSeededTyParams`, and the
written-let call signatures with a hole-function argument (`monoCoerceWrittenLetTys`). One probe
wrapped every such mono decision and asked what the elaboration can say there today:
- the checker's closed node type (#6556);
- `elabNodeTyAt`;
- the slot fact;
- the written-value leaf;
- whether every member of the value's `Fn#d` set already has an instance at mono's signature.

| class | decisions |
|---|---|
| not blocked: the elaboration's node type, or the checker's closed type, agrees | 734 |
| (i) the slot fact answers | 40 |
| (i) the returned-literal reader answers (`elabRetFnListLitTy`) | 3 |
| (i) every member already has the instance; the site is not linked to it | 201 |
| (i) one member, several instances; the link is by the call the read reaches | 11 |
| (i) an adopted binding (`monoBindingAdoptInit`): see the family table below | 234 |
| (ii) needs identity typing | 1 |
| (iii) other | 6 |
| not reached by the probe (D6480, `hole-lambda-forwarded-to-unread-hole-param`) | 2 |

**Re-measured before mono's walk** (2026-11-07, master `7836b63a`). The table above read
`nodeTyIxOf` at mono's decision sites, after the walk had re-recorded many of those nodes closed at
mono's own answer, so its node-type column compared mono with itself. The re-run copies the
node-type column at the end of emit prep (after the elaboration's tag rounds, before
`monomorphize`) and swaps that copy in while every reader is asked, so each reader's own fallback to
`nodeTyIxOf` is pre-walk too. Only mono's held type, the answer being graded, is read after the
walk. Each decision is classed by the first source that agrees with mono, in this order:

| class | decisions |
|---|---|
| not blocked: the elaboration's or the checker's node type agrees | 621 |
| (i) the slot fact answers | 70 |
| (i) the written-value leaf answers | 27 |
| (i) the value key already noted for arguments and callbacks (`elabValueKeys`) answers | 72 |
| (i) the value-call note (`elabValueInstKey`, shadow) answers | 19 |
| (i) every member already has the instance; the site is not linked to it | 283 |
| open: a member lacks the instance | 23 |
| open: no member and no fact | 90 |
| **total** | **1,205** |

The two tables do not share a classifier, so they are compared by total only. All 234 adopted
bindings move out of "not blocked"; they are the family table below. The value-call note answers
44 decisions, 26 of which no earlier note answers, and disagrees with mono at none. Two more, in
`generics/hole-call-of-generic-at-its-own-instance.vl`, carry two signatures where mono holds one:
the value is called at two types, so the consumer picks by the call the read reaches. Of the 283
unlinked, 94 are lane F's instance bindings, mostly a record or list of functions handed to a
parameter and called as `p.f(x)` or `xs[0](x)`; the note does not yet follow a field or element
callee off an open parameter. The 90 "open: nothing", by family:
- 53 adopted bindings, in the family table below.
- 19 list callbacks. 11 are `generics/generic-fn-as-list-callback-result.vl`, 4 an `if` choice of
  functions as the callback, 3 a hole-function list's callback through a loop alias or a returned
  list, and 1 is D9020's relay, the (iii) row.
- 14 arguments: 12 in `generics/typaram-binding-seeded-in-cloned-call.vl` and 2 in
  `generic-arena-bind-map-and-alias.vl`.
- 3 returned lists, `closures/hole-fn-list-returned-inline-call.vl`.
- 1 instance binding, the (ii) row.

Most of the callbacks and arguments are nodes mono minted, so the pre-walk column has no entry
for them by construction; their fact is read through the node they copy (`nodeSrc`).

**Signature sites and identity sites** (re-graded the same day). Two corrections to the table:
- **Instance bindings are not graded in it.** Their column compared the elaboration's own
  instance parameter type with itself, so the 94 unlinked and the note's answers there say nothing
  about mono. Mono binds a function-holding type parameter at the argument's identity, one instance
  per function, and lane F grades that against the argument's identity type.
- **The table holds only signature sites.** The probe recorded a decision only where mono's held
  type is closed. The 189 where mono holds an open function type are identity sites, and are graded
  against `elabIdentityTy`, the elaboration's node type, else the checker's type as the elaboration
  left it (#6656):

  | consumer | decisions | agrees | source |
  |---|---|---|---|
  | receiver of a `.map` / `.filter` callback | 147 | 147 | elaboration 34, checker 113 |
  | record literal written to a `let` | 12 | 12 | checker |
  | seeded type parameter | 15 | 15 | checker |
  | instance binding | 3 | 3 | checker (lane F's) |
  | list callback | 8 | 0 | a signature site, below |
  | record of hole-function lists | 4 | 0 | the same spelling over different holes; no defect |

  The receiver and the record literal read `elabIdentityTy`. The seeded type parameter binds from
  mono's pin of the argument it seeds, so it waits on that argument's `elabIdentityTy` replacing the
  pin. The 8 list callbacks hold the callback's signature at a hole-function element
  (`((_) => _) => i32`), not the callback's identity, so they belong to `elabCbArgSig` and
  `elabValueInstKey` with the signature sites.

So identity typing is not the prerequisite for this population; one fact is.
- **The fact:** `elabValueInstKey(x, k)`, the member instance or instances the elaboration made for
  function-holding value `x` read under instance `k`. Its closed signature is the concrete rep.
- **Key:** the value node and the instance key it is read under.
- **Readers:** `elabWalkKeyOf(x, false, decl)` already reads the table it extends.
- **Producer:** `elabValueKeyNote`, which today notes function-value arguments and named list
  callbacks. It is written where the elaboration itself instances a member through the value: a call
  through a binding, element or field (`elabValCalls`), the callee's calls of a hole-function
  argument, a list element called. It is never written by searching for an instance whose signature
  matches mono's, which would derive the fact from mono.
- **The adopted bindings close through four sources, none of them the initialiser's checked type.**
  That type is closed only after mono's walk re-records it: at elaboration every one of the 234
  initialisers carries the binding's own open type, `(T) => T` or `((_) => _) | null`. A fourth
  `elabWrittenValueTy` leaf reading it was built and measured as a no-op (234 of 234 unchanged), and
  was not landed. Fourteen of the 234 are no adopt decision: a bundle-record initialiser under a
  binding typed `(_) => _`, which `monoSameTyCtor` refuses, so mono never adopts them. Of the other
  220, 82 already close at elaboration. The other 116, by the initialiser's shape:

  | decisions | initialiser | source that closes it | lane |
  |---|---|---|---|
  | 30 | `Map()` filled later by `.set` | deliveries into the element path (`elabSlotDeliveries(d, ["v"])`) | split-dep |
  | 24 | a list literal, mostly a captured cell `[λ]` | deliveries to the element: the calls through the cell | split-dep |
  | 10 | an `if` choice of hole functions | the binding's own slot calls | split-dep |
  | 31 | a map read, its value path open | the map-value or held fact | lane F |
  | 3 | `??` over a map read | the map-value or held fact, joined with the default | lane F |
  | 12 | a call returning a generic function value | the call-instance signature (`elabValueInstKey`) | Fn#d |
  | 6 | a record literal of generic or hole function fields | the call-instance signature per field | Fn#d |

  The deliveries row keeps two controls declining: `closures/hole-fn-if-to-hole-param.vl`'s `x`,
  handed on and never called, and the D10384 shape. A named generic held as a map value stays
  D15494's.

  **The `??` row, the cheap route, parked** (2026-11-07). Widening the map arm of `elabSlotClose`
  to fall back on the type the written values carry (`elabWrittenValueTy`) closes `v5` of
  `closures/hole-fn-list-returned-reread.vl` and leaves `m4` and `m5` open. It also closes `qa` in
  `closures/hole-fn-generic-map-handed-two-maps.vl`, a D15494 control that has to decline. The
  attempt stays on `claude/coalesce-empty-default`, unmerged.

  **The split-dep rows, measured row by row.** Of the 64:
  - **Closed, 9.**
    - #6647 closes 2. A call through a `??` or value `if` callee notes each operand's slot. The
      hole-function maps `m` and `f` in `closures/coalesce-default-hole-function-over-map-read.vl`
      then close at the call's types.
    - #6649 closes 7. A written join closes through the functions it holds (`elabBindingFnSet`): a
      labelled block's or an `if`'s value, under the unchanged hole-only and called-directly rules.
  - **Declining by rule, 6.**
    - 3 `if` choices with no call: `closures/fn-choice-bound-as-callback.vl`'s `h5`,
      `closures/hole-fn-if-to-hole-param.vl`'s `x`, and one `x` in
      `closures/hole-fn-labelled-block-loop-capture.vl`.
    - 2 uncalled capture cells: `peerPinned`'s `d2` and `hole-lambda-peer-through-cell-read.vl`'s `d1`.
    - `closures/delivered-alias-function-scope.vl`'s `localLambdas` `d`, below.
  - **D15494, 30.** A named generic held in the map (26) or list (4); listed above.
  - **Reach, 2.** The two remaining hole-function `Map()` rows close through the map
    element-write source, built inside the same fold.
  - **Fn#d, 17.**
    - 7 capture cells are also written with a named generic (D3950); the instance at the delivery
      is a call-instance signature.
    - 10 lists of hole lambdas have elements that are handed on or returned, never called on
      path `e`.
  - **No cell-path closer.** The capture rewrite runs after `elabSlotFacts`, so a captured `let` is
    closed as the function binding it is, at path `[]`.
    - `localLambdas`' `d` declines. Its two members are local hole lambdas, and one is also called
      directly at `string`.
    - Its siblings that do close answer the function type against mono's cell list
      `((i32) => i32)[]`. That is the cell-form difference already in the 22, so closing it would
      add a 23rd.
- **(ii):** `closures/listed-hole-fn-escaping-list.vl`. A generic held in a list by identity is called
  at two types, so the list's one concrete rep is mono's choice. It is D15010's signature twin, parked
  in this section.
- **(ii), deliveries:** one name read delivered at two function types, so the elaboration instances it
  at both and `elabValueInstSig` names neither. D12234 (`deliver()`'s `l` into an `i32` and a
  `string` binding) runs; `closures/error-hole-lambda-returned-into-bindings-of-two-types.vl`
  refuses with its message. Both stay on mono's path under the same question: keying them by the
  delivering site would decide it.
- **Not reached (2):** neither decision gets to a probed site.
  - D6480 refuses first, at `monoWalkIdentCall`'s `monoGenArgAtOpenParam` gate. A call through
    the alias `k` of a written `let` holding a hole lambda has no lambda for `monoAliasLetLamFe`
    to return. That gate is the hook that would see it, and it reads the same fact through the
    alias.
  - `functions/hole-lambda-forwarded-to-unread-hole-param.vl` takes the unread parameter's
    default (`holeParamUnreadIn`, D6191). No call instances the lambda, so no producer writes the
    fact, and the default stays the checker's.
- **(iii):**
  - five uncalled members, the inert-stub (c) cells `monoInertParamStubPin` carries (D6910 and its
    pair) and two uncalled list members;
  - D9020's relay of an un-annotated function's `i32` at an `f64` function type. In
    `[1, 2, 3].map(f)`, with `f` annotated `(a: i32) => f64`, the checker's type and the slot fact
    both differ from the callback signature mono derives (`monoValueRetAt`'s `(i32) => i32`). The
    program runs because the value converts at its annotated binding. The outlier is mono's own
    derivation, not a reader.

**The unbound default, measured** (2026-11-07, master `75101d46`). The D4551 default is the
elaboration's: `ELAB_TP_DEFAULT` and `elabTpDefaulted` (#6569), after its call reach was made to
see into callees before collect runs (#6563). The uncalled slots already read it
(`elabUncalledSlotTy`). Two parts stay in mono, for different reasons:

- `monoHoleGenFnFlowTy` and `monoChoiceArmFlowTy` answer a narrower question than the
  elaboration's parameter binding `elabCallParamTyFrom`: the instance a hole generic's slot delivery
  fixes. Shadowed at `monoHoleGenFnPin` over 23,103 programs, 38 agree, 0 differ and 2 answer where
  the elaboration has none, but at 1,308 more pins mono leaves the type open while
  `elabCallParamTyFrom` is closed. The replacement is a fact of that narrower question, which must
  decline at all 1,308, with the D6542 empty-list `i32` a named default beside `ELAB_TP_DEFAULT`.

**The flow instance is the elaboration's** (2026-11-07). `elabHoleGenFlowTy` and
`elabHoleGenFlowHolder` answer it, with `ELAB_EMPTY_LIST_ELEM_DEFAULT` (D6542); `monoHoleGenFnFlowTy`,
`monoHoleGenBindLamArgs`, `monoHoleGenBindFnArgs`, `monoPinIsEmptyListHole` and `monoTyLeftOpen` are
deleted. Shadowed over 23,103 programs against mono's flow: 34 agree, 0 differ, 0 new-only at all
1,308 open pins, and 3 old-only, all in `closures/written-let-of-hole-fns-results-agree-at-hole-arg.vl`
(a re-pointed `let` of hole functions, which mono's gate reads as a generic and the elaboration's does
not), which the byte sweep shows reach no emitted code. Per read, the two gates name the same binding
at 78 reads and part at 34, none of which yields a flow type on either side but those three. Mono
counts a lambda as generic by `monoGen` of its own lambda state, which varies by frame; a
"generic lambda" rule in the elaboration turned 2 of those into new-only answers
(`generics/hole-fn-arg-through-hole-callee.vl`), so the elaboration's gate stays conservative.

Two of the 34 are mono's gate being wrong: it resolves a read by NAME, so in
`closures/param-named-like-outer-fn-generic-arg.vl` and D3910 the parameter `f` of `b(f: i32)` reads
as the top-level generic `f<U>`. The elaboration resolves by declaration.

Plumbing with a twin in the elaboration, kept for its other callers: `monoReadLetFrame`,
`monoHoleGenFnFlowDecl` (still `monoHoleGenFnPin`'s `[frame, decl]`), `monoOpenFnArgDecl`
(`elabOpenFnArgDecl`), `monoFnDeclRetAt` (`elabFnDeclRetAt`), `monoArmTailValue`,
`monoNamesDeclaredGeneric`, `monoReadGenFnFe` (`elabAliasGenFn`) and `monoCalleeIsGeneric`. The lane
that empties their other callers deletes them. `monoChoiceArmFlowTy` stays too: its arm walk reads
mono's `monoValueNamesGenerics` and `monoArmEndsNever`, and each arm's instance is now the
elaboration's.
- `monoDefaultTyParamsOnlyGenFns` is a per-call rule (a type parameter named only by function slots
  handed generic values) that no elaboration fact states. It fires at 10 calls in 4 files; the
  call binding `elabCallBindTy` is the default at 8 and absent at 2 inside a generic body.
