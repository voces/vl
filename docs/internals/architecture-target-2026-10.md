# VL compiler: architectural assessment and decided target

Measured at origin/master 76a3eb8fd (2026-10-25), read and measure only. The witness programs and census
tables it cites were scratch files and are not kept; re-run a witness from the text before quoting it.

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

### 1.1 The witness family, reproduced (clause 2; no clause-1 case found)

Every program below passes `vl check` (rc 0, "Checked 1 file, no errors.").
- **Run (14 programs):** for example w01 `h(2.5); apply2(h,4)` prints `2.5 / 4`, and y07 forwards through
  two callees and prints `1.25 / 2`. The values are confirmed against the control c01.
- **Loud emit refusal (11 programs)**, `` `h` is called at two instances of the function handed to it in a
  call to `run` ``:
  - w00 `apply2(h,1.5); apply2(h,4)`
  - w02 a second identical callee
  - w03 two different callees
  - x02 through a lambda
  - x03 through a nested function
  - x04 `apply2([h][0],5)`
  - x05 `if b {h} else {h}`
  - x06 returned and then called
  - y03 `pass(h)(5)`
  - y05 `call0([h],5)`
  - y06 `callF({f:h},5)`

The asymmetry carries the diagnosis. **Two direct calls at two types run; the same two types reached
through any second hop refuse.** The refusal is emit_mono.vl:24078–24086 (`fsAsk(params[i])`, then
`emitFailAt(...)`). It is reached only after all 13 rungs of `monoPinHoleParam` (emit_mono.vl:24051) fail.

**The D13860 lane's claims, verified:**
- **fn_split keys a call by rendered type text.** `fsArgKey` is `tyToStr(nodeTyIxOf(a))` and `fsCallKey` is
  `"c:"+key` (fn_split.vl:569–640). Confirmed.
- **A forwarded hole never splits.** `fsHoleFwd` (fn_split.vl:3450) follows to the callee's parameter.
  `fsHoleKeys` (fn_split.vl:3518) then collects keys spelled in the *callee's own open hole types*, so w00's
  two forwards give one key and nothing splits. Confirmed.
- **The proposed fixpoint over (function, binding) instances.** That is the right object; §2.3 gives its
  cost argument.
- **The unfiled clause-1 case, "called directly and handed on at two types": NOT reproduced.**
  - The coverage: w01, w04–w08, x07, y01, y02, y04 and y08 cover every order and type pair of a direct call
    plus a forward, including i32/f64, string/i32 and boolean/i32. Each printed the correct values.
  - Two direct calls plus one forward (both2) gives the loud refusal, not a wrong value.
  - Family A does hold **11 open check-clean rows** that are filed already:
    - silently wrong: D3986, D3616
    - trap: D12212, D12216
    - invalid wasm: D12213, D10330, D10350, D4302, D4019, D3811, D3533

  The clause-1 population of this family is therefore filed. The lane's extra case does not add to it on
  this seed.

### 1.2 Root cause, from the code

1. **A hole is a type variable with one solution per declaration.** `unannotParamTy` (check_subst.vl:164–171)
   returns `solvedParamTys[holeName]` or a fresh `TyVar` named `?fn.i` (named by check_tp_join.vl:576). The
   first use banks it (check_fn_decl.vl:302–309, `solvedParamTysSetAt`), and it renders as `_`
   (check_types.vl:923). The solution is keyed by *declaration and parameter position*, never by instance.
2. **A function value's type carries no identity.**
   - `const f=(v)=>v; const a: string = f` reports `cannot assign (_) => _`.
   - An `if` choice between two different lambdas also has type `(_) => _`.

   So when a function value is handed on, the type cannot say *which* function it is. Each position must then
   recover that by following syntax, and that recovery is family A.
3. **Instances are made in the emitter, by substitution, without being checked.**
   - `monomorphize` (emit_mono.vl:29015) runs inside the emitter's 47-row pass table (emit_sections.vl:7974).
     Instance bodies share nodes with the template.
   - `bankInstanceNodeTys` (emit_ty_canon.vl:1456) gets each instance node's type afterwards from
     `nodeTyInDerived` (emit_ty_canon.vl:1488). That is a ladder: `apartJoinPinTyOf`, `holeOperandTyOf`,
     `holeCompositeTyOf`, `exactDerivedPinTyOf`, then a linear scan of `monoOrigNode`.
   - It banks only nodes whose checker type has a type variable. A *pin* is never banked: the L1 log
     records the call's pin differing from what is stored in 371 of 16,656 files.
