# VL compiler: architectural assessment and decided target

Measured at origin/master 76a3eb8fd (2026-10-25), read and measure only. The witness programs and census
tables it cites were scratch files and are not kept; re-run a witness from the text before quoting it.


## Status (2026-11-11 late evening, master `1d517770`)

Each step is graded by whether its **Deletes** list below is still in `compiler/`, and §3.4's front by
the evening census ([notes](refactor-notes/2026-11-07-exit-census-evening.md)). The orchestrator updates
this section from each PR's report; a PR does not edit it (it conflicted on nearly every merge). Dated measurements live in [`refactor-notes/`](refactor-notes/README.md).

| Step | State | What is left |
|---|---|---|
| 1. Per-instance node types | done | Nothing: `nodeTyInDerived`'s rungs and the `monoOrigNode` scan are gone (landed with 2–3 as one mechanism). |
| 2. The checker owns the instance set | done; what mono still decides is rep, which is step 7's | Mono decides no type the elaboration answers. The closing census (#6945, [notes](refactor-notes/2026-11-09-step2-spelled-builds.md)): the 14 lambdas pushed onto a list from another function are keyed under each encloser instance (D15580) and the union-typed lambda by its member signature (D15581), so `spelled` builds are 40 → 25 and all 25 are REP (17 built-container twins, 6 wider rows, `z`, the bundle); body retyping has no narrowed read left; 14 instance no-answers and 6 late demands stand, each named. Open inventory rows that touch it are step 4's (D15582). History: 16 blocked and 8 parked `emit_mono` decision functions, below; `recordedParamPinName` and 178 `mono*Pin*` functions stand. |
| 3. Singleton function types | done | Nothing. fn_split and the `genFnHole*` family are gone; a hole function is a singleton type. [history](refactor-notes/status-history.md) |
| 4. Finite function sets | deletions done | fn_split.vl, fn_flow_shadow.vl, the FS loop, `holeChoice*` and the list and capture pinners are gone, and the flow table is retired (§3.3). Open function-value rows: D15658 (clause 1: a list join of a generic named function and an annotated one, handed to a hole callee, traps), D15639, D15649, D15651, D15657. Closed most recently: D15640 (ruled: a named function in a record field is a set id), D15642, D15646 (#7109), D15652–D15656 (#7121, #7120, #7126, #7129, #7133), D15643 and D15337 (#7136). [history](refactor-notes/status-history.md) |
| 5. Contextual type and coercion records | done, apart from step 2's classes | ExpCtx and the lowering-time coercion guesses are gone; step 5's records are written. What stands is named: 48 deliveries and the 474 hole-function-set arms are step 2's, and 12 are site-owned (`??` integer defaults, hex widths, literal trees) ([notes](refactor-notes/2026-11-07-lowercoerce-scope.md)). [history](refactor-notes/status-history.md) |
| 6. Narrowing produced once | done | `emit_narrow_slots.vl`, `pushNarrow*` and `capNarrowBuild` are gone. `criWalkBlock` replays no narrowing; it is `computeRetInference`'s return walk and goes with it in step 7. Ten of the sixteen `synth*Ann*` functions are gone (eight write-backs and two of their helpers), with three passes. `synthNullHoleAnn` is deleted and `synthNulListRetAnns` is down to the two pins `fRetKind` reads (#6758, [notes](refactor-notes/2026-11-08-step6-parked-write-backs.md)). `synthParamAnnots` is deleted: its readers take the parameter's recorded type (#6773, [notes](refactor-notes/2026-11-08-step6-synth-param-annots.md)). `synthRetAnnots` is deleted: `fnRecordedRetTy` reads a lambda's literal-union row (#6774, #6784, #6804); `synthRecordedRetAnnots` and `synthAnnOfTy` are deleted, and an instance lambda's union result boxes at its recorded type (#6828, [notes](refactor-notes/2026-11-08-step67-buildfnmap-cascade-and-pin.md)); `synthNulListRetAnns` is deleted, so no `synth*Ann*` function remains; its readers take the recorded result's kind and slot, and the union registration stays as `registerRetJoinUnions`, which writes no annotation (#6837, [notes](refactor-notes/2026-11-08-step6-nul-list-ret-pin-deleted.md)). |
| 7. `repOf(ty)`, one row per type | in progress | **Done:** collectA's rows, `preIndexMintTrees`, `heldRepMintUnder`, `computeRetInference`, `computeVoidFns`, `buildFnMap#2`, the name family and the twin-row helpers are gone; every row kind mints at its first read; the classifier half reads 0 probed; the union registry's cut order steps 1–5a are in; the map-value bank mints by type, stores a rep record and has no name producer (#7144, #7157, #7201); the ref-list, read-rep, value-atom and list-fit codecs and `listRepOfMf`, `njVKind` and `listFitStoodKind` are deleted, and `MfKind` is retired for `ListKind` (#7163, #7164, #7216); the rep tree's kind covers every type the flat arms do (#7196); VKind's arena, rendered-name and syntax ladders and `annSig*` are gone. The closing census re-run ([notes](refactor-notes/2026-11-11-step7-closing-census-2.md), master `505f30b3`) grades each item. **Rulings:** `njKindOfExpr` and `repOfNode` are BY DESIGN, typed reads named for their input (w308's grading, #7223); `buildFnMap`'s name→position index is BY DESIGN, it is not a type fact; `retVoidAnnFlag`, `retValueExitCount` and `retMapInFlight` are BY DESIGN per the retkind note ([notes](refactor-notes/2026-11-10-step7-retkind-family.md)); D12465's "65 cells" is withdrawn as unsourced. **Left:** the L2 deviation's renders and parses, 37 / 60 (`render-parse-budget-baseline.json`), and rows still minted under a name: mono's (w317), the D6 interner and `emit_base`'s `nameIs*` (w310), the union key `canonUnionKeyOfName` and registry items 5b–6 (w316), the ref-list row keys (w311); the slot layer's 15 name-keyed producers, struct first (10: w319, w307), ref-list 4 (w311), variant 1; VKind's producers outside the descriptor and the descriptor's single derivation (w308, w314, w309); `buildFnMap`'s annotated row (`retStructRowIndex`), no lane named; the rep classifiers that read a NAME (60) or a SPELLING (11), routed by bank. [history](refactor-notes/status-history.md) |

**§3.4, the evening census of 2026-11-07** (master `3401b65f2`): the 165 `emit_mono` functions the morning
census left.

| family | listed | switched | (c) | blocked | parked | deleted |
|---|---|---|---|---|---|---|
| unbound default | 9 | 5 | 1 | 0 | 2 | 1 |
| slot held fns | 23 | 8 | 10 | 0 | 4 | 1 |
| slot deliveries | 6 | 6 | 0 | 0 | 0 | 0 |
| node type | 25 | 7 | 5 | 7 | 1 | 5 |
| slot type | 24 | 14 | 4 | 0 | 2 | 4 |
| lambda sigs | 7 | 4 | 2 | 1 | 0 | 0 |
| instance binding | 31 | 7 | 11 | 0 | 3 | 10 |
| value returns | 5 | 1 | 4 | 0 | 0 | 0 |
| instance result | 1 | 1 | 0 | 0 | 0 | 0 |
| walk type | 19 | 8 | 11 | 0 | 0 | 0 |
| call param | 13 | 3 | 1 | 8 | 0 | 1 |
| uncalled slot | 2 | 0 | 2 | 0 | 0 | 0 |
| **all** | **165** | **64** | **51** | **16** | **12** | **22** |

None is unassessed. Since the census, #6689 switched `monoDefaultTyParamsOnlyGenFns` (unbound default,
parked → switched), and #6684 deleted `monoClosedFieldValTy` and parked `monoPinReturnedObj` (node type,
both from blocked), so master reads 65 switched, 51 (c), 14 blocked, 12 parked and 23 deleted. Lane F's
map-value facts then deleted `monoFlowMapReadVals`, moved `monoFlowAliasMaps` to (c) and blocked
`monoReachSlotTy` and `monoReachLitTys` on the per-call slot type: 65 switched, 52 (c), 16 blocked,
8 parked and 24 deleted ([notes](refactor-notes/2026-11-07-lane-f-map-values.md)).

**Blocked at the census (16; 16 on master), each on a named fact:**
- node type: `monoArgClosedTyIn` reads the converting delivery and the identity type (#6731, #6737); the pin stays as a
  named fallback for 124 decisions whose identity is not closed,
  `monoCoerceListCbArg` (narrowed by #6719: 20 decisions in 8 programs need element instances for tagged
  hole-function sets and generic choices, D9761),
  and the function-holding four: `monoPinReturnedObj`, `monoCloseRetFnTy` and `monoRetFnListTy` read
  `elabHeldValTy` (#6711) and `monoClosedObjLitTy` is deleted; every guard is gone: the list closed only by its identity
  type runs (#6753, #6756), and D15296 is fixed by keeping the function sets in the held type (#6765,
  [notes](refactor-notes/2026-11-08-held-type-keeps-fn-sets.md)); `monoRetFnListTy` leaves a list to mono only where `elabHeldValTy` declines (D4515),
  and `monoPinReturnedObj` reads the held type at generic instances too (#6777, D15297, [notes](refactor-notes/2026-11-08-returned-record-held-type.md)). The record-field guard is gone: a returned record's function
  fields take their slot's identity type (#6743, [notes](refactor-notes/2026-11-07-slot-field-read-identity-type.md))
  ([notes](refactor-notes/2026-11-07-heldval-consumers.md));
- lambda sigs: `monoLamParamPinAnn` reads the lambda's own instances where the binding pins (215 of 261, #6732); it stays
  for 46 tagged-set index pins and for parameters the binding leaves open (D14501's holder fact is not reached);
- call param: `monoBindSeededTyParams` (identity typing for function values, A), `monoArgPinTyIx` (a
  pin fact of its own after holes-close), `monoArgPinName` (the rep cascade), and `monoArgTyName`,
  `monoArgTyNameCascade`, `monoArgTyNameBound`, `monoArgTyNameProjected` and `monoArgTyNameRep`
  (split-dep's one-producer redesign; the kept arms wait on the naming rule). No decision reads an
  instance pin's spelling any more (naming-rule slice 2a: `monoPinIsFnSig` deleted, `isNumRecvBaseName`
  reads the pin type). Slice 2b names an un-annotated parameter's pin by `monoPinSpellOf` when it
  holds no record, map or non-literal union; the pin-type column reaches every `monoInstanceFor` caller (#6740), no pin parse is left outside the
  argument ladder (#6749), and the ladder hands back types through a type-level `monoAnnPinTy`, so
  emit_mono.vl calls `nameToTy` nowhere (#6762, [notes](refactor-notes/2026-11-08-pin-step4-types.md)). `monoSynthPinRef` types a pin by its closed type and `monoPinTyParamComposite` derives its pin from its type (#6786, [notes](refactor-notes/2026-11-08-naming-pin-producer.md)). `monoPinnedTyParamCanon` reads the annotation's type (#6772,
  [notes](refactor-notes/2026-11-08-naming-last-readers.md)). Closed pins spell their text from the type, ties go to declaration order, and `canonEmitNameOfTy` asks the type (#6798, [notes](refactor-notes/2026-11-08-naming-pin-readers.md)); two checker round trips read the spelling tree (#6806, [notes](refactor-notes/2026-11-08-naming-slice4-readers.md)). Left: the emit-side name readers (open pins 112, body rewrite 40 + 18) wait on the instance's typed column, and three check_program canonical-name re-parses;
- per-call slot type: done. `monoReachSlotTy`, `monoReachLitTys` and their helpers are deleted; the elaboration
  records the callee types a literal slot's climb reaches (`elabLitSlotClimbCalls` #6712, `elabLitSlotCallees` #6725,
  [notes](refactor-notes/2026-11-07-slot-climb-callee-types.md)).

**Parked at the census (12; 8 on master), each on a named question:**
- `monoElabStubArgsPrime`: deleted (#6718). The elaboration owns the uncalled-argument stub (`elabStubArgsPrime`,
  D15494, [notes](refactor-notes/2026-11-07-elab-stub-args.md));
- `monoDefaultTyParamsOnlyGenFns`: switched by #6689 after the census;
- `monoWalkIdentCall` and `monoHoleBinding`: every callback decision reads the elaboration (#6752); they stand
  for the instances that are not callback-specialized, which the call key does not bind yet;
- `monoCellCall`: mono's `call_ref` policy and the capture rewrite's per-instance cell signature (#6676);
- `monoInitHeldTy`: a named hole function stored in a map has no member-instance key;
- `monoPinTyParamComposite`: the naming rule, ruled 2026-11-07 (internal; [notes](refactor-notes/2026-11-07-pin-spelling-shadow.md)),
  waits on the pin-type column;
- `monoPinnedTyParamCanon`: the canonical instance key settling names, which the naming rule now settles
  (the name derives from the canonical type); waits on the pin-type column.

---

---

## 0. Target architecture

**One rule.** Each fact about the program has one producer, computed once, at the phase that has the
information. A later phase only reads it. The emitter is a translator from an elaborated, typed,
per-instance program to wasm. It does not decide a type, a rep, an instance, a narrowing or a coercion.

| Phase | Owns (computes once) | Hands on |
|---|---|---|
| **Parse + resolve** | AST arena; for every identifier, the declaration it binds to (`identDeclIx`). | arena, `declOf(ident)`. No later phase resolves a name by string. |
| **Check = infer + elaborate** | (1) Generic signatures. A hole is an inferred type parameter, as DECISIONS.md:6033 and spec T9.1 already say. (2) **The instance set**, as a demand-driven worklist from the roots (main, exports, tests) over keys `(decl, closed type args)`. Each instance body is checked under its substitution. (3) **Per-(instance, node) type**, including narrowed types at each read. (4) **Function-value identity in the type** (§2): a reference to a declaration or lambda has a singleton function type; a join of several is a finite function set. (5) **Contextual type** of every literal and expression, at every delivery position. (6) **Coercion records** `(inst, node) → (from, to)`, written wherever assignability adapts a value, which is every delivery position, because assignability is the one checker routine every position calls. (7) The (b)-class desugars (loop value, capture box, dispatch, nul-scalar split), done on the elaborated form. | `instances[]`; `ty(inst, node)`; `callTarget(inst, call) → inst`; `coerce(inst, node)`; `narrowAt(inst, read)`. |
| **Rep** | `repOf(ty)`: one compositional function of an interned type, memoised by type id. One row per canonical structural type (ruling D3870 C). Nullable, list, element and union recurse. | `repOf`, `rowOf(ty)`. |
| **Emit** | Lowering only. Each node is lowered from `repOf(ty(inst,node))`. Coercions go through one `lowerCoerce(srcRep, dstRep)` table. Calls go to `callTarget`. | wasm |
| **Opt** (`opt_*`) | unchanged | |

**Facts that today have two or more producers, and become one:**

| Fact | Producers today | Producer in the target |
|---|---|---|
| type of a node inside an instance | checker (generic only), then the emitter's substitution ladder | checker, per instance |
| which instances exist and what each pins | mono's pin ladders, the flow table, fn_split's string keys | checker worklist |
| type a function value is called at | checker bind rows, the flow table, fn_split | the value's type (singleton or set) |
| narrowed type at a read | checker, emitter ledger, criWalkBlock | checker |
| return kind of a function | checker `fnRet`, computeRetInference, buildFnMap | checker |
| rep and row of a value | classifiers over syntax, the name family, ExpCtx | `repOf(ty)` |
| destination of a literal | ExpCtx hints, the `nodeRepTyIx` sidecar, letRefListDest* | checker contextual type |
| coercion at a delivery | about 30 per-position call sites in the emitter | checker coercion record |
| inferred annotation | checker solve, then written back as syntax and re-checked | solver state |

**No language-surface change is needed.** Singleton and set types are internal; they print as today's
function type. The rulings already given fit the design:
- D3975 (a per-call-type instance record, delivered by value) is the finite-set representation and its
  coercion to a plain slot.
- The generic-let ruling (C) is the singleton type kept by a `let`.
- D3817 makes exports roots whose open holes must be solved from the body, with ambiguity a check error.

One observable effect is the **spec's own rule** applied where the checker currently misses it. x01,
annotated `apply2<T,R>(g: (x: T) => R, x: T)` with `h(2.5); apply2(h,5)`, is refused today with
`argument 1: expected (i32) => R, got (f64) => f64`, while its un-annotated spelling w06 runs. Under T9.1
("each call is checked at its own type arguments") both run. Nothing needs an owner ruling.

---

## 1. Evidence: what the families are, and the rate they grow

Counts are of `docs/internals/inventory/D*.md` rows filed since 2026-10-01: 1,779 filed and 1,701 closed
(this includes 212 older rows). Families come from a keyword and lane classifier over each row's title,
status and Mechanism text, not from ablation. These are therefore mechanism *labels*, and §1.2 checks the
largest of them against code.

| Family | Filed | Open | What it is |
|---|---|---|---|
| A: function or hole value delivered at a position (broad) | **845** | 65 | an open function type reaches a position with no per-instance binding |
| A1 (strict subset) | 753 | 52 | |
| F: narrowing, nullable, `as`, `??` | 280 | 64 | the emitter's narrowing ledger disagrees with the checker's |
| J: containers | 96 | 13 | |
| C: legality moved to the checker (L3) | 94 | 19 | |
| G: union rep, other | 85 | 14 | |
| D: render-parse (L6) | 83 | 0 | converging (§4.3) |
| H: non-function generic instancing | 78 | 23 | instances by substitution |
| E: rep or row from the type (L2) | 69 | 9 | |
| others (B, I, K, Z) | 149 | 22 | |

**Family A is half of all rows, and it does not shrink.**
- Its A1 open count, day by day since 10-10, has been 43, 55, **61**, 55, 54, 51, 53, 48, 41, 41, 42, 48, 51,
  45, 56 and 52.
- In the 227 commits since 10-15 that closed an A1 row, 502 rows were closed and **465 new A1 rows were
  filed** (581 rows in all). The ratio is closed : A1 filed = 1.08, and it fell from 1.21 in W42 to 1.04
  in W43.
- 87% of those commits filed at least one row.

Family A sub-groups, by syntactic position:

| Sub-group | Filed |
|---|---|
| list element, push, for, map | 319 |
| generic as a value | 113 |
| called at two types | 69 |
| if or match choice | 68 |
| record field | 64 |
| capture | 57 |
| forwarded | 53 |
| nested function | 45 |
| let alias | 22 |
| returned | 9 |
| labelled block | 7 |

Each sub-group is a position, and each position has its own helpers (§1.2).

**Line growth.**
- compiler/*.vl: 250,411 lines at 20fa382fe (2026-10-11), **371,600** today, over 229 files.
- emit_mono.vl: 14,624 → **30,045** lines.
- fn_split.vl and fn_flow_shadow.vl did not exist at 20fa382fe. They are now 6,056 and 3,538 lines.
- Commits tagged L1 alone, since 10-11, net +2,312 in emit_mono, +2,586 in fn_split, +2,735 in
  fn_flow_shadow and +933 in check*.vl.

Moved: §1.1 (the witness family), §1.2 (root cause) and §1.3 (the whole-pipeline survey) are in
[refactor-notes/2026-10-25-evidence-witness-family.md](refactor-notes/2026-10-25-evidence-witness-family.md).

---

## 2. The decided design

### 2.1 Per-instance elaboration in the checker

The checker keeps its present first pass over the generic program; signatures, holes and diagnostics are
unchanged. Then it runs **elaboration**:

```
worklist := roots (main, each export, each test)            -- an export's open hole: D3817 rule
while worklist not empty:
  inst = pop                                                  -- key: (decl, interned closed type args)
  check inst's body under its substitution                    -- the existing checkNode, not a ladder
    → ty(inst, node), narrowAt, contextual type, coercion records
    each call site: resolve callee type args here → key → callTarget(inst, call)
                    unseen key → push
```

The key is interned (a type-id vector), so each instance is checked **exactly once**. The output tables are
dense per instance and replace `instNodeTys`, the bind rows, the flow contexts and fn_split's plan. `mono`
becomes "clone a body per instance" with no pin decision, or disappears in favour of the emitter lowering
`(inst, node)` directly.

### 2.2 Function-value identity in the type

A reference to a function declaration, or a lambda literal, gets an internal **singleton function type**
`Fn#d`, where `d` is the declaration or lambda node. A hole lambda's singleton is generic: it carries the
lambda's own hole parameters.
- **Calling** a `Fn#d` value instantiates `d` at the call's argument types, the same path as a direct call.
  Hence w00:
  - `run@{h=Fn#λ}` calls `apply2@{g=Fn#λ, x=f64}`, whose body calls `λ@f64`;
  - the second call reaches `apply2@{g=Fn#λ, x=i32}`, then `λ@i32`.
  - Nothing splits, nothing is planned, and nothing is refused.
- **A join** (if, match, list literal, field, assignment of a second value) gives a finite set
  `{Fn#d1, Fn#d2}`. The set's height is bounded by the number of lambda literals and declarations in the
  program. A call on a set dispatches on a small tag to the per-member instance. That is D3975's
  per-call-type instance record.
- **Delivery to a declared function type** (an annotated parameter, a field of a declared record, an extern)
  is a coercion record, `Fn#d → (A) => R`. The emitter builds the closure for `d@A` there, which is D3975's
  "delivered by value". An ordinary call on a singleton is a **direct call**, faster than the closure call it
  replaces, which meets D3975's condition that ordinary calls must not slow down.
- **Printing, diagnostics and assignability** erase `Fn#d` to its structural function type. Users see what
  they see today. This is internal, as in Rust's per-closure types or MLton's defunctionalisation.

Every position in family A's sub-group table (list, push, for, if, match, field, capture, forward, nested,
alias, return, labelled block) is then **the checker typing that position as it already does**. The join
rule and the call rule are written once.

### 2.3 Why the fixpoint is cheap, and that it terminates

**Instance worklist.**
- Each key is processed once. Work is the sum of instance body sizes, which is what the emitter already
  lowers.
- The bound is the size of the instance set that mono produces today. An unbounded set (polymorphic
  recursion that grows a type) is cut by a type-size limit with a check error, the same refusal mono must
  give today.
- It replaces:
  - a full recompile per fn_split round (driver.vl:1193–1216);
  - `monoRebuild` per minted instance;
  - `bankInstanceNodeTys` walking every instance and calling a substitution ladder per node;
  - the 13-rung `monoPinHoleParam` per hole parameter per call;
  - `fsHoleKeys`, which is O(reached holes × all identifiers) with no memo (fn_split.vl:3518, the inner
    `for r in fsIdents`);
  - `genFnHoleCallInsts`, which scans all of `argCstr.at` per question (check_relate_core.vl:4078).

**Function sets through cells, returns and recursion.**
- This is a monotone union over a finite lattice. A cell's set only grows and has at most *L* members (*L*
  is the number of lambda literals and declarations), so each cell changes at most *L* times.
- With a dependency worklist the total is O(edges × L) in the worst case. In practice the sets are
  singletons, which change once.
- No ladder is re-asked per question, because the answer is a table entry.

**The checker's own re-check rounds** (check_pins.vl) are not made worse. §3, step 6 lowers them.

### 2.4 Inference-first, and the same machinery for both spellings

- No step requires an annotation.
- An annotated and an un-annotated spelling reach the same `ty(inst,node)`, through the same
  instantiation, and so the same `repOf`. Today x01 (annotated) is refused while w06 (un-annotated) runs. In
  the target both run, because the annotation is just a constraint on the same worklist key.
- A literal's contextual type is computed the same way whether the destination is annotated or inferred
  (rulings B′+C). That is what deletes ExpCtx, rather than requiring annotations to replace it.

**A type parameter several set arguments bind is bound to their joined set.** When one type
parameter annotates several parameters and a call hands each a function set (`one<F>(a: F, c: F)`
called `one(id, dup)`), the elaboration binds that type parameter, for that call's instance, to the
union of the sets the arguments carry (`{id, dup}`), not to the first argument's set. An argument
is then delivered as the id it already holds: an id is its member's declaration (`ftScan`'s ids,
which `emitFnTagDispatch` compares against each member's declaration), so a member's id is the same
in every set holding it and the delivery converts nothing. The one fact is the union
(`fnTagSharedJoinSet`, check_elab_cap.vl), read three times: the elaboration binds the type
parameter to it at the call before tagging as well as after (`elabSetArgBind`), so the instance's
facts are keyed at the union; the tag decision asks the parameter at the union and decides each
argument's set with it (`ftSubNeed`); and mono pins the parameter at it, with no rule of its own.
Built 2026-11-05 (D15409). The four annotated-parameter gates it generalises are folded into
two predicates, byte-identical over the corpus: `fnTagOwnTyParamJoins` (a lone parameter takes
any argument; a shared one takes the joined set) and `ftOwnTyParamJoins`, which adds a result
naming the type parameter bare, still limited to one named function. Widening that result case to
a union is a capability, not a fold, and is D15461.

### 2.5 Alternatives rejected

| Alternative | Why rejected |
|---|---|
| **0-CFA flow table beside the checker** (fn-value-flow-design §(e), fn_flow_shadow.vl) | It was built and has been migrating since #3542. Its result is a *third* producer of the call-type fact, with contexts approximating instances, capped at 64 (fn_flow_shadow.vl:1574–1625). §(h)'s single store was never built, and A1's open count did not fall while it grew to 3,538 lines. A flow analysis computed apart from type checking has to be reconciled with the types, and the reconciliation is the ladder. Putting identity *in* the type makes the checker's ordinary typing the flow analysis. |
| **Require an annotation on a hole function handed on at two types** | Ruled out by the brief (inference-first). The evidence is also against it: the annotated spelling x01 is the one refused today. |
| **Uniform boxed closures, with no specialisation of hole lambdas** | A lambda called at i32 and f64 would need a boxed calling convention for every value it touches. That costs every program, against the performance-first constraint and D3975's "ordinary calls must not slow down". |
| **Keep fn_split's source rewrite and fix its keys** | Each round is a whole-pipeline recompile, its keys are rendered type text (an L6 render-parse producer, §4.1 of ARCHITECTURE), and it runs only after emit fails. It is a repair loop, not a phase. |
| **Expose rank-2 or first-class polymorphic types to users** | A language-surface change, and unnecessary: singleton types give the same programs without new syntax. |
| **Continue per-shape L1 fixes** | Measured in §1: 1.04 new A1 rows per close in W43, with the open count flat at 41–61. |

### 2.6 Risks, named

| Risk | Mitigation |
|---|---|
| Union box tags are positional by member set ([[vl-union-member-set-abi]]); one row per canonical type must not dedupe a member list | Canonicalise *records*, not union member sequences |
| Instances' code size: per-instance checking can mint instances mono today merges by accident | Graded per step by seed bytes and diderven build bytes |
| Diagnostics are reported once on the generic program, not per instance | The first pass stays the diagnostic pass; elaboration reports only instance-only errors (polymorphic-recursion limit, D3817 ambiguity) |
| Check fuel rises because elaboration moves work from emit to check | It is the same work, moved and done once. Graded per step on diderven `vl check` and `vl build` together |

---

## 3. Migration, ordered

Every step uses the same proofs, run on a quiet box:
- **difftree** over the 16.6k-file population: byte-identical except the files listed as intended movers;
- **`regress.vl`**: 0 `runs → not-runs`;
- **L2 self-compile fuel**, read off three runs because of ±0.25% noise ([[vl-l2-fuel-noise]]);
- **diderven `vl check` and `vl build` fuel**;
- **`plumb-shape-cost --check`**.

A step lands when it loses no `runs` and is a sound move toward the target (owner, 2026-10-26: line
count is not a bar). Lines, seed bytes and fuel are reported side effects, not landing criteria; the CI
gates (seed +3%, plumb-shape cost, scaling shape) still apply. Each step names what it deletes, and a
step may land in slices, each with its own proof.

**Step 1. The checker banks per-instance node types; the emitter's substitution ladder goes.**
- **Change:** the checker re-checks each body in mono's existing instance list (`monoInstFe`) under that
  instance's substitution, with the existing `checkNode`, into `instNodeTys`.
- **Invariant:** `nodeTyInOf(ix, inst)` is a table read for every node with a type variable.
- **Deletes:** `nodeTyInDerived`'s rungs (`apartJoinPinTyOf`, `holeOperandTyOf`, `holeCompositeTyOf`,
  `exactDerivedPinTyOf`) and the `monoOrigNode` scan (emit_ty_canon.vl:1488–1510), plus the rung helpers no
  one else calls.
- **Movers:** the files where checked and derived types disagree are bugs. Count and grade them as L2
  counts its trials.
- **Closes:** the L1 §7 deviation "78 of 834 reads still see type params inside an instance"; candidates are
  D13200, D13260, D13261 and D13280–D13282 (re-run before claiming).
- **Scoreboard:** lines ↓, check fuel ↑ a little, build fuel ↓.

**Step 2. The checker owns the instance set; mono stops deciding pins.**
- **Change:** the elaboration worklist of §2.1 produces instances and `callTarget`. Mono clones per instance.
- **Invariant:** every instance key is closed, and is minted once.
- **Deletes:** `monoPinHoleParam`'s ladder and its 13 rungs, `recordedParamPinName`, the `mono*Pin*`
  functions with no other caller (226 are Pin-named today), `monoRebuild`, `monoRetSettle`, and H-family
  substitution helpers (`monoBindArenaWalk`, `monoPinTyParamComposite`).
- **Closes:** family H (23 open), and the direct-plus-forward cells.
- **Scoreboard:** emit_mono ↓ heavily, L2 ↓, build fuel ↓.

**Step 3. Singleton function types (§2.2, singletons only).**
- **Invariant:** a function-valued expression whose value is one declaration or lambda has type `Fn#d`, and
  calling it instantiates `d`.
- **Deletes:** fn_split's forward machinery (`fsHoleFwd`, `fsHoleKeys`, `fsElemFwdKeys`, the
  `fsAsk` sites in emit_mono and wasmEmit), `holeFnSplit` and its rows, the `genFnHole*` family
  (check_relate_core.vl:3977–4193), and `judgeFnArgHoleCalls`'s split arm (check_calls.vl:2391).
- **Closes:** the w00 family (11 witnesses above), D13860, the "called at two types" (5 open), "forwarded"
  (5), "nested function" (4) and "generic as a value" (7) sub-groups, and x01's check refusal.
- **Scoreboard:** fn_split ↓, check_relate_core ↓.

**Step 4. Finite function sets (joins) and their record (D3975).**
- **Invariant:** a join of function values has a set type, a call on a set dispatches by tag, and a delivery
  to a declared function type is a coercion record.
- **Deletes:** the rest of fn_split.vl (6,056 lines), the driver's FS_PLAN/FS_APPLY loop
  (driver.vl:1193–1216), fn_flow_shadow.vl (3,538 lines), the `holeChoice*` family (76a3eb8fd, f86f37d6f)
  and the list, if and capture pinners (`monoOpenFnListPin`, `monoCapturedLetFnPin`, ...). `monoIfArmsPinJoin`
  is a value join and goes with step 5. The driver loop, the rest of fn_split and fn_flow_shadow are deleted
  jointly with increment 3: step 4 retires the join half (113 of 235 FS programs), increment 3 the forward
  half (122, per-instance `Fn#d`), and whichever lands second deletes the loop.
- **Closes:** the remaining family A sub-groups (list 22 open, if/match 10, capture 9), plus D13783 and
  D12233 ("alias chain over 64": no chain once the value is a type).
- **Scoreboard:** lines ↓ by the most of any step, and the whole-pipeline recompiles go.

**Step 5. Contextual type and coercion records; ExpCtx and the per-position widen calls go.**
- **Change:** generalise `recordRepTyAdopt` from 6 sites to the assignability routine, so every delivery
  position writes `ctxTy(inst,node)` and a coercion record. The emitter reads `repOf(ctxTy)` and calls one
  `lowerCoerce`.
- **Land one field group per PR**, each deleting its fields and every write of them:

  | Sub-step | Fields |
  |---|---|
  | 5a | structIdx, variantIdx |
  | 5b | listKind, listSlot, mapSlot |
  | 5c | the seven `nul*` fields and litUnion |
  | 5d | the widths |

- **Deletes:** 16 ExpCtx fields, the Take helpers, `expCtxSeedValueArg`, the 83 resets, `letRefListDestSlot`
  and `letRefListDestSlotK` (with their whole-`P.nodes` fallback), and the per-position `emit*WidenSite`
  call sites.
- **Closes:** family B, and the ExpCtx-leak rows (the 38 cited ids are the reference set).
- **Scoreboard:** wasmEmit ↓, seed ↓, build fuel ↓.

**Step 6. Narrowing produced once; the checker's write-back rounds shrink.**
- **Change:** the elaborated read carries its narrowed type and rep change.
- **Deletes:** the emitter's narrowing in emit_narrow_slots.vl (gone; what remained was local-slot bookkeeping, renamed `emit_local_slots.vl`), the `pushNarrow*` and restore family, `capNarrowBuild` (both rows) and
  `criWalkBlock`'s replay. Write-back `synth*Ann*` passes whose fact the elaboration now holds go too.
- **Closes:** family F's ledger-disagreement rows. Graded by ablation on 2026-11-01 (`family-f-ablation-2026-11.md`): of 86 keyword rows, 57 are clause 1 and fall into ten mechanisms, and only family B, 4 rows (a narrowing that survives a write through an alias: D4084, D4131, D4133, D4134), is the narrowing ledger. The other nine families are routed to the rep, container, generic-instance, `??`, cast and init-order work.
- **Scoreboard:** check fuel ↓ (fewer re-check rounds), lines ↓.

**Step 7. `repOf(ty)` and one row per canonical type (the L2 end state).**
- **Invariant:** ARCHITECTURE §3.4, literally.
- **Deletes:**
  - `computeRetInference`, `buildFnMap` and `computeVoidFns`, and their #2 rows;
  - collectA, both rows;
  - the name family (`rlSlotByNameTwin` and `letInitDeliversRow`);
  - the twin-row helpers;
  - the syntax side of the 56 twins;
  - the type-blind classifiers in emit_classify: 116 functions, 3,180 lines by the 2026-11-02 census
    ([type-blind-classifier-census-2026-11.md](type-blind-classifier-census-2026-11.md)); the earlier
    199 / 7,762 was a different cut.
- **Absorbs:** the rep-descriptor campaign (`rep-descriptor-campaign.md`), the `vtKindOfType`
  annotation ladder, the return-kind family and the slot layer.
- VKind becomes derived from the rep descriptor.
- **Closes:** family E (9 open), the same-shape rows (D12465's 65 cells among them), and the L2 §7 deviation.
- **Scoreboard:** emit_classify ↓, seed ↓.

Steps 1, 2, 3 and 4 are strictly ordered (1–3 land as one, §3.1, [notes](refactor-notes/2026-10-25-first-landings-findings.md)). Step 5 starts with 5.0, and step 7 needs steps 4 and 5.
Moving the elaboration into check, with an error channel, is a later step (§3.1, [notes](refactor-notes/2026-10-25-first-landings-findings.md)). L6's remainder falls to steps 2–7 (§4.3).

### 3.1 Findings and decisions from the first landings, 2026-10-25

Moved to [refactor-notes/2026-10-25-first-landings-findings.md](refactor-notes/2026-10-25-first-landings-findings.md).

### 3.2 What stands between master and deleting the split plan (re-census, 2026-11-02)

Moved to [refactor-notes/2026-11-02-split-plan-recensus.md](refactor-notes/2026-11-02-split-plan-recensus.md).

### 3.3 Retiring the flow table, reader by reader (proposal, 2026-11-05)

Moved to [refactor-notes/2026-11-05-flow-table-retirement.md](refactor-notes/2026-11-05-flow-table-retirement.md).

### 3.4 emit_mono's decision arms, measured (2026-11-05)

Moved, one file per part, in the order the section held them; the live summary is the status section above:
- [emit_mono's decision arms: the coverage probe and the queue](refactor-notes/2026-11-05-emit-mono-decision-arms.md)
- [Shadows of the queue, the fallback sources and bucket 1](refactor-notes/2026-11-06-emit-mono-queue-shadows.md)
- [Exit checklist, re-census of 2026-11-07 (morning)](refactor-notes/2026-11-07-exit-census-morning.md)
- [Exit checklist, re-census of 2026-11-07 (evening)](refactor-notes/2026-11-07-exit-census-evening.md)
- [Slot type's 15 unassessed, and the written-let gate and type](refactor-notes/2026-11-07-slot-type-unassessed-and-written-let.md)
- [Exit checklist: the pin helpers, census of 2026-11-06](refactor-notes/2026-11-06-exit-checklist-pin-helpers.md)
- [The unbound default, the open design questions, and the function-holding fact](refactor-notes/2026-11-07-unbound-default-and-function-holding.md)
- [Slot type, instance binding and slot deliveries](refactor-notes/2026-11-07-slot-type-and-instance-binding.md)
- [Node type, instance result, walk type and value returns](refactor-notes/2026-11-07-node-walk-value-returns.md)
- [The elaboration readers' contracts](refactor-notes/2026-11-07-elaboration-reader-contracts.md)
- [Slot type: `monoReachSlotTy`, parked and pruned](refactor-notes/2026-11-06-slot-type-reach-parked.md)
- [Value returns, the uncalled-slot gates, and the `monoFlow*` read rewrite (B1, B2)](refactor-notes/2026-11-06-monoflow-read-rewrite.md)
- [Mono's standing hazard, the parked hub, and B2's named bar](refactor-notes/2026-11-07-mono-hazards-and-parked.md)
- [Next stage, first item: a per-call delivered-rep fact](refactor-notes/2026-11-06-per-call-delivered-rep.md)
- [The canonical instance key, measured](refactor-notes/2026-11-05-canonical-instance-key.md)
- [Instance identity for a non-function argument, measured](refactor-notes/2026-11-07-instance-identity-non-function-arg.md)
- [The argument pin's arms, measured](refactor-notes/2026-11-07-argument-pin-arms.md)
- [A function list's hole binding](refactor-notes/2026-11-07-function-list-hole-binding.md)
- [A function-holding let's slot fact, from its calls](refactor-notes/2026-11-07-function-let-slot-fact.md)
- [Record literals closed from the bindings they read](refactor-notes/2026-11-07-record-literals-closed-from-bindings.md)
- [Argument-keyed instances: design note](refactor-notes/2026-11-07-argument-keyed-instances-design.md)
- [The call half and the value half](refactor-notes/2026-11-06-call-half-and-value-half.md)

## 4. Scoreboard

The scoreboard reports side effects of the migration; it is not a landing criterion (§3).

One row is now held: the pin and position layer, row (a) of the special-case helpers, may only fall. It grew from 1,516 functions (76a3eb8fd, 2026-10-25) to 1,571 (f2599d8e5, 2026-11-04) while the elaboration that replaces it was built beside it, because no gate graded it. `tests/budget_pin_helper_test.ts` holds each of the three files at or below `scripts/pin-helper-budget-baseline.json`. A PR that retires helpers lowers the baseline in the same PR; a PR that needs a new one says why in its body and raises it there.

### 4.1 Baselines and readings, 2026-10-25 to 2026-11-01

Moved:
- §4.1: [Scoreboard baselines (76a3eb8fd)](refactor-notes/2026-10-25-scoreboard-baselines.md)
- §4.1a: [Scoreboard reading at cb348241](refactor-notes/2026-10-31-scoreboard-reading-cb348241.md)
- §4.1b: [Scoreboard reading at 2d9c02fc8](refactor-notes/2026-11-01-scoreboard-reading-2d9c02fc8.md)
- §4.1c: [Scoreboard reading at b9f2a457f (afternoon)](refactor-notes/2026-11-01-scoreboard-reading-b9f2a457f.md)
- §4.1d: [Where the seed's growth went, 0becd8120 → 9d1d7374](refactor-notes/2026-11-01-seed-growth.md)

### 4.2 Expected direction per step

| Step | lines | seed | L2 fuel | diderven check | diderven build | plumb | helpers (a) | (b) | (c) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | ↓ | ↓ | ↓ | ↑ small | ↓ | ↓ | ↓ | · | · |
| 2 | ↓↓ | ↓ | ↓ | ↑ small | ↓ | ↓ | ↓↓ | · | · |
| 3 | ↓↓ | ↓ | ↓ | ≈ | ↓ | ≈ | ↓↓ | · | · |
| 4 | ↓↓↓ | ↓↓ | ↓ | ≈ | ↓ | ≈ | → near 0 for fn_* | · | · |
| 5 | ↓↓ | ↓ | ↓ | ↑ small | ↓ | ↓ | · | ↓ | → 0 |
| 6 | ↓ | ↓ | ↓ | ↓ | ↓ | ↓ | · | ↓ | · |
| 7 | ↓↓ | ↓↓ | ↓ | ≈ | ↓ | ↓ | · | ↓↓ | · |

"↑ small" on check fuel means work moved from emit into check. The step's proof is that check plus build
falls on diderven.

Step 4's deletion half, measured on its prepared branch (§3.2, 2026-11-05, [notes](refactor-notes/2026-11-02-split-plan-recensus.md)): `fn_split.vl` goes
(243 functions, 6,087 lines; 8 move to `const_lets.vl`), `emit_mono.vl` falls from 1,138 to 1,135
functions, and the seed falls 2.6%.

### 4.3 L6 render-parse: done as a lane, the rest goes with the steps

The render/parse budget went 128/386 on 10-11 to 50/86 on 10-25 across 141 commits, with one same-day
revert. Its floor is measured at 20/1, D8 is complete (#4803), and it files no new family rows.

As a separate lane, L6 is done for now (2026-10-26). At 50/86, no conversion is left that deletes code
without first changing a caller in emit_collect, emit_mono, emit_classify, emit_obj_lit_fits or
emit_nullable_rets: those callers pass -1 or a name, and the shape-text walkers carry no per-field type.
The rest falls to steps 2–7, as types are threaded from the elaboration and, in step 7, registries are
keyed by type.

---

## 5. PR #4813 (L2 D1 stage 11, head 804ad4eee): do not queue as is

Moved to [refactor-notes/2026-10-25-pr-4813-do-not-queue.md](refactor-notes/2026-10-25-pr-4813-do-not-queue.md).

---

## 6. Not claimed

- **Family sizes come from a keyword classifier, not ablation.** The witness family (§1.1) and its
  mechanism (§1.2) are verified in code. The other families' mechanisms are verified by sampled code reads
  (survey §2, ten functions read).
- **`ls.vl --status open` reads 534 open rows.** My classifier counts rows such as "now a loud check reject"
  as closed, which the script does not. I used the classifier, which disagrees on 25 rows filed since 10-01.
- **The survey reports `nodeTyInDerived` as 9 rungs. I verified 4** plus the `monoOrigNode` scan at
  emit_ty_canon.vl:1488–1510. The other five named rungs are below those calls and were not verified.
- **The step directions in §4.2 are predictions.** Each step's proof measures them.