4. **The type a function value is called at is held, in pieces, by three tables keyed three ways.**
   - The checker's bind rows, one per call node: `callBindNote`/`callBindTyOf` (check_bind_rows.vl:304–345,
     419), plus a per-parameter boolean `holeFnSplit` (:374–383).
   - The flow table's contexts, `"F<fn><"` keys capped at 64 (fn_flow_shadow.vl:1574–1625).
   - fn_split's rendered-text keys.

   Mono reconciles the three through 13 rungs and peer pins. The single row that design §(h) called for,
   `fnFlowSigAt`, appears nowhere in compiler/.
5. **When reconciliation fails, the driver re-runs the whole pipeline.** driver.vl:1193–1216 compiles, then
   alternates FS_PLAN and FS_APPLY full compiles while the plan grows (D6262).

**The missing abstraction** is a checked type per (instance, node), in which a function value's type
names the function. Everything in family A is a position re-deriving that one fact.

### 1.3 The same shape across the pipeline (whole-pipeline survey)

Each item: what it is, how big, the general mechanism that replaces it, and what that deletes.

**(i) Per-position helpers in mono and fn_split.**
- Size:
  - emit_mono.vl has 1,086 functions, 1,078 of them `mono*`.
  - By name, Pin 226, Flow 123, List 98, Ret 88, Lam 79, Hole 59, Arg 54, Cell 33, If 16 and so on.
  - 449 name a function value and 153 of those also name a syntactic position (`monoCapturedLetFnPin`,
    `monoIfArmsPinJoin`, `monoMatchPinnedAt`, ...).
  - fn_split.vl has 243 functions, fn_flow_shadow.vl 187.
  - The five most recent L1 commits each add code for one shape:

    | Commit | Adds |
    |---|---|
    | 76a3eb8fd | `holeChoiceWaits`, `validateChoiceCstr`, `genFnHoleOpenInsts` |
    | f86f37d6f | `holeChoice*` |
    | 7d80cfb0a | `^ctx` |
    | 0efe9c8bf | `monoCapturedLetFnPin` |
    | 3e3b18500 | `forIterListLit`, `fsElemFwdKeys` |

- Mechanism: function identity in the type, with the checker owning the instance worklist (§2).
- Deletes: fn_split.vl, fn_flow_shadow.vl, the driver's re-run loop, the pin ladders and the `genFnHole*`
  and `holeChoice*` families.

**(ii) Ambient `ExpCtx` hints.**
- Size:
  - wasmEmit.vl:35196 holds 17 fields, 16 of them destination hints. They are inherited by default and
    cleared one field at a time at each boundary.
  - 471 `ec: ExpCtx` parameters in wasmEmit.vl and 156 `expCtxHere(` calls (verified: 149 in wasmEmit.vl, 7
    in emit_sections.vl).
  - 458 field writes outside the helpers, 83 of them resets to the inert value.
  - Comments beside those writes cite 38 distinct defect ids.
  - The call-argument boundary alone was fixed one field at a time by D31, D3605, D3816, D8361 and D12459,
    the last of these today in 989c5294a.
- Mechanism: the checker's contextual type per node, read through `repOf`. Half of it exists already:
  `nodeRepTyIx` (check_core_state.vl:565) is written by `recordRepTyAdopt` (check_fit_rules.vl:3921) at 6
  adoption sites and scopes by field type correctly. **wasmEmit.vl reads it 0 times** (verified grep).
- Deletes: 16 of the 17 fields, the Take/Swap/Set helpers, `expCtxSeedValueArg` and the 83 resets.

**(iii) Per-class rules in emit_classify.**
- Size:
  - 704 functions. 273 are syntax-driven (12,741 lines), and 199 of those read **no** node type (7,762
    lines).
  - `scripts/rep-classifier-census.vl --summary` counts 892 classifiers and 3,971 call sites; 332 read FRAME
    and 82 read NAME.
  - VKind (emit_state.vl:524) is a closed set of 32 strings that does not compose (`nulf64list`,
    `nuli64list`, ...).
  - 56 pairs exist in both a syntax and a type form (`repOfNode`/`repOfTy`,
    `structIndexOfExpr`/`structIndexOfTy`, ...).
  - The L2 `let`-tail rules exist because "the element type does not decide the row, because the value
    already has one" (render-parse-residue-2026-10.md, #4808).
- Mechanism: `repOf(ty)`, compositional and memoised by type id, with one row per canonical type.
- Deletes: the syntax side of each twin, the name family (`rlSlotByNameTwin`, `letInitDeliversRow`), the
  twin-row helpers (`structNamesTwoRows` emit_ref_list_kinds.vl:553, `rsRowsDiffer` :913,
  `objLitNamesTwoRows` :933), and most of the 199 type-blind classifiers.

**(iv) The capability position matrix.**
- Size:
  - 145 coercion- or widen-named functions, none of them the single coercion.
  - About 30 delivery sites each call a widen or coerce for themselves (globals, fields, arguments, list
    elements, push, map set, assignment, return, let, print, coalesce).
  - `scripts/capability-matrix.vl` lists 33 positions and there are 1,002 `*.matrix.vl` templates, *because*
    each position is wired by hand.
- Mechanism: the checker writes a coercion record wherever assignability adapts a value, and the emitter
  lowers every record through one `lowerCoerce(src,dst)`.
- Deletes: the per-site widen calls. The matrix changes from a discovery tool into a regression test that
  cannot red on a forgotten position.

**(v) The checker and the emitter derive the same fact.**
- Size:
  - 27 of the 47 pass rows are re-derivations: computeRetInference (23 `cri*` functions, 730 lines),
    buildFnMap, computeVoidFns, capNarrowBuild, collectA, and 36 `synth*` functions (1,039 lines) that write
    inferred types back as syntax.
  - Six of them run twice. `monoRebuild` (emit_mono.vl:6852) re-runs collectA and buildFnMap for each minted
    instance, and `monoRetSettle` (:6875) re-runs the return passes.
  - Narrowing exists twice: the checker's check_narrow_flow.vl, and the emitter's emit_narrow_slots.vl (648
    lines) with about 85 `pushNarrow*` and 84 retire, mask or restore calls. D1015 and D4907 are
    disagreements between the two.
- Mechanism: per-instance elaboration (§2).
- Deletes: those rows, and the emitter's narrowing ledger.

**(vi) The checker re-checking itself.**
- Size: `checkProgramResumed` (check_pins.vl:134–148) runs a full pass, then `pinRun` for expParam, width
  and literal, with budgets of 1, 8 and 2 (`pinBudget`, :171). Each re-check is a whole program, after
  writing the inferred types *as annotations into the tree*. `pinDeepIs` (:154) restarts the whole check
  once more.
- Mechanism: inference facts stay solver state and are read by the solver, not rewritten into syntax.
- Deletes: the write-back (`synth*Ann*`), and re-check rounds bounded by phase rather than by work.

**Every one of these is the same gap: there is no typed, per-instance, elaborated program handed from
the checker to the emitter.** The design below is that one thing.

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

## 3. Migration, ordered. Every step deletes code.

Every step uses the same proofs, run on a quiet box:
- **difftree** over the 16.6k-file population: byte-identical except the files listed as intended movers;
- **`regress.vl`**: 0 `runs → not-runs`;
- **L2 self-compile fuel**, read off three runs because of ±0.25% noise ([[vl-l2-fuel-noise]]);
- **diderven `vl check` and `vl build` fuel**;
- **`plumb-shape-cost --check`**.

Each step lands only when its deletion lands with it. A shadow that only adds code is not a step.

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
  and the list, if and capture pinners (`monoIfArmsPinJoin`, `monoOpenFnListPin`, `monoCapturedLetFnPin`, ...).
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
- **Deletes:** emit_narrow_slots.vl, the `pushNarrow*` and restore family, `capNarrowBuild` (both rows) and
  `criWalkBlock`'s replay. Write-back `synth*Ann*` passes whose fact the elaboration now holds go too.
- **Closes:** family F's ledger-disagreement rows (64 open; grade each).
- **Scoreboard:** check fuel ↓ (fewer re-check rounds), lines ↓.

**Step 7. `repOf(ty)` and one row per canonical type (the L2 end state).**
- **Invariant:** ARCHITECTURE §3.4, literally.
- **Deletes:**
  - `computeRetInference`, `buildFnMap` and `computeVoidFns`, and their #2 rows;
  - collectA, both rows;
  - the name family (`rlSlotByNameTwin` and `letInitDeliversRow`);
  - the twin-row helpers;
  - the syntax side of the 56 twins;
  - the type-blind classifiers in emit_classify (199 functions, 7,762 lines, as the ceiling).
- VKind becomes derived from the rep descriptor.
- **Closes:** family E (9 open), the same-shape rows (D12465's 65 cells among them), and the L2 §7 deviation.
- **Scoreboard:** emit_classify ↓, seed ↓.

Steps 1, 2, 3 and 4 are strictly ordered (1–3 land as one, §3.1). Step 5 starts with 5.0, and step 7 needs steps 4 and 5.
L6 render-parse (§4.3) continues independently.

### 3.1 Findings and decisions from the first landings, 2026-10-25

**Steps 1–3 are one mechanism.** Step 1 as written was refuted by measurement (11,546 instances over 7,482 programs). The emitter asks for types before any bank could be filled: 195,415 asks, 44,518 from functions nested inside an instance and 72,379 from program-level pins with no instance. And about a third of mono's instance set comes from emit-side work through function values and deliveries (1,166 from function values, 425 from lambdas, 301 from direct calls with no candidate), which no check-time call site can key without the function's identity. So:
- one elaboration worklist runs after check and before emit; it covers nested functions, keyed by the enclosing instance, and the program as the root instance;
- a singleton `Fn#d` is a legal closed type argument in an instance key, and a delivery into a declared function-typed slot is a demand;
- joins wait for step 4, and are counted until then.

**The record is the checked type.** Storing `widenLitTy(t)` matched the ladder, and a separate storage-type table moved nothing, so it was deleted. Narrowing stays a separate record (step 6).

**The worklist replaces mono's re-check in the same landing.** Beside mono's per-instance re-check, the worklist cost +0.71% L2 fuel, +0.80% diderven build fuel and +20% peak live memory, +0.65% of it with every hook off. Mono reads worklist entries, and the `instNodeTys` bank goes with the re-check.

**Step 5's first field group needs the join typed first.** Reading the checker's contextual type instead of `structIdx`/`variantIdx` lost 169 programs over 2,879 files. Every loss is a row the emitter's anonLeaf pass (emit_collect.vl and five neighbours) mints by merging the records that meet at a join, then moves onto locals, params, globals, closures and function results, across functions. The checker never gives any value that type. Its own join is wrong as well: `a ?? { r: 1.5 }` over an existing `{r: i32}` is typed `{r: f64}`, widening an existing record in place (D13900), and a join refuses once its type is declared elsewhere (D13901). So step 5 begins with:
- **5.0 Joins typed and stored once.** The checker types a join by the rulings: a fresh literal adapts, and each binding adopts all-or-nothing (D3339 A). An existing record is never widened or copied (record covariance A), and runtime numerics of different types join as a union (numeric join ruling). Storage is `repOf` of that type. The merged-row minting in the emitter is deleted, not moved: a merge across functions would be a second producer of storage. Its acceptance set is the 169 programs.
- 5a–5d then follow as listed.

Step 5 therefore starts after step 5.0, not after step 1.

---

## 4. Scoreboard

### 4.1 Baselines (76a3eb8fd)

| Metric | Today | Population and source |
|---|---|---|
| compiler/*.vl lines | **371,600** (229 files) | `wc -l compiler/*.vl`; 250,411 at 20fa382fe |
| emitter (emit_* + wasmEmit) / checker (check*, typecheck*, ...) / fn_* lines | 188,533 / 112,825 / 9,594 | same |
| functions | 14,784 | `^(export )?function` |
| seed bytes | **5,916,548** | `build/vl-compiler.wasm`, L2 output; baseline 5,758,206, so +2.75% (the bar is +3%) |
| L2 self-compile fuel | **75,749,721,676** | `VL_FUEL=1`, one run; real 16.59 s, peak 702,142 KiB |
| diderven `vl check src` fuel | **48,290,741,306** | no compile cache; "Found 0 errors, 3 warnings."; real 4.98 s |
| diderven `vl build src/game.vl` fuel | **6,282,852,143** | `--initial-memory=9MiB --max-memory=64MiB`; 584,550 bytes |
| plumb-shape main / tail fuel | **7,493,309,049 / 5,422,531,645** | `plumb-shape-cost.vl --check`: "plumb-shape cost ok"; RSS 314.70 / 314.50 MB |
| **Special-case helpers, (a) pin and position** | **1,516** | functions in emit_mono.vl (1,086) + fn_split.vl (243) + fn_flow_shadow.vl (187) |
| **Special-case helpers, (b) classifiers** | **892** (3,971 call sites) | `scripts/rep-classifier-census.vl --summary` |
| **Special-case helpers, (c) ambient hints** | **458** field writes (83 resets) | ExpCtx field writes outside helpers |
| whole-arena scans outside a pass | 67 | `scripts/scan-budget-baseline.json` |
| emitter pass rows that re-derive | 27 of 47 | emit_sections.vl:7974 |
| A1 open rows | 52 (broad A 65) | §1 classifier |

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

### 4.3 L6 render-parse is converging, and is not part of this

The render/parse budget went 128/386 on 10-11 to 50/86 on 10-25 across 141 commits, with one same-day
revert. Its floor is measured at 20/1, D8 is complete (#4803), and it files no new family rows. Keep it.

---

## 5. PR #4813 (L2 D1 stage 11, head 804ad4eee): do not queue as is

**The question asked:** is it a step toward one producer of the row fact, or more per-class carve-outs?
**Mostly carve-outs.**

The diff is 6 files, +245/−28, seed +994 bytes, and the name path is not deleted.

**The good part.**
- The plain value now takes the row its type names, `rlSlotOfRowTy(rlRowTyOfElem(et))`, which is the target
  rule.
- `paramRefArrayName`/`declaredRefArrayName` become wrappers over slot-returning `paramRefArraySlot`/
  `declaredRefArraySlot` (emit_obj_lit_fits.vl:1086–1170).

**The carve-outs.**
- `refListSlotOfIdent` (new, emit_classify.vl) is an **11-rung ladder over binding storage classes**:
  narrowed arm, narrowed name, nullable local, nullable param, param, declared local, capture, nullable
  global, reflist global, global by name, record list.
  - It is a second producer of "a name's row" beside `refListElemNameOfIdent`, which is unchanged and walks
    the same storage classes by name.
  - The survey's sample (`exprStruct`, `globalKind`) shows this per-storage-class shape is what (iii) above
    deletes.
- `refListRowIsChosen` is a named exception list: ArrayLit, Index, the four `letInitDeliversRow` cases, a
  TyVar element, a literal-union element and a narrowed place. Each one is a class where the type does not
  decide the row, and the PR's own residue note says so ("rows of the same type need distinguishing").
  - That is the §3.4 violation stated plainly: the row records how the value was delivered. More emitter
    rules cannot repair that, and each one is a future row.

**What I would change.**
1. Land only the type-derived plain-value arm and the two slot wrappers, and only if the PR also deletes
   what they replace. The wrappers delete a name derivation; do not add `refListSlotOfIdent`.
2. Do not add `refListRowIsChosen`. Its classes are the work of steps 1–5:
   - TyVar elements need per-instance types (steps 1 and 2);
   - function-typed elements need function identity (steps 3 and 4);
   - a literal or a narrowed place needs the contextual or narrowed type (steps 5 and 6).

   Until then, leave those classes on the existing path unchanged rather than encoding them as a new list.
3. Re-grade as one producer: the PR's measure of success is a *fall* in `rlSlotByNameTwin` callers, not a
   fall in difftree differences.

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
