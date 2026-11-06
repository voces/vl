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

Steps 1, 2, 3 and 4 are strictly ordered (1–3 land as one, §3.1). Step 5 starts with 5.0, and step 7 needs steps 4 and 5.
Moving the elaboration into check, with an error channel, is a later step (§3.1). L6's remainder falls to steps 2–7 (§4.3).

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

**5.0 landed (#4816).** L2 fuel −1.04%, diderven build fuel −1.15%, diderven check fuel +1.63% (join typing moved into the checker), seed −0.63%; generated code byte-identical on diderven, heregeat and plumb. Residue, counted: `recShapePassArg` handles only `T → T` generics, and general bidirectional call inference replaces it; two anonLeaf no-op stubs in emit_mono go with the elaboration landing; `recAdOwn` is written and never read. D13902 filed.

The findings below are from 2026-10-26.

**5a landed (#4818).** `ExpCtx`'s `structIdx` and `variantIdx` are deleted, and their readers take the checker's adoption stamps. 897 census cells move to `runs` (445 each in e007218 and e007220, and 7 named), and D3037, D3386, D3458, D4135 and D4644 close. Compiler net −21 lines, seed +941 bytes, diderven check fuel +0.47% and build fuel −1.07%, L2 fuel +0.07%. A wider, field-dropping delivery now pins a literal-only binding at its delivered type (cross-module adoption ruling, 2026-10-07 B), so an importer's pin moves the library's interface row and the check-skip declines `interface`. That is sound, and it costs a re-check on every edit to such a library; importer-demand tracking, the machinery the ruling names, would let the skip serve them again.

**Increments 1 and 2 of the worklist landed (#4819, #4821).** Mono's hole-parameter pins come from the per-instance elaboration (`emit_elab.vl`, `check_elab_cap.vl`), and eight pin rungs are deleted: `monoHoleGenFnFramePin`, `monoHoleLitCopyPin`, `monoOpenFnRecListPin`, `monoHoleLamArgPin` and `monoHoleLamOwnCallsPin` in increment 1, then `monoHoleLeafLitPin`, `monoOpenFnListPin` and `monoOpenFnNestedListPin`. Increment 1 closes ten rows and moves 9 classes to `runs`, with none lost; increment 2 is identity-difftree clean (0 of 11,832) and partly closes D3038. Rulings taken while landing them:
- a leaf literal is typed contextually at its delivery in the substituted body;
- a built-in goes through call elaboration like any other call;
- a hole function nothing calls has no instance, and takes the D4551 default;
- `??` over a hole is open.

**Decision 4: an instance's boundary is the template's.**
- An instance's boundary is the template's checked signature with the instance's bindings substituted, and the body's result is delivered into it. Inference at the instance never re-joins what the template typed, and the mono return ladder is deleted.
- There is one join: a join of two types neither adapts to is their union, existing containers included (record covariance A, numeric join ruling). The direct `if b { return [2.5] } q` over `q: i32[]` was refused on master while its generic and hole spellings ran.
- A parameter typed by the callee's use is an instance output. A lambda argument binds as `Fn#d`, and a fresh literal argument as its site, inferred like a local first-use literal. The caller's own uses type a binding before any key is formed.

**Decision 5: when a function-valued parameter keys by `Fn#d`.** A function-valued parameter keys by its signature when that signature is closed, and by `Fn#d` only when it is open (a hole function or a lambda). `Fn#d` is a singleton type carried through literals, bindings, returns and fields. Its rep is the uniform closure, and a call through it is a direct call to the demanded instance. A join of `Fn#`s erases to the common signature when the demands agree; otherwise today's refusal stays, and its residue is a tagged sum. Backward propagation was rejected because it rebuilds the pin ladder.

**Increment 3 lands with Decision 5's key fixes.** `pinHoleLambdaArg` is a check-time diagnostic, not a pin. Stubbing it moves 0 run outputs over 6,596 cases and loses one type error (`error-hole-lambda-delivery-demands.vl`). Deleting it would turn two type errors into build-time refusals (clause 2). The elaboration runs after check, from emit_sections, and rolls its errors back, so it cannot own that diagnosis yet. So increment 3 is one PR:
- an open-signature function parameter keys by `Fn#L`;
- the re-check sees `Fn#L`;
- a function value's enclosing instance is its creator;
- and the `Fn#d` direct-call fold.

A later step is added: the elaboration moves into check with an error channel, which is §2.1's target, and deletes `pinHoleLambdaArg`.

**The write-summary channels are linear on call cycles (#4820, #4822).** Both were exponential in a cycle under a narrowed path: `vl check compiler/fn_split.vl` took over 300 s on the increment 1 seed. Free-variable summaries now stay provisional while a cycle is open (5.1 s), and the parameter channel settles a cycle once per strongly connected component (its scaling axis 32.1× → 1.04×). Both are perf and soundness fixes that add code: compiler +71 lines for #4822.

**Container adoption, slice 1: list elements (#4824).** A record literal in a list is built at the row the checker stamps, and an unrelated refused read no longer undoes a list binding's adoption (the undo is per binding). D2215 closes (runs, prints 99); D3036 moves from invalid wasm to a loud emit reject (5b residue). The D5342 guard narrows the emitter's name scan (`fieldStorageEq`) rather than deleting it. Residue: map values (slice 2), `letMapDestShape`, the name scan (bypassing it loses 29 `runs`), and `rlElemKindTbl` (5b).

**Increment 3, slice 1 (#4825).** Mono reads a hole instance's literal and read types from the elaboration (`elabWalkTy`), falling back to the hole binding where it has none; 8 `d3281_join_hole` cells move from emit reject to `runs`. Value calls (`monoPinnedTyOf`, `monoLamCallTy`) stay on the binding until lambda bodies get an elaboration instance, so D3616 stays open. The lambda-body producer gap was caught by preflight through D3616; the corpus had no cell for it. Planned order: the `Fn#d` root binding and the lambda instance key (slice 2), value calls read the elaboration, then the fallback, the D6210 rung and `holeFnSplit*` are deleted. Slice 2 landed as #4826: a hole instance's lambdas and value calls read its elaboration, with the binding as the fallback, and D3616 closes.

**Container adoption, slice 2: map values (#4827).** A `Map()` held by a list or record literal adopts its delivery. `letMapDestShape` stays.

**Increment 3, slice 3 (#4829, #4830).** An open call's lambdas are pinned under the instance the call builds, so each lambda's elaboration instance has that instance as its parent (3a). A demanded instance then settles the instances its own demand enqueues (`elabSettle`), and an anonymous lambda's hole name keys on its node at every stage, so the hole-function binding has one producer; the two bridge readers are deleted (3b). Binding fallbacks over gc.list go 11 → 7: lamcall 1, operand 5, pinned 1. The root-seeded instance (`k0`, with the hole function still open) stays, because two readers still reach it: `elabDemandFrom`'s reached-at-two-instances test, and a template lambda body's emission, which has no demand key. Slice (ii) answers both, then drops the seeding.

**Step 6, slice 1: Ident reads (#4831).** Identifier value reads and list-op receivers unbox at the checker's type (`identReadAtomKindAt`), once per read, and the `??` desugar, the assignment re-read and the type-guard operand produce typed reads. The narrowing stack (`pushNarrow*`, `emit_narrow_slots.vl`, `capNarrowBuild`, `criWalkBlock`'s replay) is still read by field reads, captures, the `is`/`match` arms and the struct/variant narrowers; each family follows as its own slice, and the deletions land with the last reader. D4884 stays open: in a generic instance the resolver's declaration is not the instance's binding. D2451 now loads then traps, which is the checker's defect.

**Container adoption, slice 3: map list values (#4832).** Map adoption peels map levels and one list level, then lands the record, so a `Map()` of record lists pins its binding and the list binding its values came from follows. The emitter's `letMapDestShape` index is deleted; `letMapShapeOf` reads the pinned annotation. Two undelivered `Map()`s that mix rows (`{r: {c2: 1}}` or `{r: null}` beside `{r: i32}`) are check rejects from the first write's inference, not adoption gaps.

**Step 4 design (spike).** A side table, `fnSetOf` on `TyFunc`, replaces `elabFnIdTy`. A join whose members differ gets a fresh head. Two or more demanded signatures make a k-closure record (D3975), and tag dispatch is kept only for the residue whose results differ. The step lands as slices S1–S7. The spike found that `joinTys` returns arm 1's index, so `Fn#d` was mislabelled on every join; it was latent (no wrong output found), and S1 fixes it.

**Step 4, S1, S2, S4 and S5 (#4836, #4840, #4842, #4850).** A function value carries its member set, and if/match joins of function values are typed apart (S1). S2 landed without the fresh `let` read head: with it, D7141 (a re-pointed `let` in a list slot handed to a hole parameter) went from runs to loud, because emit_mono's list-slot pin cannot serve the fresh row. The head is deferred to S3/S5, after increment 3, together with the mislabel; they are one question. A return join of two sets is typed apart, and hole judges read a call result's set (S4). A finite set's rep is a tag (S5; DECISIONS.md, "A finite function set is represented by a tag"). The direct-call spelling of D13740 runs; its handed spellings stay refused (D13966).

**Step 4, S3a: a set's escape had no implementation.** At no set size was a function-value set's escape built (into a declared function-type slot, an annotated write, an element, a field); pins carried it. Eta-expansion at the escape is the rule (DECISIONS.md, "A function-value set escapes as a lambda"). S3a lands with S3b. pin3's 8 losses map to S3b (5), holes-close (2) and (c) (1). The cost of a whole-program re-check is open.

**S3a and S3b landed (#4934).** Singleton and generic-member sets are tagged and called per instance, a called set reaching a closed function-typed slot is eta-expanded there, and one join rule covers a written `let`'s writes, loop breaks and lexical targets. A set with no call through it keeps the closure rep (D3975), so the escape-only tagging loop is deleted. The pins stay: deleting the `monoCallIfBound` and `monoIfBoundRetAtPin` callers loses 17 cells, every one behind a hole set. Holes-close lands their shapes as producers with those callers untouched, and the callers go in the slice that closes the last cell (DECISIONS.md, "Holes-close lands as producers"). Price: D9350 is now runs-but-wrong (D2038).

**Holes-close producers landed (#4950).** A hole-parameter delivery, a generic or `.map` slot and a labelled-block value tag their function set, with the eta type-parameter lift; a singleton that is a tail of another set's join is tagged only with it. 0 of 6,740 cells change. With the pin callers removed in a probe, 8 of the 17 pin-dependent cells behave as on master; the other 9 are listed by owning slice ((c), (d), the let-write join, and D14422/D14423/D14424, filed as refutation pins). The impure else-if cell is a nested join carrying a set at another set's join tail, grouped with the let-write join slice. Slice (c) is re-scoped (DECISIONS.md, "(c) is about function values in un-annotated containers"): c-1 folds into c-3, which records the set of call tuples reaching an element and stamps the one-tuple case (about 60 files); the many-tuple lists stay on the pin until (γ), one closure per tuple, deletes it.

**c-3's residue is the annotated face's own defects, fixed rather than declined.** Grading c-3's un-annotated stamp against the annotated spelling left 2 of 8 runs→not-runs, both defects the annotated face already had: D14427 (f10) and D14428 (g4). No decline is taken, because a decline keeps the un-annotated face routed around a defect the annotated face has. The order is f10, then c-3, then (γ) with c-2. f10 closed (#4960, D14427): the first check's `fnTagCall*` notes outlived `holeRecAdopt`'s restart, and `fnTyFactsReset` now clears them, so a set's rep is decided once, from the final check, and every holding position reads that one fact. g4 (D14428) has no token rep for a set-typed closure parameter, since a singleton set reached at two call types has no closed type; it waits on (γ). fh1 (D14429), a set's closure signature minted once by the first generic instance through the name-keyed pin, belongs to slice (c)'s per-instance mint. Tuples observed inside a generic or hole instance body are not closed tuples until that mint; that is the (c) re-scope's own boundary, not a decline. The loose bucket for an alias, a spread or a written `let` stays: it is the set saying what it cannot see, not a rung.

**c-3 landed (#4966).** A one-tuple function-list binding takes its list type from the checker as a pending annotation, so `nodeTyInOf` answers closed and the pin no longer answers it. The tuple is kept per member function, not per set: per set lost 2 runs where a member was shared between lists at different tuples. Still on the pin: 35 many-tuple files ((γ)) and 26 in-instance files (the per-instance mint), 7 in both. Filed: D14425, D14426.

**(γ): container positions reach the tag rule; the element carries the set's tag rep.** The list-element pin carries 75 `tests/cases` files, not the ~13 the c-3 slicing counted: with every `fn_flow_shadow` walk turned off, 75 move runs→not-runs. The cause is that `ftNodeOk`/`ftCtxOk` refuse `ArrayLit`, `Index`, `Member` and `ObjLit` (and the `ForIn`/`Spread` parents), so no container element reaches the direct-call tag rule. Those position gates are lifted. A container element carries the set's tag rep, the fact f10 made single, and writes into the container join the set through S3b's join rule. Two alternatives are refused (DECISIONS.md, "A function value in a container keeps its set's one rep"): per-tuple instancing of the binding (P), because it breaks aliasing, and a set-dependent element rep (R), because it is a second rep. Fixed-storage destinations keep the clause-2 refusal (D14532). It changes reps, so the rep-fuzz gate is mandatory. It lands by position (`ArrayLit`/`Index`, then `Member`/`ObjLit`, then maps, returns and callbacks), and each slice deletes the element-pin reads it covers. c-3's one-tuple stamp collapses into the tag rule if it turns out to be the rule's one-tuple case.

**Step 4, the per-instance mint (design, 2026-11-01, not built).** Mono's rung B (`monoOpenFnFlowPin` in `monoPinHoleParam`) is the only lowering of a hole lambda handed through a function's result and called only through that result (`function fw(f) { return f }`, `const q = fw(lam)`, `q(3)`). It carries 5 `tests/cases` files and every graded cell of the two matrix templates, `hole-lambda-through-hole-fn-result` and its `<F>` twin `hole-lambda-through-generic-fn-result`: 96 cells, all emit refusals with the rung disabled. Measured on that witness:
- The elaboration already makes the closed instances. The call through `q` is bound to `lam@i32`, and an instance of `fw` at `f = (i32) => i32` exists.
- The call `fw(lam)` itself is bound to the root-seeded instance (`f = (_) => _`), so mono's elaboration rung reads an open parameter and falls through to rung B.
- Tagging `{lam}` is refused at that call (`ftNodeOk`'s `Call` arm asks `ftRetCarries`, and `fw`'s return is a hole). An admission that accepts it lowers `fw`'s body at the closure rep while its argument is the id, which is invalid wasm. `fnTagRetMark` marks a declaration, and `fw` returns an id at one instance and a closure at another.

Binding `fw(lam)` to the closed `fw@((i32) => i32)` cannot serve one call whose result is called at two types (`q(3)`, `q("w")`), so the mint keys by the set instead:
- **What it mints:** an instance of a function at each parameter bound to a function set, a singleton `Fn#d` included (Decision 5's "a singleton `Fn#d` is a legal closed type argument"). Here that is `fw@{f = {lam}}`, and each call through its result dispatches to `lam`'s own instance.
- **Keyed by:** `check_mint.vl`'s scope row, the instance key spelling its bindings, with the set id as the hole's binding. It is the scope the mint facts of calls through a set-bound parameter already use.
- **Where the elaboration records it:** the instance's body notes a return fact when it returns a value of the set, beside the existing call-through facts, and `elabMintFacts` counts both, so the late decision runs. Keying the call is slice (ii)'s existing path and needs no new mechanism. A parameter is bound to the set type only when the set is tagged (`elabCallTaggedArgs`, `elabSetArgBind`, and `monoArgTaggedSetTy` on mono's side), so once the return fact lets the late decision tag `{lam}`, the call binds at `fw@{f = Fn#lam}`. An untagged set keyed this way would repeat D13860: a key naming the set while mono builds the parameter as a closure.
- **`fnTagRetMark` per instance:** the mark moves from a declaration to a scope row (`fnTagRetMarkAt(scope)`). `ftTry` marks the scopes whose return fact is the tagged set, and its one reader, `fnReturnsClosure`, asks the mark of the instance it lowers. So `fw@{f = {lam}}` returns the id and every other instance of `fw` the closure.
- **The tag rule:** `ftNodeOk`'s `Call` arm accepts a call bound to a scope whose return fact is the set. A lambda member stays a late-only leaf.
- **γ's (B), generic members called through a list, record or map, is two shapes.** A handed holder (the container passed to a hole parameter, its calls mint facts) reads these same scope rows, and γ's fact path (#5448, #5551) already reads a set-keyed instance per call there. A local holder (`const c = { f: add }; c.f("s")`) needs no scope row: its calls are check-time calls whose arms instance the member at the call's types, and what blocks it is admitting a generic member as a leaf. So one mint serves the handed half, and the local half is independent.
- **Order:** the build sits on γ's late-demand change (`elabCallArgSetTy`, and `elabDemandFrom`'s tagged branch keying a demand by the set in place of mono's binding), because mono's demand for `fw` must key the same way as the call. The late-demand count is read with γ's probe. Lambda leaves stay late-only, with `ftLambdaIdOk`'s gates as they are.

A capturing lambda is never tagged (`ftLambdaIdOk`), so it stays a closure at the seeded instance, and rung B still lowers the grid's capturing cells (`hole_cap`, `gen_cap`). Those cells decide whether the rung goes whole or keeps a closure-only arm. Acceptance: both templates at 96 of 96 `runs` with rung B deleted, the 5 `tests/cases` files, the late-demand count not rising, and a byte-diff sweep naming only the files the change moves. D14880 and D14881 are graded and expected to stay open. Owners: the call's keying is slice (ii)'s; the return fact, the per-scope `fnTagRetMark` and the `ftNodeOk` admission are this design's, reviewed by γ, who owns the tag rule.

**The mint's hand-back half landed another way; its handed-holder half is next (2026-11-04).** Rung B is deleted (#5723) since #5711 keys a root call that hands back a hole lambda at that lambda's one instance (D14885), so the design above was not built as written: on master `ccd16f91` both templates run 48 of 48 graded cells (96 of 96), and its 5 `tests/cases` files run with the split plan off. What it did not reach is its handed-holder half: a list of a set in a function with an un-annotated parameter, whose member calls a function handed on at two signatures, is kept untagged by `ftScan`'s forwarder clause (`ftFwdFn && ftInOpenFn(fn) && ftMemberCallsParamTwice(s)`; D14430, D15100). Lifting the clause alone moves one `@run` file, `forwarded-hole-fn-to-list-element-value-param`, from `runs` to an emit refusal (`a function value is called at two signatures, and the closure it holds was built for one`), and with the split plan off L-set's two files reach the same refusal: the list is tagged, but the handed function still arrives in each member as one closure. The mint serves it with three parts and no return fact: the handed function's set is tagged when it is handed through a call on a set (`ftCtxOk`'s `Call` arm), each member of the callee set is instanced with that parameter bound to the handed set (`check_mint.vl`'s scope row), and mono reads those instances, so the member's calls dispatch by tag to the handed function's per-signature instances. Acceptance: L-set's two files run with the split plan off, D14430 and D15100 close, the forwarded file keeps running, late demands 0, and rep-fuzz. Owner: G1.

**The handed-holder half landed (2026-11-04).** It needed none of the three parts above. `ftScan`'s forwarder clause is lifted, with `ftInOpenFn`, `ftCallsHandFn` and the helpers only it read. What stopped the handed function's set from being tagged was the elaboration's rule for one call through two sets in two instances: it marked both sets partial whenever the member was held beside another function. It now does so only when an untagged set some call goes through holds the member (`elabFnSetMembersUntagged`), since a call through a tagged set dispatches at the call and each instance of the member takes its own arm. L-set's two files and F-let's one run with the split plan off. D14430 and D15100 are closed, late demands are 0 and rep-fuzz is exact.

**Mono reads the closed type first (#4860, #4878, #4888, #4892, #4911, #4915).** The open-argument i32 floor is no longer an instance key (#4860), and `monoClosedTyName` reads the closed elaboration (#4878). `monoArgTyName` reads the closed type first, and the cascade serves only three facts (#4888, a staging step with two producers): records, function types and narrowed kinds, which disagree at 1,349 sites in 246 files, 361 in 67 and 60 in 15. Fact 2 has landed: a closed function type pins through `monoFnTyPin` (#4892). A generic function named at a closed function type adopts per instance, as an identifier and then as an element, field or return (#4911, #4915); pin sites go from 478 files to 456.

**Increment 3, D1: mono reads the checker's instance (#4839, #4843).** The checker re-keys `callBind` at the adopted rep (`check_bind_adopt.vl`), and mono reads that key through `elabDemandFrom`. The bridge stays on two declines: a `Fn#` or hole in the key, and a closed pin not assignable to the key's substituted parameter. Instances collapse by rule (DECISIONS.md, "Two instances share a function when rep and elaboration agree"). An instance's spelling names only the type variables its declaration reads (#4843), which leaves +1 generics and +2 closures in the self-compile, each a distinct binding master merged by key collision.

**Increment 3, slice (ii), waits on the elaboration moving into check.** The root-seeded `Fn#d` instance is the producer of hole-function instances reached through function values. Lazily checked instances run after the rewrite passes (`loopValueRewrite`, `dispatchRewrite`, `captureBoxRewrite`) on a rewritten arena and pin nothing. Binding fallbacks on 8d0974164 are 9 (lamcall 1, operand 5, pinned 3).

**Moving the elaboration into check, measured on 8d0974164.** Two populations block it:
- **Late demands.** 2,165 late instance checks in 518 of 5,065 @run files, all from emit_mono's `elabDemand`; the self-build has 0. By kind: nocall-root 1,052, unusable-root 336, then nock and pins. nocall-root by pin source: 586 from the fn-flow class pin (`ffBuild` over the rewritten tree), 196 identity through a field, 84 keyable now, 186 with no source (capture-cell lambdas). The missing fact is function-value flow: Decision 5's `Fn#d`, carried through typing, replaces the 0-CFA pin.
- **Speculative instances.** `monoRecheckEnd`'s rollback discards 820 instance diagnostics in 152 files that run today, so surfacing them would veto. By minting site: the eager seed 589 (310 type-parameter, 279 hole-parameter declarations), hole-function pin rows 173, nested calls of a seeded instance 36, mono's late demand 22. The main producer is the checker's closed `callBind` rows: a row that fixes a hole parameter at one call's type mints an instance whose body does not check at another call's type (`closures/hole-copy-chain-called-at-two-types.vl`).

The order: checker rows for value-of-generic deliveries, one slice per kind; then `elabRun` moves into check with the error channel once both populations are 0, and `pinHoleLambdaArg` goes with it.

**Speculative instances, re-measured on 2026-10-30.** A probe on `elabOne` counts files where an instance's re-check raises a diagnostic the rollback then discards: 769 of 17,267. About 500 were an `is` test that cannot match at the pin (`x is i32` at `T = f64`), a dead arm and no error, which the elaboration's re-check no longer raises (`deadArm` in `checkIsExprNode`): 130 files are left. A nested lambda re-checked under a parent instance whose capture never reached it declared nothing around it, so its free names (`k` in `const rd = (t: T) => { k(t) }`) read as undeclared; it now takes the template's own view of them: 120. A generic declared `: T` whose `T` is pinned to a newtype brand, returning a value of the brand's base (`function bump<T>(a: T, n: i32): T { return n + 1 }` at `T = TVAddr`), was let through at the call (`retNomOnlyAtHole`) and refused by the re-check; the re-check now agrees with the call: 110. The re-check ran after `canonEmitTypeNames` had rewritten each annotation into the emitter's spelling, so `const st: Set<string> = Set()` re-read its annotation as `{[string]: boolean}` and `const xs: A1[]` as `i32[]`; `elabRun` now reads the spellings the first check read (`canonShowWritten`, `canonShowCanon`): 103. Three refusals the template's pin already answered are no longer raised by the re-check: an `as` converting a parameter pinned at no number takes the miss the template typed (D2791), an `is` against a type parameter that cannot match at the pin is a dead arm, and a guarded call through a hole read the pin types `null` is a dead branch (D3197): 99. The `is` rule of #5212 stopped raising the refusal that also marked the test's `then` arm dead, so the arm was re-checked as live (`return v.foo` at `v: { bar: i32 }`); a suppressed refusal now marks the arm dead (`elabCapDeadTestNote`), and a diagnostic raised inside a dead arm is not counted, since it is not an error: 96. A test a non-union pin always passes leaves its `else` arm dead, and, when its arm always exits and it has no `else`, the rest of its block (`if v is { foo: string } { return v.foo }; return v.bar` at `v: { foo: string }`): 91. A hole-pin row grouped consecutive pins of one declaration as one instance, so `apply`'s function pinned at one call and its numbers pinned at the next made an instance no call has (`fn: (i32, i32) => i32` beside `a: f64`); a row now ends where the binding the pins were substituted from changes: 88. A row binding the one generic a set holds was also instanced once per signature of that generic, which mono builds only when the declaration hands the value back (`fw(f) { return f }`); where it only passes the value on (`mid(a: F, a1: F)` handing `a` and `a1` to two holes), mono builds one instance at the set's rep, and the per-signature instances failed their re-check at the other signature. They are now enqueued only when the declaration returns that parameter, bare or handed to the call it returns: 70, late demands unchanged. A generic used as a value is built at its default `i32` (D4551) for parity with mono, which emits it as a stub when no call reaches it (`apply3` called with nothing); an instance only a default asks for, or one made inside it, is now a guess (`elabGuessKeys`), unmarked when a call reaches it, and a diagnostic in a guess is not counted: 66. A check that restarts (`checkRestart`) re-mints the type arena, and the hole-pin rows a pass banked before the restart kept their type indices, which then named whatever the next pass minted there: `take2(xs2[1])` pinned `?take2.0` at `{f: (i32) => i32}` and the row came back reading `(i32) => i32`. A restart now keeps only the rows whose types are all builtins minted before any program type (`elabHoleRowsKeepStable`), which the arena re-mints at the same indices: 46, late demands unchanged. A valued `if` joining a `null` arm with a member string was refused at a `K | null` destination, since that destination is banked as `K` and the `null` arm did not fit it (`return if c == 1 { null } else { "a" }`, at a written return and at an instance's re-check alike); the non-null arms now adopt `K` and the join is `K | null` (`litJoinOf`): 45. A hole function calling itself at another type (`depth(q.next)` inside `depth` at `L`, the field `L | null`) read its own holes at the running instance's binding, since a call naming a function with no type parameters binds every enclosing variable its signature mentions; a recursive call now solves its own holes from its arguments, as the instance mono builds for it does (`selfCallHolePrefix`): 44. A hole function handed to a parameter nothing reads is tried at up to three defaults (`i32`, `i32[]`, `string`, D6301), and substituting a trial pinned the holes it named, so a trial the body refused (`g(1, 2)` at `g: i32`) still banked a hole-pin row the elaboration then instanced; a refused trial now drops the rows it made (`elabHoleRowCut`): 40. The emitter's lambda pinning asks whether a callee type is still open by substituting `i32` for each variable it keeps (`vrOpen`), and that substitution pinned the holes it named, so `viaReturn(h)` handing `h` on through a lambda banked `?viaReturn.0 = i32` after `elabRun` had settled; the question now drops the rows it made: 38. A nested generic redeclaring its parent's `T` is instanced with both bindings of the name, its own first; `bindOf` reads the first, and the type-parameter scope the re-check pushes reads the last, so `const z: T = t` in `inner<T>` re-read the parent's `T`. The re-check now pushes each name once, at its first entry (`elabNamesFirst`): 37. A row binding a set of functions none of whose members has a root signature is enqueued at the set's no-argument stub rep (`() => void`), which mono builds and no call runs: a capturing nested `k` handed to `use(p) { return p(1) }` is pinned per enclosing instance, and the stub instance re-checked `p(1)` at arity 0. Such an instance is now a guess: 34. A call through a literal `const` list's constant element (`gs[1](lam)`) is judged against that element alone (D10893), and mono builds only that element when it is a hole function; the elaboration enqueued every function the list holds at the call's types, so `apply3` was instanced with `apply2`'s lambda. A hole-function element now runs alone; a declared generic element is still instanced at every call, as mono builds it: 29. An instance's re-check took its template's result under the instance's binding as the result its returns are checked against, written or not; an inferred result is the body's own join, and a template join that folded two holes into one (`if k == 0 { a0 } else { a1 }`) read back as only one of them (`i32 | null` beside the body's `i32 | boolean | null`). Only a written result is now checked against: 24. A call's argument checks substitute the bindings found so far into each parameter, and that pins the callee's holes provisionally: `H((x: K) => x, "b")` pinned `?H.1` at the literal's widened `string` before the call's pin step settled it at `K` (D3171), and the second pin opened a row of its own, so the elaboration built an instance at each. The pin step now drops the rows the argument checks banked for the same callee (`elabHoleRowDropDecl`); a nested call's rows are kept: 22. A call through a parameter whose type is still open (`only(n, f) { return f(n) }`) was answered with every function the write scan sees handed to that parameter at any call, so `only`'s `string` instance enqueued `dbl` at `string` beside `twice`. Inside an instance such a call now reaches what the argument holds at each call that reached the instance, or failing that the functions the instance's own type of the parameter names, and only then every function handed to it; the root, where that type is open, enqueues none. Reaching only the instance's type dropped the targets of a set D14439's witness hands on, which turned its loud refusal into invalid wasm, so that type is a fallback: 19. Two checker reads took a node's type from the template's recording, which an instance's re-check does not overwrite: an index store's receiver (`m["a"] = v` pinned the template's `Map()` and left the re-check's own map open, so `m["a"]` read `_ | null`), and a cell write's container tag (`z[1][0] = null` read its receiver as the template's hole, so the write hit every cell and retired the narrowing of `z[0][1]`). Both now read the running instance's type (`elabLiveTyOf`): 17. A guarded call through a hole read the pin types `null` is a dead branch (D3197), and so is one through a binding of that read (`const g = z.f; if g != null { g() }`), which the instance types as the null-only `_ | null` rather than `null`; the re-check now treats both alike, and the dead call lowers to `unreachable`: 15. A `let` cell holding hole lambdas beside a generic (`k = other` with `other<V>`) refused the peer rule for the whole cell, so a lambda written into it from a nested function had no instance and mono demanded one late, which also left a guess that failed its re-check; the cell's hole-function members now take their peers' signature and the generic is instanced by its own writes: 14. An instance at a set's rep that no call reaches (`only(n, f)` at `?only.1 = (string) => string`, which mono builds beside the set-keyed one) answered a call through its open parameter with every function handed to that parameter at any call, so `dbl` was enqueued at `string`; such an instance, typing the parameter at a closed function type with no set, now enqueues nothing through it, since the members' instances come from the calls that hand them over: 13. A call row a function argument leaves open, closed only by the D4551 default `i32` for a generic an argument holds (`elabRowArgDefaults`), minted an instance that was not marked a guess, though the default instance it stands beside is one; such an instance is now a guess too, so a body that only works at its real type (`app(p, "x")` beside `p(4.5)` over an impure `if` of two generics) no longer counts: 12. One of what remains is not a wrong instance: `rv3310_s_b_k__match__none__arrj__isall__tp.vl` indexes a join of three lists (`r[0]` on `T0[] | T1[] | T2[]`), and its direct spelling (`string[] | boolean[] | K[]`) is refused by `vl check` with the instance's own diagnostic, `cannot index non-array` (D2760's design rule). The generic template hides a refusal the design owes; it surfaces as that check refusal when the elaboration moves into check, so it is counted here but needs no fix first. D14084 (`r.length` on the same join, which should run) stays an open capability gap and does not block increment 3. Their messages are mostly a default `i32` instance (D4551) whose body only works at its real type (`.length` or a call on `i32`), and argument or arity errors in instances mono never builds.

**Late demands, re-measured on 2026-10-29.** A probe on `elabDemandFrom` counts files where the monomorphizer enqueues an instance after `elabRun` settles. Each slice below was byte-identical over the 17,267-file build sweep:
- 589: the first reading, 478 of them under `tests/cases`.
- 513: `elabSettle` drains the hole-pin rows check banked before any instance (#5159).
- 473: an operator dispatched to a `self`-function records its call row (#5160).
- 434: a pin that is a brand's erased rep takes the checker's instance at the brand (#5161).
- 403: a generic function value delivered at a closed function type banks its instance (#5162).
- 392: that walk enters record fields and list elements, and an instance's re-check banks its returned values (#5163).
- 265: a call through a value reaching two or more functions enqueues each, generic ones included, read from the write scan (#5164).
- 249: a generic call binding none of its type parameters banks the instance at their default (#5165).
- 239: the same write scan reads a field or element by its slot path.
- 204: a pin that widens an instance's numeric literal union to its base takes that instance when no other instance of the declaration takes the same pins. A string literal union lowers as an atom, not as `string`, so it is excluded. An extra instance enqueued at the base instead broke 98 builds: emit reads asking what all of a declaration's instances agree on moved.
- 187: a demand for a declaration with nothing to bind, no type parameter and no un-annotated parameter, is answered with the root, the generic pass's own typing, instead of a redundant instance.
- 183: a row left open by a function-typed parameter's result (`apply(inc, 3)`, `ap(if c { idg } else { kg }, 3)`) closes at the result every function the argument may hold gives at the parameter's closed types, each instanced there.
- 174: a binding read delivered or called reaches every function assigned to it anywhere, a closure's writes included (`cwFnValueTargets`).
- 154: a row binding a set of functions also enqueues the instance at the set's rep, which is what mono builds: the one signature every member's root instance has, or a no-argument stub when no member has one.
- 145: the rep is also read at the row's own instance, from the member instances its body reaches; a member it never calls adds nothing, so a set it calls nowhere is the stub.
- 131: the rep walk enters record fields and map values, and a generic member no instance reaches takes its signature at the default `i32` (D4551), as mono builds it.
- 127: each closed call row, at the root and inside an instance, binds every generic function argument (and each element of a list literal argument) against its parameter's type under that row.
- 108: the root answers a nested declaration too, when it and every declaration enclosing it binds nothing. A nested lambda typed from its context still takes its instance where its body calls a generic: answering those with the root broke four builds, because the enclosing instance types the call.
- 94: those lambdas are enqueued by `elabRun` as instances of their own with nothing bound, which is the key mono demands.
- 89: a lambda whose parameter holds a set of functions (a `.map` callback over a tagged list), enclosed by nothing that binds, is enqueued at the set's rep. No call row reaches it, since the method is intrinsic.
- 84: the write scan reads a value `if` (and a block's tail) as holding what each arm holds, so `f = if c { inner } else { other }` reaches both functions.
- 78: every generic some set of functions holds, which is a generic used as a value, is also enqueued at its default `i32` (D4551), which mono builds when nothing binds it.
- 75: a row still open only on a bare type variable of a generic its arguments hold (`same(two, three)` binding `T` to `two`'s `T`) closes at the default `i32`, and instances those arguments there.
- 70: an index read or write dispatched to a `"[]"`/`"[]="` operator (`std:idtable`'s `u[4]`) records its call row, as the binary operators do since #5160.
- 69: the numeric-literal widening of #5167 enters record fields (`{a: 2 | 1}` takes the `{a: i32}` pin).
- 62: a row binding the one generic a set holds, whose root instances disagree (`fw(g)` returning `g`, its result called at two types), is enqueued once per signature of those instances. Each use of the value runs it at one.
- 59: the write scan skips a self-assignment (`d3 = d3`), which stores nothing the binding does not already hold. It used to make every binding that reads it unknown.
- 57: an unbound call's default instance pins a type parameter that is a bare member of a union parameter (`T | string` handed a `string`) at the argument's own type, as mono does.
- 56: `const k = inner` aliases the `inner` in scope, a nested function shadowing a top-level one, not the top-level one by name.
- 55: a generic read as a value whose signature names none of its type parameters (`z<U>()` in `[z]`) is also enqueued at its default `i32`, as a set's generic member is.
- 54: an instance's call through a function value (`h(x)`, `h` a `let`) instances each named generic the value may hold at the call's types; a `let` that also holds a non-function (`fn | string`) still names its functions to such a call. A lambda keeps the instance its own context types: adding those broke 15 builds.
- 52: an unbound call's default pins a type parameter that sits inside a union parameter's arm (`{[string]: V} | {[string]: string}` handed a `{[string]: string}`) from the argument's type at the first arm that binds it, as mono does.
- 51: a generic named as a list method's callback (`[1.5].map(idg)`) is instanced at the element, at the root and inside an instance's re-check, from the binding the checker already takes there (D9004).
- 50: a call through `?.` (`ot?.f(2.5)`) finds the function its field holds: the callee is typed as that function behind `| null`, which the set lookup now peels.
- 48: a row left open by a function argument's generic (`run(mv, "ab")`, `mv` holding `id`) closes from the call's plain arguments at their own types by their parameters' declared types (`u: U`), before the default `i32` is tried.
- 47: a binding that is an empty list literal argument's own open type (`bare([])`) closes at `i32[]`, the list mono builds when nothing pins the element.
- 46: the same default reaches a list of an unpinned element anywhere under a nullable, as an `if` joining `[]` with `null` bound to a `const` and handed on (`?[] | null` closes at `i32[] | null`).
- 45: a call row that binds only some of its callee's type parameters (`g(7, "zz", c)` for `g<T, U>(t: T, u: U | string, …)`) is completed before it is enqueued: a bare member of a union parameter, or the inner of a nullable one, takes the argument's type, as mono does.
- 44: a list method's callback that is a choice of generics (`xs.map(if b { idg } else { kg })`) instances each one at the element by its own signature.
- 42: an instance's call through a field or an element (`r.q(u)`) is noted as a call through a value is, and a field whose stored value is a `let` names every function its scope writes to that `let`.
- 40: D14649 closes: a template's value `if` joining a `??` arm with a bare type parameter keeps the parameter's arm, so the elaboration's pin carries the `null` mono's does (`d2915_recn_*_idret_annot`).
- 36: the same join rule covers a parameter's hole of the body being checked, an implicit type parameter (`g(a, b, c)` joining `a ?? "z"` with `b`).
- 35: a call of a module binding above its declaration (`h(5)` in a function before `const h = (x) => x`), which the checker types no row for, instances each function the binding holds at the call's own argument types.
- 33: a call through a parameter's field (`o.f("in")` under `o is H`, `o: G`) instances each function every call's argument stores at that field, a binding's by the write scan and a record literal's by its field.
- 31: a row left open only by a binding `null` alone fills (`const nn = null` handed to `id`, the null-only `_ | null`) closes at `null`, as mono builds it.
- 30: a list method's callback that may be one of several un-annotated functions (`xs.filter(if c { ub } else { us })`) instances each at the element, as a choice of generics already was; with a closed result (`filter`'s `boolean`) only the arm the checker typed had been pinned.
- 29: the write scan reads a binding of a named function's call (`const m = mk()`, `mk` returning `k`) as holding what every value the function returns holds, so a call of `m` above its declaration instances `k` at its own argument types.
- 28: a call through a parameter's element (`fs[0](3)` in `run(fs)`) reaches what each element of a list literal argument may be (`run([k])`, `k` a `let` written with `other` and a lambda), as a record literal's field already does.
- 25: a pin that widens a string literal (`T = "a"` beside mono's `string`) takes the call's literal instance when that instance is the only one of the declaration taking the pins, as a numeric literal's widening already did, unless the signature itself names a literal: there the literal instance reads atoms where the widened pin builds strings (`f<T>(x: T): T | "b"` built invalid wasm when it was allowed).
- 24: a storage pin of a value the call's narrowing proved non-null (`P[] | null` beside the checker's `P[]`, under `if xs != null`) takes the call's instance when it is the sole taker.
- 22: a `let` cell holding several un-annotated functions is one signature, as mono builds it (D3851): each member no instance reaches takes the parameter types an instanced member has (`elabCellPeers`, over the cells `elabFnLetTy` read).
- 21: a binding initialized from a field or element read reaches every function the read reaches, so a hole lambda written into a list by index and read back out is enqueued at the call's type (`elabCalleeTargets`).
- 20: a cycle of `let`s written from each other (`let d2 = d1`, then `d1 = d2` in a called local function) resolves to the union of what the cycle is written, where the write scan declined it (`cwFvTargetsOf`).
- 19: a call through a function value binds each generic member it may hold, and a hole lambda handed to that call takes its parameter types from the member's bound signature (`elabSetCallRows` → `elabArgRows`).
- 18: a call through a parameter's nested element (`v[0][1](3)`) reaches each function a nested list literal argument holds at that path (`elabListLitPathTargets`).
- 16: a lambda whose parameter holds a set of functions, when the set's root instances disagree (`f64` beside `i32`), runs at the member instances its own calls through that parameter take (`elabLamCallRep`).
- 15: a root pin row of a lambda that reads its enclosing function's open types (`(n) => n * k` under an un-annotated `k`) is enqueued under each instance of the enclosing function, where it was dropped (`elabDrainHoleRows`).
- 14: a `let` cell's hole-function members take their peers' signature when the cell also holds a generic (`elabCellPeers`).
- 13: a named function handed to `.map`/`.filter` over a list holding a set of functions is also instanced at the set's rep, or at the member instances its own calls through the parameter take, where it was instanced at the set type alone (`?apM.0=Fn#155` beside mono's `(i32) => i32`).
- 12: a nested declaration with nothing to bind whose body calls a generic (`(x) => h(x)` in `runG<U>`) is instanced per instance of an encloser that binds, at that instance's bindings, as mono builds it; only an encloser that binds nothing had one (`elabNestedPerEncl`).
- 11: a set row that took the stub rep inside a container (`{[string]: Fn#}` handed to `f(mm)` that only reads `mm.length`) takes the rep of its hole-function members' default instances, their parameter holes at `i32` (D4551), as mono builds it; a bare set value stays the stub, built as no body.
- 10 (#5256, the mono-keying lane): a list argument whose pin names another record's row of the same layout takes the argument's own type (`monoPinRowNamesOtherTy` peels list layers), so `take([...src])` is keyed at `{f: {v: i32}}[]`, not `J[]`.

- 1 (#5383): two calls of one declaration that the checker typed apart, each built at the same wider record (D14532's rep row), are one instance at that rep, which `elabRepRowInstances` enqueues; only the `@emit-error` fixture `closures/listed-hole-fn-escaping-list.vl` is still late.

A producer inside `elabRun` decides without minting types. `substTyDeep` interns the types it builds, and calling it there, even with the result unused, changed later checking: D14426's and D14532's fixtures became type errors. Compare the rows' types (`tySame`) instead.

What is left (5 files on 2026-10-31), grouped by what each waits on; lanes are on voces/vl#5255:
- 5, literal-union pins (mono-keying lane): `generic-pin-literal-union-result`, `one-literal-field-through-generic`, `litunion-nested-union-arm-module-global`, `generic-union-param-litunion-alias-arm`, `lambda-narrowed-literal-arg`. The elaboration keeps the literal (`T = "a"`) where mono widens to `string`. These wait on mono reading the elaboration's key. Enqueueing a second, widened instance cleared 4 of 8 and trapped the compiler on 51 builds, because the extra instance changes what the emitter reads for the literal one.
- 0, a nominal or branded row beside its shape: `b000498` and `flat-generic-rows-branded-bracket` closed by #5263 (mono-keying lane), which applies `monoPinRowNamesOtherTy` in the annotated arm too and counts a record with no row whose `null` fields land in a named row's nullable fields as stored in that row.
- 0, an instance mono mints that no call reaches: `lambda-open-t-unreached-instance` closed by #5259 (mono-keying lane), which no longer pins an argument whose own type is open at the default `i32`.
- 0, a set's rep that mono reads from more than the argument (coordinator), both closed:
  - `written-let-of-generic-listed-at-two-types`: a set's rep counts the functions the callee writes through the parameter (`p.push(f)`, `p.set(k, f)`, `p[i] = f`, a written record literal's function fields, a written generic at its D4551 default; `elabWrittenRep`), and a generic the calling instance does not reach but other calls instance gives the set nothing, so an unwritten set reps as the stub (D4123) as mono builds it.
  - `hole-call-generic-lambda-arg` closed: a set holding one generic runs at what the callee's own calls through the parameter bind, a lambda argument by its instance at the parameter types already bound (`elabGenericCallRep`), and the instance at that rep is reached by the call whose row it reps (`elabRepRowCalls`), so `app` is instanced inside it at each call's `T`.

**Container adoption: the emitter's name scan stays until the checker settles field types.** Deleting the scan and having the mint record node → row recovered 0 of 26 fixtures: `anonMintLiteral` mints only when `structIndexOfObj` is below 0, and without the scan the literal's checker type still holds the unsettled field (`[]`, an if-join with `null`, `Map()`). Dropping the `structRowOfObjFieldSet` fallback recovers the 26 and breaks 44: family A (21), a literal still holed at mint time, and family B (20), a concrete literal never adopted to its later declared record use (DECISIONS.md, "A record literal's row is settled by the checker"). Landed toward the deletion: a record literal's row is asked per instance (#4837, #4847, #4882); the checker adopts a concrete record literal to its declared record use at joins, `==` and call returns (#4844; 6 of 13 family-B cells run with the scan removed); the follower binds `T` to `recBuildTyOf` (#4902), and one `recValueOrigins` producer replaces `recLeafLitBinding` and `recReturnedBindings` (#4904). Residue with the scan removed: step 7 (`fieldStorageEq`), an interning gap at intersection and union destinations, module-scope hole-function records (family A2, 15), step 4 (A3, 6), an open elaboration type (A4, 2), mono cascade facts 1 and 3, and group G6.

**Step 5b is done except `rlElemKindTbl` (#4853 to #4910).** List literals take their build pair from the checker's stamped union member (s1). An un-annotated record-literal list binding delivered to a union-element list is stamped by the checker, and the emit-side destination lookahead is deleted (s2, compiler −1,182 lines). Then a per-instance rep stamp (s3), and `arrKeepsThread` loses its families (s4, #4880, s6, and s7, where `listBuildOfTy` reads `repOfTy`). `ulTaken` holds the destination list type per literal (s8). A two-shape record-union literal binding adopts through `recAdFitDst` (s9). `Map()` builds at its stamp, so `ExpCtx.mapSlot` goes (s10, D14226); a list literal or constructor builds at its stamp, so `listKind` and `listSlot` go (s11, D14225). `ExpCtx` is five fields, all step 5c's: `nulBool`, `nulLitUnion`, `nulString`, `rawNullRead` and `litUnion`. `rlElemKindTbl` waits on `repOfTy` for pinned type-parameter elements (D14227). D14228 (an inline union row minted from the re-parsed render, so a Set arm loses `mSet`) goes to step 6 or 7.

**Step 5c and 5d, literal widths (#4919, #4927, #4928, #4932, #4933).** The `ExpCtx` null family is cut (−758 lines; D8880 re-filed as silent). A numeric literal's width is its checker node type; `wantI64`/`wantF32`/`wantF64` and their swap helpers are deleted, at check fuel +1.54% on the compiler and +3.4% on diderven, 82% of which #4928 recovered. One checker predicate answers "is a number literal" (`cexLitPeel`, #4932), and `mkNumTyped` is the one constructor for a literal minted after check (#4933): the untyped-literal probe goes 1,414 → 4, each a literal typed as its union destination. Findings:
- checker literal typing leaves 53 of 5,083 probe hits in five classes: box-union operands (per-arm width, by design), return inference with no destination (class C), let/cell, hole/generic per instance, and the rest;
- a non-quiet generic re-validation (`callFtyPinCstrs` → `validateLetCstrs`) must not stamp template literals, so the writer is gated on `litPinN`;
- class C is deferred: routing `assignableExpr` through `recordRepTyAdopt` broke 42 files (33 invalid wasm), because that function does two jobs, literal width and rep stamp. Class C is invisible in bytes.

The emitter still decides some literal widths from context: (A) the literal arms of `emitExprAsI64`/`F64`/`F32` (class C, box operands, hex above `I32_MAX`); (B) about 13 lexeme-default sites, deletable once every literal has a scalar checker type at every instance; (C) six emitter-side number-literal peels that differ on the minus count.

**Literal widths, PR3 to group C (#4936 to #4945).** A literal widened into a union field keeps its member (#4936). `nodeTyAt` reads the instance record, first for literals (#4938), then for every recorded node once the instance re-check types `as?` and `is` as the template did (#4941, D14487 closed); files relying on the (A) arms go 132 → 52. Group A: the three arms build through one helper, `emitNumLitAs` (#4939), which stays, because building at a consumer's width is building, not a fallback (DECISIONS.md). Group B: `numLitWidth` is the one reader of a literal's width and the lexeme defaults are deleted (#4943). Group C: every emitter peel reads `cexLitPeel` and the i64 lexeme fallback is deleted (#4945). Open: the (A) arms still widen literals the checker records narrower than the slot, so contextual typing at every scalar delivery comes next; `dstRetypeLitArgs`'s literal doubles as `monoArgPinTyIx`'s pin and needs a pin fact of its own, after holes-close; D14488 (`cexRetype` types a negation's 2^31 operand `i32`) is a pin row.

**Literal widths: the lexeme is gone from the emitter (#4946, #4951, #4952).** D14488 closes at the checker (#4946): the last literal whose type disagreed with its lexeme's range. A residue census over 5,098 `@run` files then found seven emitter site kinds still deciding a width outside `cexRetype`/`nodeTyAt`/`numLitWidth`. #4951 deletes four of them: `numLitWidth`'s lexeme default (475 files, reached only by orphan literals that whole-arena scans met and now skip), the Unary 2^31 arm, `exprIsI64`'s 2^31 exception and `emitNumLexAt`'s promotion. #4952 types a literal delivered into a record field at its built width (`recordRepTyAdopt` → `numLitAdoptDst`). The rule is that a literal is built at the width of the position that reads it, taken from the checker's type of that position (DECISIONS.md, "A literal is built at the width of the position that reads it"). Residue: 11 files where the built width disagrees with the consuming position's checker type (binary operands, record fields, a list element, value-`if` tails, a literal bound to a type parameter, and two `:inst` cells waiting on the instance mint; some may be probe gaps); the ~90 `emitExprAsI64`/`F64`/`F32` callers, each of which must take `emitNumLitAs`'s `w` from a checker type, so that `numLitWidth` is the single width reader; the three type-level literal-union readers and two lexeme-fit value folds; and the two builders of orphan literals (`cexFoldAt`'s kept operands, `csPreMintLocs`'s `__callsite__` object).

**Literal widths: the `emitExprAs*` literal arm and the assignment copy are gone (#4956, #4964).** `emitExprAsI64`/`F64`/`F32` build no literal at the width the call names (#4956); the checker types what that arm rescued (a number newtype read by its base primitive, an operator adopting a literal-tailed join, `exprIsF32` reading a literal's width). Three width-passers remain, each named: numeric-union dispatch (`njPushSide`), an operator's operand (`emitBinOperandAs`, which covers a `const` literal read at several sites), and an instance body's literal (`emitInstLitAs`, which waits on the per-instance mint). An assignment's value is built once, at the checker type of the position that reads the assignment (#4964, `emitAsgLitAs`); the cell keeps value semantics and gets the literal at its own width, pinned by `k(g32 = 0.1)` printing `0.1`. `asvLitCopy`, which copied a literal and retyped the copy at the assignment's value type, was a second producer and is deleted, as is `castConstSettle`'s i32-when-fits retype. The `as`, union `==` and `??` residue goes through one adopt entry, `numLitAdoptDeep`, not per-operator arms. For a row learned late (a fresh record, a hole callee, an inferred arm), the build site reads the row's type; a late re-adoption pass would be a second producer and is refused. `cboxLitCopy` (D2285) is out of this scope. D14489 files the print-import pre-scan `scanPrintUse` as a second producer beside the emitter.

**One join producer (#4846 to #4898).** Loops and labelled blocks are join points of `exprJoinsArms`, the one join producer (#4871, #4881). `joinTys` has one symmetric rule: when each side fits the other and only one holds a type parameter, the join is the open side (#4855, D14000). Composite joins are recorded and re-checked for every kind (#4856). A list union joins per member (`listLandsApart`, #4867), and `joinArmFits` asks `assignableExpr` (#4895). A type-parameter-bearing list literal stays apart in a generic return join (#4846). Concrete literals still adapt across invariant containers (D4862). One predicate answers whether a statement falls through (`stmtAlwaysExits`, #4898) and one whether a tail is a value or never (`tailIsValueOrNever`, #4890).

**Step 6: `repOfTy` is the storage rep (#4841 to #4931).**
- `repOfTy` covers nullable booleans, maps, a single string literal and a single-member union, and `boxTagOfTy` is the one box-tag function (#4862). Signature tokens are read from it (#4877). It answers `null`, recursive aliases and variant membership by shape (#4894), and `repMapSlotOfTy` answers a map's slot (#4900).
- Every `let` declaration node records its bound type, including mono copies and rewrite-synthesized declarations (#4848, #4851): declaration/storage agreement goes 43.3% → 98.1%, with 0 untyped locals. An un-annotated local's cell is read from one binding type, `letBindTy` (#4908), claimed at the instance-substituted type (#4913).
- Narrowed list and map reads take the checker's type (#4841), at diderven build fuel +4.2%, because emit computes the verdict per read; a per-binding storage-rep column in the checker is the next step.
- Ref-list rows are minted and found by rep key (#4929; DECISIONS.md, "Ref-list rows are keyed by rep"). A literal's rep is built bottom up (#4931): `elabRun`'s memoised sweep writes the derived type into `nodeRepTyIx`; no reader uses it yet.
- D14509 (closed by #4954): derived values read the rep stamp for bindings, aliases and returns, but emit's ref-list and map collectors keyed rows by the element's checker name. The plan: the collectors key on the stamp, a literal's rep is built from its children's stamps, then `recReadInPlace` is deleted, with `recKept*` as the one source fact.
- The list-row reroute is blocked: its name-vs-rep fallback has three producers, inference holes closed in a name table rather than the instance type (hole pins), literals with no rep stamp, and layout twins minted on the name rather than the built type. **A hole pin is a second producer of a type.**
- The reroute moves readers first (DECISIONS.md, "The ref-list reroute moves readers first"). Slice (a) reads a ref-list row at the rep the value is built as, through `listRowOfExpr`, and deletes the RLK_STRUCT redirect (#4937; D3472, D2258, D2532, D2857 closed). Slice (b) reads a field's element row from its anonymous field and deletes the lenient name-set rung (#4940). An `#anon` row holds one rep key, so the exact-name rung is deleted (#4942); a generic body's `#anon` row still serves its instances until slice (c) mints per instance. A list delivered at two storages refuses at each call (#4944, D14510 closed); its `readonly` spelling is a capability gap (D14514). The `recReadInPlace` deletion is blocked on the call-result slot, which must take the rep its callee builds (DECISIONS.md, "The call-result slot takes the rep the callee builds").
- The rip, measured on f0344d79a over the unlanded-call-beside-call-into-wider-record matrix: deleting `recReadInPlace` alone leaves 9 silent cells; with a call-result binding taking the callee's rep (the slot patch), 6 (master 2), 0 runs lost; minting from the stamp as well gives 4 but loses D244's and D2750's runs. D14515 files the four residue kinds. Kind 4, a relayed return, closes with D14516 (#4949): `recLandingIn` follows a call of an inferred function. Kind 3 closes as D14517 (#4953): an un-annotated `Map()`'s value row is the build of its stored values, and the by-name pick is deleted. Kind 2 closes with D14509 and D14518 (#4954): a value stored into an un-annotated list or map, directly or through a binding, is the container's build, one rule over both (DECISIONS.md, "A value stored into an un-annotated container is that container's build"). The matrix runs 13 of 64 with 2 silent cells, both kind 1. D14514 is DESIGN (#4948).
- Kind 1, a call result at a hole parameter, is the c-2 ruling: an instance's type and its rep are separate facts, and `callBindAdoptRekey` is deleted as a type producer (DECISIONS.md, "An instance's type and its rep are separate facts"). It is sequenced after c-3.
- A record-literal binding is the same container as a list literal or a `Map()` (#4958, D14519 closed): its field values and `w.f = v` are its build, with no new arm. Building containers opened a read the checker types at the container's own type (`g(xs[0])`, `hs(xs)`, `g(m.get(1) ?? { f: 0 })`), which was check-clean invalid wasm; `recBuiltReadRefuse` refuses it at the read, worded as a capability gap (#4959). D14530 (a generic `id(mkcall())`) and D14531 (an unbound `[mkcall()][0]`) are filed.
- D14532 is resolved as rep flow, not as a converting copy or a pin. A licensed converting copy is refused: a record is a shared reference, so a copy changes aliasing, and the licence analysis would be a second semantic producer, already holed at field-path writes. A pin only moves the refusal. A value keeps its one rep; rep-taking destinations (a `let`, an inferred return, a callee parameter through per-instance rep) take it, and only fixed-storage destinations (a declared-record field, an annotated global, a closed function slot, an export) keep the clause-2 refusal. It is sequenced after c-2's per-instance rep flow.
- `arrLitRepElemRow`'s dual producer and D244/D2750's need are disjoint: the first is a rep stamp that differs from the literal's own type, the second one that equals it. Cut A landed (#4959): `collectAArrayLit` skips the by-name element row when the stamp's row is interned. Cut B, no name path for record elements, is not a cut: graded, it lost 7 of 6,468, because `arrLitElemName` encodes three facts the row lacks (arm adoption of an anonymous `{r: i32}` to `Circle`, literal-field widening, and hole and scope substitution), read by `emit_classify`, `emit_mono` and `wasmEmit`. It is the `arrLitElemName` destringify, D14533, and each of those facts gets one producer on the row, not a name.
- A refused delivery contributes no build (#4961), so a program the design rejects no longer gets a side-effect clause-2 refusal. Its adoptions still stand, because the pin re-check reads them and they can cure the refusal. The build table is a map (#4962): `recBuildTyOf`'s per-binding scan is gone, and the scaling-shape re-seated-record axis reads 3.971 against a bar of 5.
- **The narrowing stack.** `nodeTyAt` already carries the narrowed read type everywhere, so the emit narrowing stack's only remaining content is a storage fact: this read was cut from a wider declared rep. The checker records it once, as a node table `narrowedFromTy[readIx]` (the pre-cut storage type, `-1` otherwise). It has a single writer, at the narrowing's application; it is read by node, never by name or key; and it is reset with the per-check node facts. Rebuilding it in the emitter by walking the place is refused as a second producer (DECISIONS.md, "A narrowed read's storage fact has one writer"). The order: `indexPlaceNonNull` reads `nodeTyProvesNonNull` with no record; then `memIsNarrowed` and `narrowVariantRowFor` in lock step (D222); then `discrimRecvSet` and `coalValUnionResidualKind` through `msSetOfTy(nodeTyAt)`. The other four sites of `currentNarrowSetAt`/`currentStructNarrowSetAt` are the stack computing itself and die with `pushNarrow*`. Slices 1 and 2 landed: `twoListValueTy` no longer asks the stack, and `emitCoalesceGo`'s `narrowExcludesNull` arm was dead and is deleted (#4963, D14534, D14535); `indexPlaceNonNull` is deleted (#4965, D14536), and over 5,707 fixtures no read is proved non-null by the stack alone. The checker itself keeps two narrowing stores, the identifier declare/`noteNarShadow` and the path `npKeys`; unifying them, with an identifier as a zero-length path, is the candidate.

**Rows keyed by type (#4865, #4870, #4883, #4886, #4889).** An exact type → row alias is unconditional, except when a function field's VL type does not match (#4865, D3124). A recursive row's identity is invariant under unfolding (#4883, D3791). Rewritten `is`-test, pin and literal-union annotations carry spelling trees (#4886), and so do synthesized TypeRefs (#4889). String-keyed readers still block deleting the TypeRef names; `synth-typeref-names.md` maps each to its row key for step 7.

**Check-skip (#4906 to #4930).** Importer-demand tracking is retired: over 30-commit replays on diderven and compiler/, a pin-only interface declined 0 times. A banked question records its real asker (#4923), the callee ask banks only the summary parts a narrowing test read (#4926), and stage 0 declines only when a changed ambient entry meets a served module (#4930). Replay: 27 of 30 commits served, 0 unsound. **The replay is not a soundness instrument**: it missed a served function's call into a library moving its write, and only a fixture caught it (#4923).

**Landed after #4966.**
- Step 5 (s12): a tail assignment's return is the checker's type (#4968, #4970, #4971; D14491 closed), deleting the `fnAssignRet*` walks and columns.
- Step 6 (aa0c): each match arm reads its scrutinee through a node of its own (#4969) and the write scan notes a name only where a root reaches it (#4975, D14539), so the first-arm exception is gone; a narrowed union read finds its arm by type (#4973). D14540 (literal types not interned) and D14492 are filed; the former is a live check-clean trap, with its own lane to intern `mkLitTy` on widening (DECISIONS.md, "Literal widening is part of a literal type's identity").
- Held: the s12 operand slice (`emitBinNumeric` width from `binNumWidth`; deletes the `exprIsF32/F64/I64` ladder and `binMixHardF64`) is built but waits on 3 cells where the checker type differs from the built rep: a record-fresh call into a union destination, the array-new-default operand hole (D14492, needs mint's store), and `b000378` (an inferred-arm row, a4cf). Order: D14492 peek staleness, record-fresh, then the operand slice after a4cf.
- Narrowing slice 3 (`narrowedFromTy` by node) is not landed; scope in DECISIONS.md, "Step 6 slice 3". The checker's two stores become one in four steps: B1 decl-rooted `npKeys` (deletes `narShadowPaths`), B2 an identifier as a zero-length path (deletes `check_nar_bank.vl`), B3 the clobber ledger by declaration (deletes `narClobBind`, `narClobDecl`, `narBindDepthOf`, `narKeyBind`), B4 the narrowing scope declares go (`narIpScope`, `crFirstBank`).

**Landed after #4975.**
- Step 4 (a4cf): (γ) slice 1, `ArrayLit`/`Index` (#4977; D9722 closed, D14429 silent→loud). A list literal read by index keeps its set's tag rep and skips the element pins; the pins stay for untagged lists.
- Step 5 (s12): record-fresh (#4979; D12463, D4269, D14493, D14494): a literal keeps its own row unless a delivery names an arm, and a fresh delivery into a union is copied at the landing. D14495 (the list-element call site, `recSitesLandAt`) is filed open.
- Step 6 (aa0c): B1a (#4980; D14541 closed): each `npKeys` slot carries its root's declaration (`npRoot`, read through `npSlotOf`), deleting `narShadowPaths`.
- Literal and union-row identity: `mkLitTy` interns with the widening bit and the emitter reads a declared union's arms off the arena (#4978; D14540, D4036 closed); a union row's members are its arena types, `null` as `TY_NULL` (#4984, D14550's producer half).

**Landed after #4984.**
- Step 4 (a4cf): (γ) slice 2, `Member`/`ObjLit` (#5001; D9191 closed, D14431 filed).
- Step 5 (s12): one converting-copy producer at the `ExpCtx` delivery point, and the D81/D139 destination pin and `recNullWidened`'s i32→i64 allowance deleted (#4987); an open list element is read through one column after the pins (#4993, D14497 closed DESIGN, pins D14498/D14499), and an inferred return follows the same refusal (#4994, D14560); D14496 is filed open.
- Step 6 (aa0c): B0 is complete. The binder is the only identifier resolver (#4985, #4995), `for` variables are `LoopVar` decls (#4991, D14542 closed), and the by-name loop finders are deleted (#5000).
- Step 7 (D14551 lane): union rows are minted from the registrar's arena type (#4988, #4992), and variants have one producer at a union-row position (#4996, #4999; DECISIONS.md, "A variant is a position in a union row").

**Landed after #5003.**
- Step 4 (a4cf): c-3's one-tuple stamp collapses into the tag rule; `check_fn_tuple.vl` is deleted (#5009).
- Step 5 (s12): the operand slice, `emitBinNumeric`'s width from `numPairOpTy` over the recorded operand types (#4997), and `exprIsF32` read off the recorded type with its ladder deleted (#5008).
- Step 6 (aa0c): E1, one type store keyed by declaration (#5011; D14544 filed open, D14545 closed).
- Step 7 (D14551 lane): D14552's kind-(ii) groups 1–3 and the heap-slot readers ask the rep's shape row (#5005, #5006, #5007), and object-literal readers take the union the checker adopted the literal into (#5010, #5012), deleting `nulVariantRowOfObj` and `variantRowOfRepTy`.

**Landed after #5012.**
- Step 4 (a4cf): a container's function slots join over every write the binding makes into them, `push`, `set` and index writes (#5015); the `more than one type` and joined-map-value `unsupported map value type` refusals are deleted. D14432 was then loud through `ftNulOk`'s binding decline; #5027 deleted that decline and closed it. D14433 waits on mint.
- Step 5 (s12): `exprScalarWidth` is the one reader of the recorded type for the i64/f64/f32/v128 family, and the per-width classification ladders are deleted (#5016; D3109 closed, D14562 filed for the cost behind the moved "narrowed module bindings" scaling bar).
- Step 6 (aa0c): B2a, the checker's by-name scope reads ask the binder's declaration (#5014; D3322 closed).
- Step 7 (D14551 lane): every inline union row mints at its registrar's arena type and is found by the canon id of its flat member set (#5017; D14551 closed). A nullable function value's rep is the nullable of its own rep, and the scalar-box predicate is rep-keyed (#5018). D14434, a refutation pin for the two cell-kind producers, is filed (#5019).

**Landed after #5019.**
- Step 5 (s12): slice 1a, `exprNulKind` is the one producer for a read's nullable string or boolean kind, answering from the recorded rep, and the `exprNullableString`/`exprNulBool` ladders are deleted with `globalIsNulStringSid`, `fnRetNulStringSid`, `narrowedBoxPlace` and `ifChainYieldsNull` (#5021). The producer gaps they hid are fixed at the producer: the variant `nulstr` field, write seeds asking the destination cell, the null-narrowed read keeping its cell's kind, and `boolean|null` globals through `globalReadCellKind`. D3421 moved from a wrong value to a trap and stays open.
- Step 6 (aa0c): Q1, a member call resolves through the decl the binder records, and a function qualifies only when that decl declares a first parameter `self` (#5023; D14546, D3640 and D4196 closed). B2b, the narrowing bank, written set, narIp journal and `crWide` rows are keyed by declaration slot (`identSlotOf`, `slotLayerTop`/`slotLayerPrev`, `slotTyAt`/`slotTySetAt`), and statement rows record their declaring node in `ihStDecl` (#5024).
- Step 7 (D14551 lane): `armRowOfRecordTyShim`'s ten callers ask `repVariantShapeRowOf`/`repTyHasArmShape`, `vrIxFirst` is deleted, and `nodeRepUnionIx` is sparse (#5022; D14552 closed).

**Landed after #5024.**
- Step 4 (a4cf): ef-1a, every callback delivery of a tagged fn set (`.map`/`.filter` over a tagged list, an element argument, a `for` variable) goes through `fvaAdapt` at the callback's closed signature, and `ftHoldCtxOk` is one type rule: a read of a set holder is ok, and a delivery is ok only when the destination's type carries the set (#5032; D13783 closed, D14435 filed). The parent-kind allowlist, `ftMapNew` and the member-only-called restriction on signature-valued deliveries are deleted. No `ffKidOf` pin-read code goes yet: over the e∪f population 4 of 116 files run with the pin reads removed, against 3 on master, and the residue has named owners in the PR.
- Step 5 (s12): slice 1b, `exprNullableList`, `exprNullableRefArray`, `exprNulScalarListKind` and `exprNulClosure` are one-line reads of `exprNulKind`, and their storage ladders and the helpers only they called are deleted; a read the checker narrowed to the non-null twin of its cell's nullable ref kind recovers once, at the read (`readOwesNonNullRecover`), and the use-site recoveries decline on it (#5026; D2500, D4664 and D3705 closed, D14563 filed). Slice 1c: that question returns false on a primitive checked type before asking the storage, and `nulScalarListKindOfTy` with its `nsl` helpers is deleted (#5031; D14564 filed, a refutation pin for the `nulnone` reader). `exprNullableMap` reads `exprNulKind == "nulmap"` and `exprMap` asks `readRepIsMapCell`, deleting the five-way ladder and `globalIsNulMapSid` (#5036). `emitNulIsNullTest` asks `nodeRepIsNullRef` and `nulNicheBaseClass` asks `nodeRepIsRefKind`, deleting both six-reader ladders (#5037). `unionSoleMember` is the one producer for "a union whose members are all one type is that type", records excluded because their arms are nominal; it deletes `tyDistinctNonNullMembers`, `letIsNulMap`'s annotated-union fallback and `singleAliasMemberTyIx`'s one-member special case (#5034; D14565 closed).
- Step 6 (aa0c): B1b, a narrowing fact is keyed by a place, the root `Ident`'s declaration plus the `placeKeyOf` suffix below it (`check_place_ids.vl`); the overlay, the guard-key lists of `applyNarrows`, `ifTailApplyGuards`, `narCompactIf` and `applyArmJoins`, and the clobber rows take place ids. Deletes `npRootOf`, `symResolve` as the place-root producer, `narKeyBind`, `strListLastIx` and six `envDeclOfNameForFlow` sites (#5029; diderven check fuel 1,986,878,395, +0.17%). B2c-1, the capture-widen, call-retire and loop-retire analyses carry a declaration slot from where it originates, and the binder records which declaration each one hides (`declShadowOf`, read by `slotVisibleOf`). Deletes `envDeclOfNameForFlow`, `declare`, `crBindDepthOf`, `crLiveNames` and `crBodyReadNames` (#5035).
- #5035's check fuel is a floor, not a gain: diderven check reads 1,988,817,748, which is +1,348,553 (+0.07%) over master 9fdf6554f. That is under the B2 bar of 1,988,865,210 and above master. The by-name side is still maintained alongside the slots: `lookup*`, `scopeDepthsOf`, the frame maps, the `*Scopes` maps, `cwSoleBinderOf`/`cwFrameDeclCount`, elab_cap and the shadow walkers. B2c-2 deletes them and repays the floor, and D14544 stays open until it does.
- Step 7 (D14551 lane): the D14432 slice, a union row's admission and a map read's box take the member's rep, not its spelling (`registerInlineUnionGo` by the held type's rep, `nulScalarBoxAtomOf`, `letNulScalarBoxName` at a global and a local alike). Deletes `ftNulOk`'s map-entry decline, `mapReadScalarBoxKind`'s `mvValKind` ladder, `numLitUnionBoxKind`, `numLitBoxKindNotNumeric`, `mapReadNumLitBoxKind` and `mapTyValIsNumLitUnion` (#5027; D14432 and D3398 closed). `letNulScalarBoxName` declines unless the binding's checked type is `T | null` or open in a type variable (#5028). That is a guard, not the producer: the producer is Step 6's per-binding storage column (D14434). The nullable-variant kind and its row have one producer, `nulVariantIdxOfExpr`, with the kind as the row being `>= 0`; this deletes the `exprNullableVariant` ladder, `nulVariantOfLetIn` and `declaredNulVariant` (#5030). The row stays keyed by storage, because a type-derived row disagrees with it on three layout-twin files. Callers read that row once per site, and a call's niche row reads the callee's shape before running `cloRetValKind` (#5033).

**Landed after #5037.**
- Step 5 (s12): `exprIsNulNicheOf` is `exprNulKind == niche` and `nulRefArrayInnerSlot`'s Ident arm reads its row from the read's type (#5038). `exprNullableStruct` reads `exprNulKind == "nulstruct"`, and `exprStruct`/`exprUnion` answer a Member read from its recorded rep, deleting the six-way storage ladder, `paramNulRef` and `declaredNulRef` (#5040; D3235 and D14221 closed).
- Step 5/B2c-3 (s12): D14434 slice 1, global storage from the rep (#5044). `globalCellKindGo` reads `letCellKind`, `globalCellStructIdx` takes the rep slot, and the global ladder, `globalKind`, `emitGlobalReadRecover`'s exclusion list and twelve helpers are deleted. D3224, D3529, D3873, D4027 and D4645 closed; D14566 and D14567 filed and closed at their producers. `nulVariantIdxOfLet` stays, for `letLocalSlot`.
- Step 6 (aa0c): B2c-2a, the scope chain keyed by declaration; `lookup*`, `scopeDepthsOf`, `scopeTyAt`/`scopeSlotAt`, the `*Scopes` maps, `monoLocalDeclTy`, elab_cap's by-name columns and emit_elab's `elabLoc*` bank are deleted (#5041). diderven check fuel 1,972,235,704, which repays #5035's floor. B2c-2b, the write scan takes a read's frame from its declaration, deleting `cwFrameResolve`, `cwFrameDeclares`, `cwSoleBinderOf` and `cwFrameDeclCount` (#5043; check fuel 1,970,277,404).
- Step 6 slice 3 (aa0c): `narrowedFromTyOf(ix)`, one writer `noteNarrowedRead`, identifier reads only; `memberIsClosure` is its first reader, off `narrowVariantRowFor` (#5042). Against the emit stack: 938 files both, 1,228 column only (null and list `is` narrowings), 19 stack only (12 generic bodies, 3 stale stack, 4 emit-synthesized reads).
- Step 7: the global branch of `nulVariantIdxOfExpr` reads `globalCellStructIdx` (#5044); the fence was lifted for that one branch.
- Ownership: B2c-3 (D14434, the per-binding storage producer) moved from aa0c to s12, and so did Step 7's local and narrowed arms of `nulVariantIdxOfExpr`/`capturedNulVariantIdx`. The ae70 lane is retired.

**Decided after #5037.**
- ap2(v): a list-of-set binding delivered to a closed fn-list type stays on the pin (option x). It is a named floor with a row in a4cf's reserved range, and its deletion target is decided when the pins retire. Option (z) reopens γ's aliasing question, and option (y) is a refusal the design does not owe.
- `.map(cb)`: a set value delivered to a closed fn type is eta-expanded once, `(x: E) => cb(x)`. `fvaAdapt`'s `setSrc`/`fvaAnnotMinted` widen to every tagged set; deletion target `memberCallMapFilterTy`'s type-only assignable judge and its 2+-member-only arm (a4cf, in flight). A field-held element, `ap(rec.fs[0])` ("ref valtype with no interned shape"), has a reserved row in a4cf's range.

**Owed after #5044, repaid by #5047.** diderven `src/game.vl` fuel rose +1.22% with #5044 (6,068,651,135 → 6,142,499,883), because a global's cell kind went through `letCellKind` and the rep slot. The `bindCellRep` column brings it to 6,001,505,445, under the 6.0687e9 bar.

**Landed after #5044.**
- Step 4 (a4cf): the `.map(cb)` ruling, implemented by delivering the callback through `assignableExpr` → `fvaAdapt` at the callback's element type, at every set size (#5049). `fvaAdapt`'s `setSrc`/`fvaAnnotMinted` read every tagged set except a function named at the delivery, and `memberCallMapFilterTy`'s type-only judge and its 2+-member arm are deleted. The ap2 floor is D14437 and the field-held element is D14436. Pin-free metric still 0 of 31: two files get past `.map` and stop at the un-annotated callback, D14430's per-instance mint.
- Step 5/B2c-3 (s12): D14434 slice 2, the per-binding storage column `bindCellRep`, one fill per `LetDecl` and instance on the `globalCellKind` generation (#5047). `letBindRepClaims`, `letBindRep` and `letBindRepSlot` read it, and their per-read walks are deleted. L2 fuel −1.02%; it repays #5044's game fuel.
- Step 6 (aa0c): B2c-2c, in three PRs so far. The occurrence index chains rows by declaration, with unresolved-frame rows on one may-write-anything chain per name (D2390), and the (frame, name) pair table and frame chains are deleted (#5046). `cwBoundOnce` takes a walk, `cwSoleBinderIn` is deleted, and `LoopVar`/`ForRange` file BIND rows (#5048, the producer fix; +0.030% check fuel is those rows). `cwBindingOf(ix)` names a read's binding by declaration, and the single-binding readers lose their `(nm, fr)` parameters and `"<frame>#<name>"` memo keys (#5050). diderven check fuel 1,971,015,117 after #5050. All three are byte-identical.
- Step 6 (aa0c): B2c-2c continues. The write scan's alias-set world, `cwOccWalkAt` and `cwDeclAt` are keyed by declaration (#5052), `covarRootFrame` and `cwSameFrame` are gone (#5054), the capture writer is keyed by binding and the `crs` scope stack is gone (#5055), `crCaptureByRef` walks the declaring frame (#5057), CALL rows key on the resolved `FuncDecl` and `cwFnDeclOf`/`cwParamFrame` are gone (#5059), and MCALL rows key on the sole self-fn and `cwIxChain` is gone (#5060).
- Step 5 (s12): `bindCellRep` is the one producer of literal-union storage for lets (#5053) and for module globals (#5061; `letIsLitUnion`/`letNulLitUnion` deleted). G1 (#5058): outside every instance a call reads its instance's result.
- Steps 1 to 4 (fn sets): #5056 closes D14438. A fn set is tagged where its value is called, and `fnChoiceArmsPlain` is gone.
- Step 6 (aa0c): callee key slice C, the capture side (#5063). `crwFnHandle`/`crHandleMemo` hold binding keys, and `crInfoOf`, `crCallNodeReaches`, `crCallBenign` and `ccKeeps` match by declaration key (`cwKeySame`); `crwUseNames`, `crwBound`, `crwFnMentions` and `crwAnyWriteBase` are gone. Item 3, the emitter's narrowing read from the checker's narrowed-read fact: field-read receivers (#5070; `memIsNarrowed` and `narrowVariantRowFor` deleted, path reads recorded per instance, D1886 and D4614 closed), then closure, niche, nullable-literal-union, null-test and numeric-join reads through `readNarrowedStoreAt` (#5074; eight narrow helpers deleted, emit_start_block reads no stack). D14001 and D14021 moved from check-clean invalid wasm to trap after load: the store half is fixed and the template join is open.
- Step 4 (a4cf): D14430's mint, in four slices. (instance, call node) facts stored in `check_mint.vl` (#5064); `fnTagDecide` reads them and the emitter dispatches on the instance's set (#5067; `mintScopeFacts` replaces `mintFactOf`; D14439 filed open); a named hole callback over a tagged set is instanced at its mint scope and the eta restart retracts the first decide's tags (#5072; no second substitution helper, pins freed 1 of 31); an instance's `Param` copy takes its type from the elaboration through `scopeTyAt`, not the minted `parType` (#5075).
- Step 5 (s12): a value if-chain's rep comes from its join (#5065, D14571 closed; D14572 and D14573 filed as refutation pins); a read's `let` belongs to its declaring frame and `readLoopVarIsLitAtom` is gone (#5066, D14574 closed); the loop-variable slices S1 to S3 put for-in variables and lets on the binding storage column and delete `localLitUnion` (#5068, #5069, #5071); a slot holds its declaration in one column and `localLoopDecl` is gone (#5073).
- Step 5 (s12): a read resolves to its declaration's slot through `localSlotOfDecl`, written only by `markLocalDecl`, and the dup index, its yield memo, `localRepKey`/`localDeclClass` and `dupScanRun`'s multi-pass loop are gone; the capture-box rewrite's cell reads resolve to the cell's own `let` (#5077). `exprIsLitAtom` answers for the declaration the read names, so `identShadowMayBeLitAtom` and its fifteen twin calls are gone (#5079).
- Step 6 (aa0c): with one local per declaration, the write scan keys chains, alias sets, binding answers and fn-value sets by declaration, and `cwDeclCount` with the (frame, name) representative table is gone (#5081; D3027 closed); `crCallCandidates`' per-level cache keys on `declOutermostOf` instead of `slotNameOf` (#5083). Item 3, C1 and C2: the print, coalesce, pin, for-in, map-read, shared-field and nullable-string-list readers read `readNarrowedTyAt` (#5080, #5082; `narrowSlotTy`, `narrowSlotTyOf`, `narrowedToNullKey` and `printNarrowKey` deleted, and a narrowed map read records `V | null` through `placeReadStoreTy`). No lowering reads the emitter's narrowing stack.
- Step 4 (a4cf): an instance narrows by its own elaborated types, so the D14487 pair (the checker's block in `collectThenNarrowsRaw`, the guard in `memNarrowVariantIndex`) is gone, and `memReadCheckerAtomKind` reads `nodeTyAt` at the instance (#5078). c1: the emitter's parameter-type reads at an instance go through `paramTyAt`, whose fallback to the minted annotation is D14580's floor (#5084).

**Decided after #5044 (s12, storage gaps).** Grading the storage arms against the rep layer found 10,252 agreeing and 76 disagreeing lines. No storage arm is deleted until its bucket reaches 0.
- 45 are loop variables, which have no `LetDecl` or `Param`. They are a named floor on the slot flag and `readLoopVarIsLitAtom`; its deletion target is `LoopVar`/`ForRange` reading the `bindCellRep` column, whose binding rows exist since #5048.
- 31 lines are three producer gaps, each with a row in s12's reserved range. G1: an instance's or captured binding's held type keeps a `TyVar`; the fix substitutes where instance binding types are produced, with no reader-side resolve. G2: the softened string storage of a literal-union binding is not recorded; it is decided once in `bindCellRep` and the arm reads the column, while the binding's type stays the atom. G3: the string-versus-atom discriminant arm (a niche against a non-null atom).

**Landed after #5084.**
- Step 5 (s12): a local read resolves through its declaration's slot (#5086), the D1597 second scratch sweep and the block-hidden scope apparatus go (#5088), the `localNames`/`globalNames` columns go (#5091), and a loop value's frame finds its binding by declaration (#5095).
- Step 6, item 3: C3 deletes the emitter's narrowing stack, its replay pass and the checker banks only it read (#5089). E6/E8 (aa0c): every emitter binding resolver that holds the read asks its declaration (#5090, #5093, #5094, #5097, #5098, #5099, #5101, #5103, #5104, #5106, #5111; D14576 and D14577 closed, D14600–D14603 and D14620 filed); the operator-site callee is recorded as a declaration (#5105); loop hoist rows key on declaration (#5100); the write scan's handles, escape sets and sole-receiver records key on declaration (#5108, #5110).
- Step 6, B3: the `&&`/`||` retirement (#5112, D14621 closed), the clobber ledger (#5113), the write path's prefix scans (#5114, `plParent`) and D3307's root compare (#5115) are on place ids. B3 is done.
- Mint (a4cf): an instance's call binding starts from the template's row (#5087; D14572, D14500 closed); `paramTyAt` goes (#5092); an enclosing generic's parameter binds at the template (#5096); a set call's member arm is noted under the call's instance (#5107); a nested function's instance key reads its parent's only when it uses its type variables (#5109).

**Open after #5115.** These are the forward items, in order within each line:
- step 1 is done (#5413, 2026-11-01): mono keeps no instance row tables. The emitter reads an instance's types from the elaboration (#5352–#5404); D2684's exact keys come from the elaboration alone (#5373, #5379, #5384, #5397); the pin rows (#5405) and the hole rows (#5413) go; the collect registers, the `??`/value-`if` union names and the map-read box read each instance's type (#5423, #5426, #5433, #5439). `nodeTyPinIxOf` is deleted (#5444, #5452), and the checker banks no program-wide hole pin: the list-element rung, the `?.` rewrite over a hole receiver and the closure-list element row read the elaboration, and `holePinSet` goes with its last reader (#5459, #5464, #5473). The elaboration's hole-pin rows are its input, not a copy of a bank: a pin is noted only for the elaboration's capture, and none after `elabRun` settles outside an instance's own re-check (#5492). The per-pin re-check of parked argument demands (`argPinRecheck`) is deleted, having had no effect on any instrument (#5492). #5373 made the exact-key test exponential in a cycle of generics; #5394 fixed it as mono's Tarjan unwind did;
- step 4: (γ) by position; on 2026-10-31 the remaining pin populations were e = 116 and f = 46 after #5299 (a set member yielding no value is called through at `void`) and #5308 (a generic written into a list joins its set), most carried by `monoPinListElems`, `monoStoredSlotFnTy`, `monoPinNestedListElems` and `monoPinRecordField`; #5318 deleted the element-slot reads a tagged list no longer needs, and e is 112; `Member`/`ObjLit` landed (#5001, D9191 closed) c-3's stamp is on the tag rule (#5009), container slot writes join (#5015), callback deliveries adapt through `fvaAdapt` (#5032) and a `.map`/`.filter` callback over a set's list is delivered through it at every set size (#5049); next the remaining pin populations (e, 98 files; f, 34), then returns, (b) shape interning for nested tagged lists, and ef-1b (singleton hole fns in map values or record fields with no call through the set), each slice deleting the element-pin reads it covers, with c-2 beside it; D14435 is closed (the bound spelling `const fs = [twice, lenOf]; for g in fs` runs: `holeSlotJudge` compares no hole members' results for an element its initialiser alone fills), and D14645 is closed (a pushed element joins the binding's set, `elabFnListLetTy`), D14646 is closed (an index write is an id store into the tagged list, `ftCtxOk`), D14647 is closed (an alias's writes join the source's set, `cwListElemFnTargets`), a re-pointed `let` joins its re-pointing literals (`cwLetRepointFnTargets`), a returned list literal is read per call (`holeSlotRetApart`), with D14648 (parameters, returned lists written after, record list fields and map index writes, still judged) open; D14428 (g4) after (γ); D14431 (filed by #5001); D14433 (a map of a set through a generic helper; waits on mint); D14429 (fh1), D14430 (`ftInOpenFn`) and the in-instance tuples with slice (c)'s per-instance mint, whose facts, decide reader, mint-scope instances and `Param` types landed (#5064, #5067, #5072, #5075; pins freed 1 of 31); the emitter and mono read a call through its facts' one set (#5360, D14737 closed); D14439 (a two-member set handed to a hole parameter called at two tuples) is closed (#5262) by the checker asking the split plan (D6210) for a choice of names called at two instances, so its set stays untagged, and a set bound to a `const` first or a choice built inside a parameterised caller still refuses loudly; its forwarded spelling, D14650, is closed (#5292); the let-write join slice (the capture cells and the impure else-if nested join, D14425), whose capture-cell half (W-cap) is the tag decision's: a `let` of generics written from a closure joins its set like any written `let` and its cell holds the set's id, so 10 of the 28 "reassigned function binding" files run with the split plan off and 4 loud emit rejects run; the 18 left are hole-lambda members (W-lam) or other W shapes; slice (d); the pin callers go in the slice that closes the last cell; the fresh `let` read head with the `Fn#` mislabel; then fn_split, fn_flow_shadow and the driver loop, deleted jointly with increment 3; on 2026-11-01 at `1a72537bf` the populations are e = 121 and f = 41 (the flow-lookup cut: `ffKidOf` misses kind `e` or `f.`, counting `tests/**/*.vl` whose run rc or output moves, of 7,068), and f is not a dispatch population: its files deliver a generic function value through a record field to a destination whose type picks the instance; field-chain delivery (a record literal handed to a hole parameter as a holder of its set's ids) is parked, because the same structural record row is a tagged id at one use and a closure at another, which turns `closures/hole-fn-record-beside-declared-row-handed-to-param.vl`, `closures/hole-fn-record-field-called-at-other-param.vl` and `closures/hole-fn-record-list-element.vl` into check-clean invalid wasm; that split is a row question for the one-row work (column-G1, #5539); re-measured at `3cd2618f` (the same cut, of 7,156), e = 85 and f = 39, and the carriers, each cut to return early: `monoPinListElems` moves 37 files (29 in e, 6 in f), 9 of them through its nested-list call `monoPinNestedListElems` (the (b) population, 8 in e), `monoStoredSlotFnTy` 33 (15 in e, 15 in f), `monoPinRecordField` 8 (5 in f), and 50 of e and 18 of f move under none of the four; without `monoPinListElems` the flat 28 refuse at emit (9 `ref valtype with no interned shape`, 8 `a function value's signature is not known at this call`, the rest a generic taken as a value with no fixing call) or trap, a generic written into the list, a list re-pointed to another binding, or a lambda written over a generic element, so they are several mechanisms, not one; family W, a list literal of a generic written a closed function (5 files), is the checker's: `elabFnListLetTy` gives the list the one signature its written functions close it at and delivers each generic member there, so `monoPinListElems` moves 29 files, 8 fewer; its hole-lambda half (`pick` written `(x, _y: string) => x`, closed only by the call inside `gi<i32>`) waits on per-instance call types, family C (D14930) is filed, and family D is closed (D14931: the tag path reads a `slice` of a list of a set's ids as a holder read, so the copy holds the same set and the uncalled member is instanced through it);
- step 4, per-frame list-literal classification: landed (#5870). The emitter's frameless reads were not the gap. The elaboration had banked each instance's own type for `twice`'s literal (`{id}[]`, `{dbl}[]`), and its re-check of the binding then widened it with `fnSlotSetOf`, a whole-program answer that counts what every call hands the parameter. So the binding and every read of it took `{id,dbl}`, and that join was left on the template node. Inside an instance the widening now counts only the binding's writes (its initialiser's elements are the instance's), and a list literal of the parameter takes each instance's own arms. `listed-hole-fn-called-at-two-types.vl` runs with the split plan off. `elabParamBoundAlike`, the three `holeFnSplitAt` sites, `holeFnSplitAt`, `holeFwdSplitAsk`, the `holeFnSplit` flags and both of their readers (mono's D6210 rung and fn_split's marked-sibling ask) are gone.
- W pick (D12238's `pick` lists, run with `monoPinListElems` cut): done. (b1) (#5898): a widened list keeps its widened set and an untagged one holds closures; a widened set holding a capturing lambda never takes ids, and the elaboration mints each named member at the signature a call through the list gives it, as a candidate mono builds only when its demand reaches it (`elabListMemberSigs`, elab-foresight-2026-11.md slice (A); the check's veto is deleted). D10191's `slice(0)` copy runs through `setMemberFixedFits` and `fnWidenedListSourceSets`. (b2) (#5909): a call through an element of a module-scope list in an instance notes a mint fact on the list's widened set (`elabMintOuterSlotFactAt`), and a non-capturing lambda written at a store is its own leaf after the elaboration (`ftLambdaLeaf`), so `{pick, lambda}` is tagged and each call dispatches to the function the list holds (D15012, D15013). A lambda written inside a generic or hole function is a value per instance, so it takes neither (`ftWithinInstancedFn`): D12212 prints `4 1 4 s` with the pin, and still needs it.
- W-hand (the split-plan census's W-named group, re-minimised 2026-11-02): a written `let` of a set handed to a parameter whose function type is still open at the call. Slice 1: the call's argument check notes the hand (`fnLetOpenHandNote`), the widened `let` is kept for the decision after the elaboration rather than vetoed, and `ftScan` takes the hand as an id. Slice 2: a destination `(x: T) => R` whose `R` the set's representative member binds to its own free `T` stays open, so the hand is never noted; `R` is the join of the members' results at the instance's parameters (`holeSetCallRetOf`). Slice 2 landed (#5929), with the module-scope hand (#6010); the one W-hand file left is D15103's, re-censused at `9a45989d` in §3.2.
- W-lam slice 1: a non-capturing lambda member of a set that also holds a declared function is the set's leaf in the check's own decision, so the set is tagged and the elaboration instances each call's arm at its arguments (`elabHoleCallAt`), the producer of the per-call-type instance; mono's binding pin and the list classifier read the tag (`monoBindingAtPin`, `arrLitIsRefTpl`). A set of lambdas alone stays with the decision after the elaboration: taking it in the check's decision changed 18 files' output with the plan on, `module-binding-one-call-type-written.vl` among them as invalid wasm, and is slice 2's. Slice 2: a lambda is a lambda-only set's leaf where it is written straight into the binding (a `let`'s initialiser, a store's right side, `ftWrittenAt`), never through a `const` name; and a call made before a later-written lambda is checked is noted with the set, its arms typed when instanced (`setMemberUnchecked`). The aliases, cells, deliveries and generic bodies of W-lam's other files are slice 3.
- open: the elaboration foresees the instances a late tag would need. A set the check's decision leaves untagged is elaborated as a closure: a list widened to it holds closures whose members are instanced at the list's signature, and a call binding its value at the set's rep is instanced at that rep (`elabRowAtSetRep`), taking the parameter as a closure. A tag decided after the elaboration then finds instances it cannot retract (`mintSetPartial`), so D15053's first route stops there; a list widened to a set holding a capturing lambda is foreseen by candidates (`elabListMemberSigs`, slice (A)), where the check used to veto the widening. Until the elaboration instances what a later tag would read, such facts are decided in the check (D15053: `fnParamHandNote`, read through the calls that reach the function, `ftReachHandSets`, D15017).
- follow-up: mono's capture-cell bookkeeping reads the per-frame fact. `monoRenameGenAliasInit` still renames a nested generic alias in place on a node every instance's clone shares, because the capture-cell lookup finds the cell by that rename; the emitter reads the per-frame copy (`elabNestedCopyOnChain`, D12213). The cell lookup moves onto the same fact and the in-place rename goes.
- increment 3: the elaboration is the last step of check (#5273), and its error channel landed (#5293): an instance's re-check reports what it owes the program as a check error. The rule (DECISIONS.md, "An instance's diagnostics are the program's only when the instance belongs to the program a build keeps") reports instance diagnostics only once the template checks clean, and only for instances of the program a build keeps, so a pass the split plan (D6210) discards reports nothing, and `vl check` asks the split plan when the channel raised. `pinHoleLambdaArg` is deleted (#5320). Late demands and speculative instances are both 0 (#5279, #5282, #5285, #5297). Slice (ii) is next, the elaboration instancing a split parameter per call tuple in place of the split plan: of the 109 files the plan's forward half rewrites, 86 already elaborate clean unsplit and mono refuses them (42 through the D6210 rung), and 23 are forwarders whose parameter closes at a signature. The tag decision (`fnTagDecide`) moves after `elabRun`, fed by per-instance facts, jointly with step 4 (γ); then the D6210 rung, `holeFnSplit*`, the binding fallback, `fsPlanHoles` and the channel's kept-program filter go, and the driver loop goes with step 4. The six files that held its 16 late demands (`hole-fn-list-handed-generic-fn-and-value` with its `-at-module`, `-in-generic` and `-indexed-at-two-instances` variants, `hole-fn-list-loop-in-hole-fn-at-two-value-types`, and `named-generic-to-list-elements-two-keys`) all run with the split plan off at #5760. That build leaves 97 split-plan dependents among the `@run` files under `tests/`, each delta-debugged to a witness; by ablated shape they are: W, 32, a written `let` of functions called or delivered at two signatures, which is two mechanisms, a write inside a closure (a captured cell, step 4 (γ)'s let-write join slice) or a hole-lambda member (D14841's shape), while a plain written `let` of named generics or hole functions already runs; F, 19, a function value handed through a function's parameters (of one type parameter `F`, or un-annotated) and called at two types through two holes, the forwarders (`mid<F>(a: F, a1: F) { take(a); take2(a1) }`); M, 17, a generic returned by a function or stored in a record field and called at two types (`mk() { return k }`); H, 9, a generic handed to a hole parameter whose copies or list element are called at two types; L, 6, a list of hole functions called at two function types; 4 of D14841 (the mono lane's bundle); N, 3, a hole-function value read through a parameter or binding with no interned signature; cell (A), 2, parked until step 4 (γ)'s per-instance tag decision; U, 2 (D14843, D14886); B, 2, an alias called in a body instanced at two types; and C, 1, an impure `else if` choosing generics. F after #5765, #5767 and #5770: 4 of its 19 run with the split plan off. Branch `claude/inc3-forwarders-4` (an alias annotated with another type parameter of the function counts as a copy when the instance binds both to one closed type, `elabTyParamsAgreeAt`) runs its own witness and moves no file: the other 15 also hand one set to a function both as a closure at a rep instance and as its id at one call (`ftLateArgOfSet`, `ftCtxOk`), the rep-versus-tag duality routed to step 4 (γ), and that branch lands with the first slice that needs it. M by the check decision's first decline: 4 hold the id in a record or list field (`ftHoldCtxOk`, step 4's parked field-chain delivery), 5 read the generic in a nested or uncalled function (`ftFnOk`), 6 pass the check's decision and fail later (a maker's result delivered at two closed function types, and block-local makers), and one more declined on a function whose body ends in a declaration of the set; a function whose last statement is a declaration returns nothing, so `ftCtxOk` no longer reads that declaration as the function's value. H on master `66537ca7`: 7 of its 9 still refuse with the split plan off, as seven shapes. Its list-element shape (H-b, `take(a) { const xs = [a]; xs[0](2.5); xs[0](true) }`) is three layers: the elaboration taking a `const` list literal of a parameter, read only as `xs[i](...)`, as that parameter (no partial mark, its element calls noted on the parameter's set) gets the set tagged; `monoPinListElems` still refuses, since it reads the template type; reading the instance type there runs the witness but makes the split plan's copy `twice$1` in `listed-hole-fn-called-at-two-types` invalid wasm, because that copy pins the parameter as a closure. H-b is step 4 (γ)'s acceptance once `monoPinListElems`'s reads go; the reference is branch `claude/inc3-group-h`. Branch `claude/inc3-group-h2` binds an own type parameter that one generic fills at a call to that generic's untagged set, breaking the cycle that left `viaBoth<F>(a: F, a1: F)` bound at a closed signature (as cell C's hole row did); it runs its witness and moves no corpus file, each of whose files carries other ingredients. A named argument (`applyS(g: h)`) opts out of the tag path in the checker, the elaboration and mono alike, which leaves `hole-fn-forwarded-to-defaulted-hole-at-two-types` on the split plan. A capturing lambda called at two signatures gets one closure instance per call signature: the elaboration mints a per-tuple instance of the lambda body, each built with its environment at the lambda's creation site, which is per-tuple elaboration's own mechanism rather than the split plan's copy; ids carrying an environment would be a new runtime representation and are not taken (D14841). D14734 (a forwarder's result taking its first parameter's type) holds the corpus's last 2 clause-1 cells after #5317 (D3361, D3533); Re-censused at `6b65fcdd` (2026-11-02), after the closure-at-delivery and group L work: **63** of 5,388 `@run` files under `tests/` refuse with the split plan off (89 at the last count), and **33** filed witnesses move (30 to an emit refusal, 3 to check-clean invalid wasm); the distilled corpus has no dependent cell. Each was delta-debugged to a witness and grouped by that witness, in §3.2. Re-grouped at `a48eddb4` with the minimiser corrected to keep the split-on run succeeding (its first form kept only `vl check` clean, so some witnesses drifted into programs that refuse either way): 62 files and 25 rows, none of them invalid wasm, in §3.2. L-fwd was four mechanisms, not one; its D14842 core, a list forward of a captured hole parameter inside a nested function, needs a nested function's body instanced per encloser instance, which is design-size: re-enabling the forward note in `elabMintHandedNested` brings D14842 back silently wrong (`2 3.75 2 3.75`).
- mono: cascade fact 3 is done (#5289): `monoArgClosedPin` answers every narrowed read whose type holds no record, so the cascade serves only fact 1. Fact 1's probe found the checker's object-literal stamp names the emitter's row at 99.1% of literals that have a row, the residue being families A and B. Its order is F1a, closed naming of nominal, alias-app, map and union records (about 436 of 615 disagreeing argument sites); F1b, record storage against read; F1c, the checker's build-row fact for adoption, which is the container-adoption line below. F1a (#5303) and F1b (#5307) landed: a record-typed argument pins at its declared name and a narrowed record read at the record its place holds, taking fact-1 disagreements from 1,103 to the structural residue; F1c is the container-adoption line. Then one producer for `monoArgTyName`; Rung K (the rep cascade, `monoArgPinName`) was shadowed against the elaboration at 1,835 pin sites in 671 files: 1,170 agree on name, 534 agree on type but are spelled apart (a function's ABI key `=>…`, a record's `#anon` row or nominal against its structure), 100 are function values the elaboration keeps open (step 3/4), and 31 disagree in 8 files, 24 of them a row mono names while its type stays open. K's type is the elaboration's; what it still owns is the spelling, which goes to one naming producer of a closed type before K answers from the elaboration.
- container adoption: done. The literal-row scan is gone (#5465, #5474, #5488, #5501, #5519; #4902 had already deleted `structIndexOfObjCtxGo`'s name loop): a literal's row is its checker stamp, a field value's row is its type's rep key, a record list element is a ref element, and a list of reads out of a built container is stamped at the build (`recListLitsBuild`). No arena-side field-set match remains: a record type narrower than one declared record is stored as it, one checker rule (`recNarrowRecordOf`, DECISIONS.md "A literal names its arm", #5654) that stamps an unadopted literal at its arm and answers the last rung of `repStructRowOfTy`, `shapeNominalRowOf`, the inferred callback result's arm and a literal omitting a nullable field (#5654, #5665, #5676); the join-row scan, `structRowOfObjFieldSet` and `variantRowOfObjFieldSetK` are deleted. Reference rows are visible to every lookup by type, name or value slot (#5605, #5624, and the whole-shape index); the `sIsRefRow` skips left are the uses that need a heap or a rendering (`repRowOfTyStruct` and its canon index, whose 34 callers build at the row it names: admitting a reference row failed 958 test and cell builds, 936 of them invalid modules; the field-name index under the spelling scans and the shape-set index that interning dedups through; render and heap twins; sections, link, equality synthesis and casts) and a literal never builds at one (`structIndexOfObjCtx`). Two spelling-keyed field-set scans remain, `structIndexOfTypeName` (`shapeRowScanK`) and `variantIndexOfTypeName`'s field-set arm; they parse a rendered type name and belong to the destringify program.
- destringify (the two spelling-keyed scans, `structIndexOfTypeName`/`shapeRowScanK` and `variantIndexOfTypeName`'s field-set arm): 46 call sites on 2026-11-01, grouped by where the string comes from. (A) a type rendered on purpose, 7 sites (`criStructByFnTy`, `mintUnionFieldObjRow`, `monoDeclRecListPinName`, `anonFieldElemName`, both rungs of `structIndexOfCallExpr`, `ifExprRefSlot`), which ask `structRowOfRecordTy(ty)` instead: its own row, a row of its storage key, else the narrow record's, never a reference row. Shadowed first, the two answers differed in 29 files, all at three sites and nearly all an arm the name rung answers -1 for and the type finds a twin of; built at the type's answer, 0 files change outcome and 2 change bytes with the same output. (B) annotation text a `TypeRef` carries, 7 sites (the let and parameter annotation rungs of `emit_classify`/`emit_sig_tokens`, `annParamKindTy`'s two struct rungs, `annRetKindTy`, `annUnionSigKind`), where the resolved record answers first (`structRowOfAnnTy`) and the spelling only when the type has no row; `annRetKindTy` takes the result's type. Shadowed, the two answers differed in 76 of 17,605 files, at the parameter and let rungs; built at the type's answer, 0 files change bytes. Slice B landed with this line. (C) names only a string carries, 29 sites: the two mono spellings that predicted what the scan would answer for a pin (`monoSpelledShapeStaysAnon`, `monoSubstAnonShapes`) ask the argument's record type instead (`structRowOfRecordTy`), so mono no longer calls the scan (slice C1, 3 sites; shadowed, the answers differed in 1 of 17,616 files, `error-param-shadow-tyaram-nullable-elem`, where the scan claims the template's own row and the type names the argument's `#anon` row, and since slice B the instance's annotation readers ask that type first; built at the type's answer, that file alone changes bytes, one unused empty struct type no longer declared, with the same output); then one string table per slice, each given a type column its readers ask and its name column deleted with its last reader: ref-list and struct-field element names (slice C2, 4 sites: `rlElemStructRow`'s last rung and `structIdxOfElemNameTy`, which replaces `structIdxOfElemName`, ask the row the slot's recorded type is stored at, `structRowOfRecordTy`, and `rlElemVariantRow` asks the struct table by name alone; shadowed, the answers differed in 2 of 17,617 files, both an anonymous arm's spelling `{r: i32}` that the scan matched to a literal's row while the struct row declined the arm, and built at the type's answer, 0 files change bytes; asking the struct row by recorded type in `rlElemVariantRow` instead broke 49 corpus builds, a declared arm with a same-shape twin row losing its variant row), map-value names (slice C3, 4 sites: `nulRefMapValInnerOfTy`, the struct rung of the map value's kind, `mvValArmOfShapeTy` and the union-atom value row ask `structRowOfNameTy`, a declared struct by name, none for an arm, else the row the value's type is stored at, and the value row asks it without the arm floor, since an arm's slot keeps the arm's own row; shadowed over 17,619 files, a type answer with no arm floor differed in 776, nearly all a nominal arm the scan declines and the type finds a twin row of, which the kind's next rung answers anyway; with the floor and the kind compared whole, those 776 re-graded to 8, six `{r:null}` values the scan declined and the type stores at a declared record's row, and two function-field records the scan matched to an earlier literal's row; built at the type's answer, 1 file changes bytes, its type section reordered at the same size and output; `mvValArmOfShape`, which holds no type, stays), union atoms (slice C4, 3 sites: a union member's field lookup with its paired member type asks `structRowOfNameTy`, and the two re-lays of a variant's literal field ask the variant's own twin row by name or type, `structRowOfNameOrTy`; shadowed over 17,624 files, the re-lays agreed everywhere, and the member lookup differed in 2 files with the arm floor and 16 without it; built at the floored answer, 0 files change bytes; the member lookup with no paired types and `variantIndexOfTypeName` over a narrowed complement's atoms stay), the typed rungs left (slice C5, 2 sites: an inline-shape struct field's code and an index read's struct row ask `structRowOfNameOrTy`; shadowed over 17,625 files, 0 disagreements without the arm floor, 1 and 11 with it; built, 0 files change bytes), the pin kind of a synthesized annotation (slice C7: `pinKindOfNameTy` is deleted with the node pin column it fed, which nothing read; a pin kind is only the placeholder type of a node whose type is unknown, so `synthTypeRefTy` asks `pinKindOfName` only then; built, 0 files change bytes),  the name ladder's own recursion and the other spellings with no type (slice C8, 8 sites: `refArrShapeKindGo`, `shapeElemDeclaredStructIdx`, `nameIsRefArrayGo`, `nulStructElemNiche`, `fieldRefElemName`, `mvValArmOfShape`, `objLitFitsRow`'s element and the union-member lookup with no paired types ask `structRowOfSpelling`, a declared struct by name, else for a whole record shape the row of the type the spelling parses to, `fieldElemTyIxOfName`; a spelling past that parse's 4096-character cap keeps the field-set match, which one file's eleven-level record reaches; shadowed over 17,630 files, those 8 disagreed nowhere, while `isSName` differed in 28, `refArrElemNameGo` in 17 and `structIndexOfTypeNameTy`'s own name fallback in 3, function-field records, `{r: i32 | null}` spellings and generic shapes such as `{x: T}`, so those stay; built, 0 files change bytes), `#anon` handles (slice C6, 2 sites: `anonHandleTyIx` and `anonRowKindsAgree` take the pinned record's type and find the row through `anonPinRow`, an `#anonN` handle by name and a spelled shape by its type; shadowed over 17,627 files, they differed in 10, nearly all a record that differs from another only in a function field, which the scan answers with its layout's first row and the type with its own; built, 0 files change bytes). What is left of both scans is step 7's residue, going when the classifiers stop keying on names (coordinator ruling, 2026-11-02: no blanket rule that a typeless spelling may decline): `isSName`, whose parsed spelling differs from the scan in 28 of 17,630 files; `refArrElemNameGo`'s struct rung, 17, mostly generic shapes such as `{x: T}` the scan matches to a template's row; `structIndexOfTypeNameTy`'s name fallback, 3, and `structRowOfAnnTy`'s spelling fallback, reached only where the type has no row; `variantIndexOfTypeName` at `mvValArmOfShape`'s exact rung and over a narrowed complement's atoms, with no typed caller; and `structRowOfSpelling`'s fallback past the 4096-character parse cap, which one file reaches. Then the scans are deleted. Slice A landed with this line.
- step 5: `ExpCtx` is gone, with every `ctx` parameter (458 functions). Its last field, `litUnion`, had one reader left, a string literal at an open program record, and that literal now reads its `ctxTy`; the index store that pins a hole map's key at the instance (#5599, D14229) keeps the map's two faces on the atom key. `rlElemKindTbl` is deleted (#5294). A slot's element kind is its recorded type's rep (`rlElemKindAt`), the one slot that fell back was a template's unread `T|K` spelling, and every bound check reads `rlElemTyIx`. 5c's `ExpCtx` is one field, `litUnion`: `nulBool`, `nulLitUnion` and `nulString` went with every write to them once `nullOwnAt` read no seed (#5555). Before that, four since `rawNullRead` went: every `string | null` read (local, global, field, capture) and the fused `??` recover or stay raw by their own type at the instance (#5365, #5374, and the deletion after them); `nulLitUnion`'s value readers ask a type too, a place and an `if` join their delivery stamp (#5393) and a narrowed box read its `ctxTy`, the destination type the checker records at every delivery that holds (`nodeCtxTyIx`, per instance through `elabCapCtx`, read by `ctxTyAt`), so that field's one reader left is the bare-`null` seed; `nulString`'s string-list claim reads the literal's `ctxTy`, or a minted run's holder (`elabSpreadRunHolderOf`), and a concatenation operand clears the seed without asking it, so the three `nul*` fields share one reader left, the bare-`null` seed floor in `nullOwnAt`, whose D4671 / D14564 half is deleted (D14773: a spilled read and a mono remake note the node they copy, and `__array_new__`'s `null` fill is stamped) and whose D14640 half is deleted too (an instance-stamped `null` takes the null its closed instance `ctxTy` names), so `nullOwnAt` reads no seed; `litUnion`'s string-literal arm decides by the closed program `ctxTy` (a join's leaves and a `??` default record the join, and an instance's record that disagrees with the program's reads the instance's, D3423), and so does `emitExpr`'s string-to-atom hook (`hookTakesAtom`, never for a node an `emitExprRaw` is reading); a field value asks the row its owner is built at (`fieldOwnerStoresAtom`); the flag is still asked only by a string literal delivered at an open program record, where the instance's `??` join and its storage disagree (D3290's grid); a field no row answers and a list literal read their `ctxTy` (the hook's node with no `ctxTy` record went once an inferred return's every value, a join's inner joins and an un-annotated list literal's elements record their delivery); and `nulString` keeps only its seed half, a bare `null`'s delivery and a string-list literal (a bare `null` reads its delivery's stamp since #5117–#5119; on 2026-10-29 the two seed floors left in `nullOwnAt` were reached by 5 of 17,265 files: the D4671 null-unit cell by `types/infer-null-hole-never-filled`, `types/null-unit-heap-positions`, `unions/null-list-arm` and `unions/null-list-arm-unann`, a `null` stored in an `i32` sentinel cell that no type names, so it waits on the per-binding storage column; the D14640 elaboration floor by `generics/join-type-params-literal-union-string-null` alone, so it waits on step 4's mint; `nulString` waits on D14641), `numLitWidth` as the single width reader (every `emitNumLitAs` caller takes `w` from a checker type), the three named width-passers (`njPushSide`, `emitBinOperandAs`, and `emitInstLitAs` after the per-instance mint), the literal-union and lexeme-fit readers, the two orphan-literal builders, and the destination-bound pin fact for `dstRetypeLitArgs`;
- step 5, the nullability family: slices 1a (#5021), 1b (#5026) and 1c (#5031), the map reader (#5036), the null compare's rep predicate (#5037), the niche question (#5038) and the nullable-struct reader (#5040) are done. Census of 1,533 Ident read occurrences where rep and storage disagree: about 1,416 are narrowed reads, whose producer is `narrowedFromTy` (#5042); 22 plain lines (64 occurrences) belong to the per-binding column; 127 non-Ident lines (box-field Member, `if` joins, Index, `??`) are beyond both. The litunion pair (`exprIsLitAtom`/`exprNulLitUnion`) is on the storage column: a name reads the per-binding column (#5047), and a field, element or call read asks the one producer `readStoreOf` calls (#5601, #5611, #5619, #5646), with `nullitatom` and its de-null pair (#5668) and a call stored as its callee's lowered result (#5675). Literal-union coverage is complete: a read narrowed out of a union box is `atom2`, its member's string, by construction (0 of 1,617 box reads is an atom). The classifiers still answering a name, field, index or call read from their own ladder, by reads over `tests/` at f6c4720b: `exprListRepOf` 292,419 (G1 lane: a name, field or element read with a cell past monomorphize takes the column's answer alone (#5751), and an element of a scalar list has its scalar's cell; the ladder still answers the reads with no cell, by 2026-11-01 classifier calls over `tests/`: 1,482 asked at frame -1 by frame-blind walks (1,280 parameter reads, 189 element reads, 13 lets; per the coordinator ruling the column never answers a frame-less read from its template, so each walk moves to per-instance asks one per PR, or keeps them until step 7 deletes it; `collectA#2`'s array-intrinsic arm moved into `collectArrNewFrames`, and an element of a scalar list has a cell, leaving 264 name reads at -1, all residue by coordinator ruling: 249 in `fieldClosureFeOfRecv`'s hole-parameter arm, which resolves each caller's argument at -1 for want of the caller's instance frame and as its recursion stop, so it moves with the call-fact / caller-instance work; and 15 in `collectAArrayLit`, whose five frameless asks of a body's list literal stay until step 7 deletes it), and 206 parameter reads asked at a hole or generic template's own frame (`function add(a, b)`, generic lambdas), which go with those walks), `exprScalarWidth` 214,564 and `exprTyIsRecord` 143,170 (type readers, which stay), `exprIsNulNone` 202,775 (a nullable cell, the error-channel lane's after `exprString`), `exprUnion` 132,815 (the union box, the error-channel lane's), `exprVariantIndex` 109,900 (its call and index arms are step 7's). Open: the `nulnone` reader (D14564), parked on `narrowedFromTy` too, because a null-narrowed read's answer is its cell kind, the rep of the type before narrowing; and the variant kind, which has one producer since #5030 but stays storage-keyed and moves with Step 7's Ident ladder. `exprNulStrArray` asks about element nullability and is not in this family. D3421 (clause 1) now traps on `ref.as_non_null` because its read is recorded as `string`;
- step 5, the record line (DECISIONS.md, "A fresh record converts at one delivery point"): the converting-copy producer, `recNullWidened`'s allowance and the D81/D139 dst-pin are done (#4987). The operand slice (#4997), `exprIsF32`'s recorded type (#5008) and the i64/f64/v128 family onto `exprScalarWidth` (#5016) are done. Three of `exprScalarWidth`'s four ABI facts are gone: an open parameter read reads its recorded type (#5286); a `??` is built and widthed at its recorded type, `coalResultTyOf` answering that type and, before the instances are built, the elaboration's, so the hole pin and the program pin bank no longer feed it (#5291; one file moved, `coalesce-hole-default-at-pin.vl` building the D3580 box, and D3415 re-filed as a loud emit refusal); a function-value call left open reads its elaboration, and `cloCallResultKind` is deleted (#5300). The fourth, a direct call reading its callee slot's result, is kept: a direct call's width is the result its callee instance was built at, which the call node's program-wide recorded type is not. Deleting it was re-measured on 2026-11-01 after step 1 and after D3094's fix (#5468): D3109, D9765 and D13860 run without it, but four more oracle fixtures (`hole-fn-choice-open-param-results-agree`, `numeric-join-held-back-through-a-wrapper`, `hole-fn-list-handed-to-hole-param-tagged`, `hole-fn-nested-list-handed-open`) go to invalid wasm, each a call whose recorded type disagrees with its instance's result (#5508). `numeric-join-held-back-through-a-wrapper.vl` has a slot widened to `f64` against the apart join (D3494, D3495). `hole-fn-return-join-members-agree.vl`, `hole-fn-return-let-handed-members-agree.vl`, `hole-fn-choice-open-param-results-agree.vl` and `hole-fn-nested-list-handed-open.vl` call a function returning a set of hole functions, whose result the elaboration leaves open or `void` (step 4). `hole-scalar-is-nullable-record-pin-runs.vl` has a slot of `i32` against a recorded `i64`. D14562 is the cost row for the "narrowed module bindings" scaling arm; D14495; D14496 (an un-annotated parameter fed a call into a wider record, 2 silent cells); D14492's operand hole waits on mint's store; The coercion records: the list copies (ref and scalar) lower once at `emitExpr`'s hook and every per-position `emit*WidenSite` call is gone (#5629, #5717); the hook dispatches on `CoerceKind` (`listCopy`, `fnClo`, #5743; `mapUnbox`, `mapRetag`, `recCopy`, #5750) under one `coerceHeld`. Not yet a kind: the union box (`emitUnionBoxArg`/`emitUnionCoerce`, about 45 sites), the variant arm (`emitVariantCoerce`, 9) and the scalar width (`emitExprAs*`, about 90). The union box cannot read `ctxTy`, measured on 2026-11-01 at `b9ec5f1c` over 7,155 `tests/**/*.vl` files: at a box site `ctxTy` is often the arm the value adopts (`{r: i32}` against `Shape`), not the union, and 185 files reach a box site with none. A dedicated record of the destination written at `assignableExprIn`'s seam beside `recordListCopy` agrees wherever it is written. It is missing at a box of a non-box value in 1,087 files, because those deliveries never reach the seam: a list literal's inferred union element, a value `if`'s arms, a record literal adopted into an alias arm, a map index store. It disagrees in 44 more files, where a program-wide record was overwritten by an instance's re-check or was a hole. So the union-box kind needs its record written per instance (as `elabCapCtx` does for `ctxTy`) and at those four producers before any site can go; that record is the box-destination record (`boxDstTyAt`, `nodeBoxTyIx`/`elabCapBox`, #5764), graded by an armed shadow at every box site against the union the site names (`box_dst_shadow.vl`): with the loop exits, carried mints, `??` operands and set-member calls written (#5772, #5778, #5805, #5811) it is missing in 39 deliveries over 24 files, and an order-only difference is an agree, a box's tag being its member's alone (#5816). A site reads it through `unRowOfRecordTy`, the registry row the record's key reaches (through `null`-position and widened-literal keys), never a render of the type: the emitter keys union rows by spelling, and `tyToEmitName` or `unionSpellingOfTy` as the name lost a build and minted invalid modules (#5820). `emitConstCellInit` reads it, keeping its own union as the fallback (#5820, #5824), and so does `emitAssignIdent`, whose fallback 6 files still reach (4 `i32|null`, 2 `string|i32`). The global assignment, the index store and the push read it too, their fallback reached in 4 files (#5852). **Deleting a site's derivation needs type-keyed rows (step 5 → step 7).** Graded over every box site on 2026-11-02, a non-box delivery whose record reaches no registered row is 204 deliveries over 55 files: 132 whose record renders `""` (mostly map unions and top-level records; #5861 closed the 10 that were open type parameters), 19 record-arm unions (the acceptance cells above), and about 50 unions with no row until a site boxes into that spelling, which mints it then, so no key from the type finds it beforehand. A row minted from the type at the delivery site would make the emitter a second row producer and is not built; the registry minting each row from the record's type before emit is a step 7 slice, every mover graded. A delivery with no record at all (39 over 24 files) is the producer's: literals in generic instances the instance's re-check never stamps, guard arms a rewrite mints after the elaboration (`?.`'s `null` and read; their guarded node's type is open at the template, so a carried note alone leaves the record open in a hole instance), a bare `as`'s propagated `null` (delivered to the enclosing function's result, which no checked node stands for), and set-member arms sharing argument nodes (the bundle and tag work). **Open: a nested delivery has no record.** A box a site builds inside its own lowering is delivered at no node the checker stamps: 194 deliveries over 54 files on master at `72ebb1a32` (#5893's branch read 134 over 40), which the shadow skipped until #5893; classified by the phase that minted each node in the inventory below. Its producer is the outer delivery's, stamping the union the outer box delivers each inner value into. **Open: post-check node minting moves before the elaboration.** The first three share one producer fix: the rewrites that mint nodes after check (the `?.` guards in `drwOptGuard` and `recUnionOptRead`, the bare `as` miss, and the instance-literal stamping) run before `elabRun`, so each minted node gets its instance records. A reader-side note does not substitute for it: one from a minted guard arm to its guarded node reached 3 deliveries and left about 15 records open in hole instances, where nothing minted after the elaboration has an instance key (tried and reverted, #5869). Step 7's acceptance cells for deleting that fallback, where no key reaches a row: `generics/union-member-generic-application-mixed.vl` (`type UAlias = BoxI | Tag`) and `unions/inline-arm-discriminant-narrow-neighbours.vl` (`type Mixed = Circle | { kind: "rect", w: f64, h: f64 }`), whose record-arm rows are keyed by record name, so only a shape match reaches them (D12465's question), and `unions/litunion-nested-union-arm-module-global.vl` (`K | (L | i32)`). A call through a set shares its argument nodes between the member arms, so one argument is delivered at each member's parameter and a per-node record holds only one of them; that waits on the bundle and tag work; **The `??` joins read the record (#5937, #5955, #5960, #5967).** Every `??` site that boxes (the nullable-ref, nullable-boolean, nullable-map and map-read joins) takes its union from its default's delivery (`boxDstNameAt`: the record's row, else an already-boxed default's own union), and each site's own derivation is deleted; a `??` chain's re-associated inner link reads its default's record through `tyCarrySrcNote` (#5955). The classifier that decides whether a `??` result is a box (`coalesceResultUnionName` and its readers) is already a function of the node's checked type, every rung reading `nodeTyInOf`, so it has no site derivation to move: probed over 4,340 `??` files on 2026-11-03, "the checked type's spelling when a value union, else its row, at two or more non-null members and a union-box rep" differs from it in 3, all one member set reaching two rows ([D15081](inventory/D15081.md), step 7). The left operand's box record is not that fact: it differed in 145, as a delivery record (the result's destination, a chain's inner join, or none at a generic pin).
  - **Post-check node minting, inventoried (design, 2026-11-02, at `72ebb1a32`; slice 1 buildable).** Measured with the box-destination shadow armed in named mode over all 7,235 `tests/**/*.vl` (5,906 build; modules staged as the host stages them), each `no record` delivery labelled by the phase that minted its node: a node-count mark after check, after the elaboration and after each emit pass, `late` being emission itself. The population is 99 top-level deliveries over 38 files and 194 nested over 54. Of those, 132 are on nodes the check itself built, whose record the instance re-check never writes; that is the producer's stamping, not this item. The other 161 are on nodes minted after `elabRun`, so no instance key reaches them. Each minting site, its witnesses, and where its rewrite moves:

    | minting site | pass | node | top / nested | witnesses | moves to |
    | --- | --- | --- | --- | --- | --- |
    | a written capture's cell read | `captureBoxRewrite` | `cell[0]` read | 34 / 34, 6 files | `closures/capture-union-closure-write-member-grid.vl`, `-narrowed-read.vl`, `closures/capture-nullable-closure-null-write.vl`, `closures/capture-by-reference.vl`, `soundness/call-ends-narrowing-recheck-runs.vl`, `simd/captured-reassigned-vector-cell.vl` | the checker, which already knows a capture is written: it mints the read's cell twin and checks it at the read's type, and the rewrite substitutes the twin |
    | `?.` guard arms: the plain read a non-null receiver folds to, `recUnionOptRead`'s per-arm reads, `drwOptGuard`'s `null` | `dispatchRewrite` | `Member`, `NullLit`, `Index` | 5 / 31, 5 files | `generics/hole-optional-member-read.vl`, `-record-union.vl`, `unions/shared-nullable-scalar-field-read.vl`, `maps/optional-chain-get-nullable-map.vl`, `lists/map-nullable-union-arm-result.vl` | the `?.` check: the guard is minted once per node and checked as the node's value, so each instance's re-check stamps it; the fold stays an instance's choice between two checked nodes |
    | operator dispatch and narrowed re-reads (`drwWalkIndex`/`drwOpCall`, `drwNarrowedClone`) | `dispatchRewrite` | `Ident`, `Call` | 8 / 7, 6 files | `std/idtable-basics.vl` (and the three other `idtable` files), `maps/untyped-record-literal-stored-beside-narrowed-get.vl`, `simd/captured-reassigned-vector-cell.vl` | the check that resolves the operator (`opDeclAtNode`) or the narrowing: it mints the call or the re-read there and checks it |
    | a value-position assignment's spilled tail | `dispatchRewrite` (`spillTail`), `loopValueRewrite` | `Ident` | 1 / 3, 2 files | `conditionals/tail-if-assignment-value.vl`, `loops/loop-value-nested-tail.vl` | a desugar before check, so the temporary is a checked binding |
    | a bare `as`'s miss, the enclosing function's `null` | emission (`numCastNullNode`) | `NullLit` | 3 / 13, 6 files | `numerics/as-cast-exact-trio.vl`, `as-cast-u8-trio.vl`, `as-cast-hole-call-result-trap-null-exact.vl`, `as-cast-integral-operand.vl`, `prefix-op-binds-tighter-than-as.vl`, `generics/as-type-param-pin-exact.vl` | the `as` check: slice 1 |
    | a record literal's omitted nullable field (D2223) | emission (the variant literal's field loop) | `NullLit` | 0 / 18, 1 file | `unions/tagged-arm-nullable-field-literal.vl` | the check that adopts the literal into the arm: it mints the field's `null` and delivers it to the field's type |
    | a mono copy with no source link | `monomorphize` | `IfStmt`, `Call` | 2 / 2, 2 files | `generics/numeric-join-held-back-through-a-wrapper.vl`, `literal-unions/coalesce-hole-call-litunion-join.vl` | not a move: the copy needs its `nodeSrc` link, so the instance key reaches the template's record |

    The rule every row follows: a rewrite whose node a box site reads is minted where the checker decides it, and checked there, before `elabRun`, so the elaboration's re-check of each instance writes the node's records like any other node. The emit-time rewrite then substitutes the checked node and mints nothing. A carried note from the minted node to the one it replaces is not the move, for #5869's reason (tried, reverted). The site lists come from the shadow's labelled rows, and the producer of each was read off the rewrite; the slice that moves a row confirms it by the row's witnesses going to `agree`.
  - **Slice 1: the bare `as` miss.** One producer, no instance choice, and every witness delivers to the enclosing function's own result. The `as` check, where it proves the enclosing function returns something `null` fits, mints the miss's `null` once per `AsExpr` (`asMissNull`, a node table reset with the per-check node facts). It delivers that node exactly as `return null` would be delivered, so every instance's re-check writes its box record there. `numCastNullNode()` and `emitHoleNumCastMiss` read that node, and a propagating `as` with no minted node is an internal error. **Acceptance:** over the six witnesses the shadow moves 16 deliveries (3 top, 13 nested) from `no record` to `agree` (or `agree up to spelling`), none to `disagree`; a new case in `tests/vl_box_dst_shadow_test.ts` pins it; the byte sweep reads 0 movers outside the six, and the six print as before, since no box site reads the record yet. **As built (2026-11-02):** the cast check delivers the minted `null` (`castMissNullDeliver`, check_demands.vl, through `recordCtxTy`) at three places: the numeric arm, an instance's re-check of a type parameter pinned at no number, and the replay of a hole parameter's parked call (`g(x) as i32`), which delivers to the callee's annotated result. The parked witness also needed its mono copy linked: the four `AsExpr` re-mints in emit_mono.vl now note `nodeSrc`, as the `BinExpr` and `Unary` ones do, which is the inventory's mono row for this node kind. All 16 deliveries read `agree`, and over the 2,685 test and corpus files that spell an `as`, emission never reached a cast without a minted `null`.
  - **Slice 2, as built (2026-11-02): a record literal's omitted nullable field.** The check that completes the literal mints the field's `null` once per literal and field (`omitFieldNull`, keyed by the literal node and field name) and delivers it to the field's type through `recordCtxTy` (`omitFieldNullDeliver`). It does so at two places: the field-wise adoption of a literal that leaves a nullable field out (`assignableObjLitFields`), and the completion of an empty `{}` into a record whose fields all admit `null` (`bareBraceDeliver`, outside a speculative member trial). The variant literal's field loop reads that node, through `nodeSrc` for a mono copy, and a field with none is an internal error. The 18 nested deliveries read `agree`, a shadow-test case pins it, and the byte sweep reads 0 movers over 17,703 files. The empty-`{}` path was found by that sweep, with the internal error as the probe: `objects/empty-object-all-nullable-runs.vl` reached it before the second delivery site was added.
  - **Slice 3, as built (2026-11-02): a written capture's cell read, linked rather than moved.** The table's row said the checker would mint the read's cell twin. Built instead: `cboxWalkIdent` notes the cell read `c[0]` (and a vector cell's unwrap) as a copy of the name read it replaces (`nodeSrcNote`). The cell read is that read respelled. It delivers the same value to the same place, so its records are the read's, and `nodeSrc` is exactly that relation. `captureBoxRewrite` runs before `monomorphize`, so a mono copy chains back to the template's checked read, which each instance's re-check stamps. This is unlike #5869's `?.` note, where the minted arm is another node with another type, whose guarded node is open at the template. The capture analysis that picks the boxed bindings (`cboxByRef`, `cloUnboxPick`) is an emit decision over lifted frames, and moving it into the checker is not needed for the record. 30 top-level and 30 nested deliveries over five files read `agree`. The sixth file, `simd/captured-reassigned-vector-cell.vl`, keeps 18 and 18: a vector cell's stores box each value into `v128 | null`, an element union the rewrite invents, so no checked delivery has that destination, and the row waits on the vector cell being a rep rather than a union.
  - **Slice 6, as built (2026-11-02): an optional call's guarded call, and the mono row found to be no link gap.** `p?.f(args)` becomes `if p != null { f(p, args) } else { null }`. The call node stays as the guard's non-null arm, and its type is restamped to the callee's result. When the call's own `T | null` value is delivered unchanged (a `??` operand, a binding), no coercion is recorded on it, and the arm's box into the guard's union read no record. The call's check now records its own type on it (`recordCtxTy`), as slice 4 does for a read's parts, and a later delivery's stamp overrides it. Over all 7,254 `tests/**/*.vl` the shadow moves 36 nested deliveries over 8 files (`expressions/optional-call-guard.vl` and seven `closures/` files calling a nullable record's function field) from `no record` to `agree`; no other class moves, and a shadow-test case pins it. The mono row is not a missing link. The `Call` copy in `literal-unions/coalesce-hole-call-litunion-join.vl` already links to its checked call, which has no record. mono's `if`-chain rebuilds now link their copies (`monoIfChainRebuild`, `monoIfChainRebuildPinned`), but `generics/numeric-join-held-back-through-a-wrapper.vl`'s template `if` has none either: at `A = B = i64`, `if k == 1 { b } else { 5 }` is an `i64 | i32` join that the emitter boxes into the result, and the instance's re-check delivers it as the same union, so it records nothing. Both go with the deliveries on check-built nodes.
  - **Slice 7, as built (2026-11-02): an element beside a spread.** A list literal holding a spread (`[...xs, 5]`) is checked by its own arm (`checkSpreadArrayLit`), which joined the element type but delivered no element to it, so an element boxed into an inferred union element read no record. Each element beside the spreads is now delivered to the joined element type (`recordCtxTy`), as the plain list literal's are. Over all `tests/**/*.vl` the shadow moves 11 top-level and 10 nested deliveries over 5 files (four `lists/spread-*` files and `arrays/nested-list-literal-union-element-runs.vl`) from `no record` to `agree`; no other class moves, and a shadow-test case pins it.
  - **Slice 8, as built (2026-11-02): a tail value `if`, and a loop's exits, at their own join.** Two values whose own join is a union reached a box with no record. A generic's tail value `if` (`if k == 1 { b } else { 5 }` at `A = B = i64`, an `i64 | i32` join) is boxed whole into the result, while the instance's `adoptRetLits` stamped only its arms; it now also stamps each value `if` the body's tail ends in (`tailValueIfs`), and the mono copy reaches that record through slice 6's link. A loop's exits are boxed into the loop's own `T | null`, but only a union delivery of the loop stamped them (`boxExitsStamp`), and a `??` over the loop delivers a plain `T`; `lpPopResult` now boxes each exit of a used loop into the loop's own join, and a later delivery's stamp overrides it. Over all `tests/**/*.vl` the shadow moves 2 top-level and 2 nested deliveries over 2 files (`generics/numeric-join-held-back-through-a-wrapper.vl`, `loops/loop-value-interpolation.vl`) from `no record` to `agree`, and no other row moves; the shadow-test case moves 6 and 6. Open beside it: `a ?? d` over a type parameter at a non-null instance (`generics/coalesce-join-at-list-pin.vl`, `type-param-coalesce-folded-interpolation-hole.vl`), where the checker's instance result is the operand's type and the emitter builds the template's kept-apart join, a disagreement about the join rather than a missing stamp.
  - **Slice 10, as built (2026-11-02): an annotated function's tail value `if`.** `function pick(k: i32): i32 | f64 { if k == 0 { 3 } else { 2.5 } }` boxes the whole `if` into the declared result, while the tail check (`fnTailGradeAgainstRet`) graded each arm and stamped nothing on the `if`. It now delivers the `if` to the result too (`recordCtxTy`), before the arms are graded, so an arm's own stamp stands. Over all `tests/**/*.vl` the shadow moves 1 top-level and 1 nested delivery (`generics/numeric-union-null-test.vl`) from `no record` to `agree`; no other row moves, and a shadow-test case pins it. Of the singletons left, `unions/arm-through-container-field-shape-row.vl` (`[{ r: null }]` stored at a wider record) is the by-rep storage family, and `unions/value-union-niche-survivor-delivery.vl` (`m["k"] ?? "N"` over a narrowed map read, boxed at the map's storage union `string | i32 | null`) is a narrowed read's storage, the same question.
  - **Slice 9, as built (2026-11-02): a generic `??` at an instance is boxed at its pin's join.** A `??` whose left operand is a type parameter is typed at the template as a result hole (`HD_COAL`). The pin reads that hole as `coalJoinAtPin`'s join, and the emitter (`holeCoalReadAt`) builds that join, `i32[] | i32` for `a ?? 5` at `T = i32[]` (D10600). The instance's re-check types the same node at the instance's own left operand, `i32[]`, a union of nothing, so the box of the operand into the join read no record. The template now keeps each such node's result hole (`coalNodeHole`, a node column), and an instance's re-check closes it at the instance's bindings and boxes the left operand there. The instance's own result type is unchanged. Over all `tests/**/*.vl` the shadow moves 5 top-level and 5 nested deliveries from `no record` to `agree` and 3 top-level and 9 nested from `disagree` to `agree` (where the instance's own result had been the record, `string` against a `K | i32` join), over 5 files: `generics/coalesce-join-at-list-pin.vl`, `-at-literal-union-pin.vl`, `coalesce-arm-in-else-if-chain-at-literal-union-pin.vl`, `type-param-write-union-local-reads-at-pin.vl` and `literal-unions/coalesce-hole-call-litunion-join.vl`; no class moves the other way, a shadow-test case pins it. **Follow-up, as built (2026-11-03):** the instance's re-check now also types the `??` node at that pinned join, the type the pin gives its callers, so the call site, the instance's node and its box record give one answer. Emission moves in 1 file, `generics/coalesce-join-at-list-pin.vl`: an un-annotated binding of the `??` (`const r = a ?? 5`) holds the `i32[] | i32` box where it held the bare list and boxed it at the return, with the same output. The shadow moves 2 nested `disagree` to `value already a box`.
  - **For step 6, the by-rep storage (family 2 of the no-record table, 2026-11-02).** A write into a field whose storage is a container's wider rep boxes into the storage rep, while the checker types the receiver narrower: `b.f = 9` where `b` is checked `{f: i32}` and stored as `J = {f: i32 | null}` (D14810's by-rep binding). The box destination is the storage rep, which no checker stamp knows. Witnesses: `soundness/built-container-handed-to-annotated-list-param-runs.vl`, `-read-returned-by-rep-bound-runs.vl`, `-read-returned-by-rep-runs.vl`, `-read-coalesced-with-literal-handed-by-rep-runs.vl`, `soundness/call-built-wider-handed-to-annotated-field-param-runs.vl`, `returned-binding-built-wider-handed-to-hole-param-runs.vl` and `maps/unannotated-map-stores-literal-and-call-built-at-wider-record.vl`. The record belongs to the rep producer that decides the storage (D2996's fresh-record widening), not to a delivery stamp.
  - **`?.`'s per-instance fold (design note, 2026-11-02).** The row's three mints differ from the slices above in one way: whether to guard is an instance fact. `drwWalkOptMember` folds `r?.f` to the plain read `r.f` when the receiver's type excludes `null`, takes `recUnionOptRead`'s per-arm reads over a record-union receiver, and otherwise keeps the node. `drwOptGuard` wraps an optional call in `if r != null { call } else { null }`. All three run in `dispatchRewrite`, before `monomorphize`, once over the template. In a hole function the receiver's template type is open, so the template is never folded. In an instance whose receiver cannot be `null`, the guard's `null` arm would be delivered into a non-null result, which is why the fold exists at all. The move therefore has two halves:
    - **Mint at the check, once per node, as the node's own alternatives.** The `?.` check mints the guard form (the `!= null` test, the guarded read or call, and the `null` arm) the first time it sees the node, and checks it on every check of that node, the elaboration's re-checks included, so every minted part has its records per instance. That is the node-table pattern slices 1 and 2 use: minted once, reused by every later check, and classified as a node column for probe rollback. A record-union receiver's per-arm reads are minted per arm name and checked only in the re-checks whose receiver union has that arm, since the arm set is the instance's.
    - **Choose at the instance.** The fold is decided where the instance exists: mono's clone of a `?.` node asks the instance's receiver type (`elabNodeTyAt`) and clones either the checked guarded read alone or the whole checked guard. Each clone is noted as a copy of its pre-minted part, so the instance key reaches the records written for it. `dispatchRewrite` keeps the choice for a node no instance copies, from the program-wide type as now, but substitutes the pre-minted parts instead of minting.
    - **Acceptance** for the slice that builds it: the row's 5 top-level and 31 nested deliveries read `agree`; `generics/hole-optional-member-read.vl` and `-record-union.vl` print as before, with an instance that folds and one that guards in each; no `disagree`; 0 byte movers. **Cost to measure:** every `?.` over a receiver that may be `null` checks a second node, so the slice reads check fuel on the compiler and on diderven against the base.
    - **As built (2026-11-02):** the first half as written, and the second half found unnecessary. The `?.` check mints a read's parts, its default `null` and its field read (`optReadParts`, per `OptMember` node), and so does the check of a `m?.get(k)` call, whose parts are the default `null` and the index read `m[k]`. Each check stamps them with the read's own type (`recordCtxTy`), so a guard's arms take the guard's join, as a value `if`'s do. `ctxTyStamp` and `boxTyStamp` stamp them again wherever a delivery stamps the read, so a delivered read's arms take the delivery's union. The rewrites (`drwWalkOptMember`'s fold, `recUnionOptRead`, `r?.f ?? d`, `drwOptGuard`'s `null`, the guarded map read) substitute the registered parts and mint only for a node no check saw. The fold choice did not need to move to mono. `recUnionReadTys` already asks every instance's receiver (`elabNodeInstTys`) and guards when any instance needs it, and every instance's re-check stamps the parts, so a hole instance's guard reaches its records. The row's 5 top-level and 31 nested deliveries read `agree`, none `disagree`, and the five witnesses print as before. Check fuel on the compiler is +0.077% (49,670,575,235 → 49,708,643,634); diderven is not in this checkout to measure.
  - **Slice 5, as built (2026-11-02): the dispatch and tail-spill rows were one producer, linked rather than moved.** The table's operator-dispatch row is mislabelled: labelled by name, every one of its `dispatchRewrite` `Ident`s is `spillTail`'s `asg#<n>#v` read, not an operator call or a narrowed re-read. A function with no annotated result whose tail `if` ends in a field or element write (`std:idtable`'s `set`, which ends `if was == null { self.length = self.length + 1 }`) yields the written value or `null`, and `spillTail` replaces the write with spills and a read of the value. That read is the write's value delivered at the write's place, so `spillTail` notes it as a copy of the write (`nodeSrcNote`), whose records each instance's re-check writes. The loop-value row is the same relation: `lvRewriteAt`'s read of the carrier `$lv<n>` is the loop's value, noted as a copy of the loop node. Over all 7,254 `tests/**/*.vl` the shadow moves 8 top-level and 9 nested deliveries over 7 files (the four `idtable` files, `maps/untyped-record-literal-stored-beside-narrowed-get.vl`, `conditionals/tail-if-assignment-value.vl`, `loops/loop-value-nested-tail.vl`) from `no record` to `agree`, and no other row moves; a shadow-test case pins it. `simd/captured-reassigned-vector-cell.vl`'s dispatch `Call` is the vector cell's invented `v128 | null` union, slice 3's open row. Left: 55 top-level and 95 nested deliveries with no record, the two mono copies with no source link among them; nearly all the rest are on nodes the check built, which is the producer's stamping.
  - **Later, low priority: `?.`'s fold chosen per instance.** Slice 4 decides in one place, from the elaboration's instance types, and guards every instance when any one needs it. That is correct; an instance whose receiver cannot be `null` pays a test it does not need. Folding per instance is an optimisation, built when a measurement asks for it.
- step 6: c-2 is done (#5295): an instance is typed at the checker's binding and its parameter stored at the rep row its argument is built at (`callBindAdoptReps`), so `callBindAdoptRekey` is no type producer and D8681, D14426, D14496, D14513 and D14515 close; D14530 is closed (#5309), D14531 and D14495 (#5314), and D14532's hole-callee part (#5321); D14532's annotated non-generic callees are instanced by the rep their argument is built at (coordinator ruling, extending c-2); mono's minted binding annotations go one at a time: `monoCoalBoxBindAnn` (#5310), `monoStoredMapAnn` and `monoPushedListAnn` (#5323, the collector's frame walk mints what an instance closes), `monoApartJoinAnn` (#5333, emit reads the instance's union and stops comparing template types), `monoTpJoinBindAnn` (#5340, the re-check binds a kept-apart type-parameter join at the pin, `letKeptJoinAtPin`) and the unfed returned-local threading (#5347); their row registrations (`monoApartJoinRow`, #5359, and `monoTpJoinBindRow`) are gone too: `monoRegisterElabJoinRows` reads them off the elaboration's per-instance types (D4046). Left: `monoHoleListLitAnn`'s let use (D2898, the literal build's stamp, collector lane), `monoLetOwnCopy` (nested tagged lists, step 4), and step 4's function-list and map-value pinners; then D14532's rep flow to rep-taking destinations, with D14530 and D14531; the `recReadInPlace` deletion is done (D14512 and D14644 closed; a call relayed through an identity or a returned binding is built at its kept record in every slot, D14741 open), and the stamp mint without its D244/D2750 losses is left; the `arrLitElemName` destringify (D14533); the collector mint and the literal build together, with slice (c) minting each instance's `#anon` row; a per-binding storage-rep column (B2c-3, s12), which is D14434's one cell-kind producer for `globalCellKindGo` and `letBindRepClaims`: global storage reads the rep since #5044 and the `bindCellRep` column landed with #5047; literal-union storage has one producer for lets (#5053) and globals (#5061), and G1 landed (#5058); loop variables read the column and the slot flag `localLitUnion` is gone (#5068, #5069, #5071), and a slot holds its declaration in one column (#5073), which a read resolves through (#5077); the name-keyed `declaredSlotLive` and the D1597 readers stay, in progress; next the storage-gap ruling's remaining bucket, G3. On 2026-10-28 183 lines reading `.parType` stand in 21 emit files (104 in `emit_mono.vl`; 188 before #5084 by the same count); #5075 moved the two literal-atom `Param` arms onto the elaboration, #5084 put the instance parameter-type reads behind `paramTyAt`, and #5092 deleted it with its fallback to the minted annotation (c2): the readers call `nodeTyAt`. `paramCloSigKey` stays on the annotation, blocked by D14572. These go together (D14568, a4cf), with D14572 (`elabWalkTy` answering another instance's type) and D14573 (the Set spelling against the boolean map) as the refutation pins that must keep running; then #5028's `letNulScalarBoxName` guard becomes a read of the column, and D14563's two producers are one since 2026-10-29 (`letCellKind` answers `nulbool`, `globalReadCellKind` deleted); the narrowing stack: the `narrowedFromTy` column landed for identifier reads (#5042), field-read receivers read the checker's narrowed-read fact with path reads recorded per instance (#5070), and closure, niche, nullable-literal-union, null-test and numeric-join reads read it through `readNarrowedStoreAt` (#5074), and C1 and C2 moved the print, coalesce, pin, for-in, map-read, shared-field and nullable-string-list readers onto `readNarrowedTyAt` (#5080, #5082), so no lowering reads the stack. C3 deleted the stack (#5089); next the checker's two narrowing stores as one (B2). The D14487 pair is gone (#5078);
- step 6/7, the storage-rep record (design, 2026-11-02; slice 1 buildable). A box or a write whose destination is a value's STORAGE (D14810's by-rep binding, D2996's fresh-record widening) is delivered at the storage rep, not at the checked type, and no checker stamp names that rep, so the box-destination shadow reads `no record` there. Measured over all `tests/**/*.vl` on master `02719915f`, 9 deliveries in three shapes:
  - **A, a field write into a receiver stored wider (6).** `b.f = 9` with `b` checked `{f: i32}` and stored as `J = {f: i32 | null}`: `soundness/built-container-read-returned-by-rep-bound-runs.vl`, `-read-returned-by-rep-runs.vl` (`tail(xs[0]).f = 9`), `-handed-to-annotated-list-param-runs.vl` (`o[0].f = 9`), `-read-coalesced-with-literal-handed-by-rep-runs.vl`, `soundness/call-built-wider-handed-to-annotated-field-param-runs.vl` and `returned-binding-built-wider-handed-to-hole-param-runs.vl` (`a.f = 9`, `a.f = 7`). The emitter writes through the receiver's struct row (`emitAssignMember` → `structIndexOfExpr`), so the box destination is that row's field type.
  - **B, a fresh literal stored into a container built wider (2).** `m.set("b", { f: 5 })` (`maps/unannotated-map-stores-literal-and-call-built-at-wider-record.vl`) and `const lv1 = [{ r: null }]` (`unions/arm-through-container-field-shape-row.vl`): the literal is built at the container's build, so its field values box into the build's field types.
  - **C, a narrowed read's storage (1).** `m["k"] ?? "N"` over a map read narrowed by `!(m["k"] is i32)` (`unions/value-union-niche-survivor-delivery.vl`) is built at the read's storage union, `string | i32 | null`, not at its narrowed type.

  **Who produces the storage rep today.** Two facts the checker already owns, and emit-time derivations over them:
  - the build table (`recBuildTable`, filled per pass as `recBuildPassTable`): the record each container or record binding's stores build, which D2996's fresh-record widening decides; `recBuiltReadTy` reads a container read's storage record from it;
  - the literal rep stamps (`nodeRepTyIx` through `recordRepTyAdopt`, read as `litRepTyAt`);
  - emit-side, the chain that follows a value to its build: `exprRepTy`, `letBindTy`/`letLitHeldTy`, `paramHeldTy`, `callBuiltTy` (a by-rep binding through its initializer, a hole or generic identity and a container read) and `fnRetRepTy`, which `structIndexOfExpr` and the binding slots read.
  The emit-side chain is a second producer: it combines the checker's facts with the call graph at emit, so the check cannot name its answer, and its answer is what a box writes into.

  **The rule.** The storage rep of a value is one checker fact, produced after the last check pass, when the build table is final, and before the elaboration: a column `storeRepTy[ix]` on each value node a storage delivery reads (a field write's receiver, a stored literal, a narrowed read), filled by the check-side port of `callBuiltTy`'s chain over `recBuildTable` and the rep stamps. A stamp refers to it by place: the check records each storage delivery as (value, receiver, field) while it walks, and the post-pass resolves each against the column and boxes the value at the storage field's type (`recordBoxTy`) where that is a union. The emitter's chain then reads the column first and is deleted chain by chain, each deletion graded by the byte sweep. Generic instances follow once the non-generic population is clean: an instance's storage comes from its arguments' builds, so the post-pass runs per elaboration key there.

  **Slices.**
  1. Shape A, non-generic: the pending field-write list, the post-pass, and the column for write receivers, with `callBuiltTy`'s chain ported to check. Emission unchanged, so the byte sweep reads 0 movers. Acceptance: the 6 shape-A deliveries read `agree`, none `disagree`, and a shadow-test case pins `b.f = 9`. **As built (2026-11-02):** `callBuiltTy` moved unchanged to the check side (`check_store_rep.vl`), which the emitter imports, so it stays one producer. The assignment check queues each non-generic field write (`storeWritePush`), and `storeWritesResolve` boxes the value at its field's type in the receiver's built record. It runs at the end of each pass, before `recBuildNote` hands the pass's builds on, since the pass table is empty after it. 2 of the 6 deliveries read `agree` (`built-container-read-returned-by-rep-bound-runs.vl`, `-read-returned-by-rep-runs.vl`), no other row moves, and check fuel on the compiler is +0.005%. The other 4 write into a parameter of a function instanced at its argument's build (step 6's c-2 by-rep instances; `paramHeldTy`), whose storage is per elaboration key, so they move with the per-instance half (slice 1b), not here. **Slice 1b, as built (2026-11-02):** no elaboration key was needed. A parameter receiver's storage is the rep every noted argument hands it (`recArgRepOf`, the checker's own D14532 decision for an annotated parameter), else the build every call of its function hands it (`callBuiltTy` of each argument over `rcwCallSites`), taken only where every call is a plain one and they agree, and an element read takes its list's element. The write queue records the function around each write for that. It resolves at the pass end like slice 1, mints no key and runs no instance re-check. The other 4 deliveries read `agree` and no other row moves.
  2. Shape B: the post-pass adopts each fresh literal stored into a wider build at that build (`recordRepTyAdopt`), so its field values box at the build's fields. Acceptance: the 2 shape-B deliveries. **As built (2026-11-02):** `recStoresAgree` already decides that a stored literal is built at its container's build; it now also boxes each of the literal's field values at the build's field type (`litFieldsBoxAt`, into nested literals), with no rep stamp written. `maps/unannotated-map-stores-literal-and-call-built-at-wider-record.vl` (`m.set("b", { f: 5 })` ahead of `m.set("a", mk())`) reads `agree` and no other row moves. `unions/arm-through-container-field-shape-row.vl` is not this shape: `[{ r: null }]` reaches `Circle[]` only through a map a call returns into an annotated field, which the emitter's shape intern (D763) builds, so no store decides it; it stays open.
  3. Shape C: a `??` over a narrowed read boxes its default at the read's storage type (`readNarrowedStoreAt`'s fact, read at check). Acceptance: the 1 shape-C delivery. **Measured (2026-11-02), not built:** boxing every `??` default whose left operand is a narrowed read at the read's storage (`narrowedFromTyOf`) clears the witness but moves 22 top-level and 21 nested deliveries from `agree` to `disagree`, so the emitter builds a narrowed `??` at its storage only in some cases; the slice first needs the rule that decides which, read where the emitter reads it. **Rule found and built (2026-11-03):** the narrowing is not the deciding fact. The witness's `??` takes `emitCoalesceGo`'s fused map read (`emitMapGetOr`), which builds the default where the map stores its values, and that path is taken when the default fits the map's values; a default that is another arm of the result's union joins at the result instead (`coalesceMapReadJoins`). The `??` check now boxes a map read's default (`m[k]`, `m.get(k)`) at the map's value type when the default's type is assignable to it (`coalMapReadValTy`). The shadow moves 1 top-level and 1 nested delivery from `no record` and 2 and 2 from `disagree` (`maps/nullable-value-map.vl`) to `agree`, with no class moving the other way; boxing without the assignability test moved 7 and 8 the other way, every one a joining default.
  4. `structIndexOfExpr`'s receiver chain reads `storeRepTy` and `callBuiltTy` is deleted; then `exprRepTy`'s binding and call arms, one per PR, each with the byte sweep at 0 movers or every mover explained. **First step, as built (2026-11-03):** the emitter no longer calls `callBuiltTy`. The check queues each un-annotated binding's initializer and, at the pass end, records for a call initializer the record its results are built at (`storeLetsResolve` → `storeLetBuiltOf`, a node column reset when a pass begins); the emitter's binding reads it (`letCallHeldTy`). The emit-time call had read an emptied pass table (`recBuildNote` hands the builds on), so its container-read rung never answered there; the column reads the pass's own builds. The byte sweep reads 0 movers, so that rung was never the deciding one. Check fuel on the compiler is +0.016%. **Where slice 4 stops (2026-11-03, measured):** `structIndexOfExpr`'s parameter rungs need no move, since mono pins a by-rep instance's parameter from the check's `recArgRepOf` (`monoPinAnnotatedParam`, D14532), so they already read the one producer. The remaining emit-side derivation in the chain, `fnRetRepTy` (`exprRepTy`'s call arm), is not a twin of `callBuiltTy`: it answers a function's result rep of any kind (lists, union lists, maps, function lists), often per instance, while `callBuiltTy` answers records alone. A probe compared the two at every emit-time call over `tests/**/*.vl` and the distilled corpus: 10,904 calls, 1,473 the same. Restricted to calls where either side answers a record, 265 differed over 33 files, every one the emitter holding a record the check has not, in four classes: a generic instance's call as the result (117; `generics/unannotated-callback-pins-generic-callee.vl`, `(x) => h(x)` with `h<T>`), an annotated callee's call (76; `lists/map-record-result-inferred-return.vl`, `xs.map((e) => mk(e))` with `mk(e): P`), a function mono mints after the check (70; corpus `named/d3125_hole_FR_*_P1_*.vl`, a hole function's `.map` callback), and a record literal in a generic's instance (2; `generics/record-field-at-type-param-list-return.vl`, `(e) => { v: e, n: 1 }` in `wrap<T>`). Three of the four are per-instance facts only the elaboration or mono holds, so `fnRetRepTy` is a per-instance result-rep producer that moves with step 4 (the elaboration's per-instance result types), not with this record. The annotated-callee class changes no storage answer: an annotated call's results are built at its declared type, which is its own.
  **A reader to move here (column-G1, 2026-11-03).** `xrepEmitPair` ([D15055](inventory/D15055.md)) decides whether a list `==` compares across two element storages from the rep each operand is built at (`eqgListKindOfExpr`, `refListSlotOfExpr`), an emit-side derivation. It moves onto the storage-rep record once a list literal carries its built rep there, and the same fact closes [D15091](inventory/D15091.md): a list literal beside a list stored apart is refused today because nothing records which of the two element types it was built at.
- step 6, the narrowing stores (DECISIONS.md, "One lexical binder writes every identifier's declaration"): B0, the lexical binder, before B1b-i, because 56,482 `placeKeyOf` calls reach an `identDeclOf` not yet written (43.4k member receivers, 11.6k bare assignment targets, 1.4k condition subjects). B0 is done (#4985, #4991, #4995). The two read-side loop finders are one, asking the plan by declaration (D14543 closed). E1, one type store keyed by declaration (`envTy[decl]`, with an undo log), is done (#5011). B2a (#5014), Q1 (#5023), B2b (#5024), B1b (#5029) and B2c-1 (#5035) are done: scope reads, member calls, the narrowing bank, the guard-key lists and the flow analyses ask the binder's declaration, and `envDeclOfNameForFlow` and `declare` are deleted. B2c-2a (#5041) deleted the by-name scope chain and elab_cap's by-name side, and repaid B2c-1's floor (diderven check 1,972,235,704); B2c-2b (#5043) keyed the write scan's frames by declaration and deleted `cwSoleBinderOf`/`cwFrameDeclCount` (1,970,277,404). B2c-2c (aa0c): the occurrence index is chained by declaration with call and method-call rows on one may-write-anything chain (D2390) (#5046), `cwBoundOnce` takes a walk and the index files binding rows for `LoopVar`/`ForRange` (#5048), and the single-binding readers take the binding's declaration (#5050). The alias-set world is keyed by declaration (#5052), `covarRootFrame` and `cwSameFrame` are gone (#5054), the capture writer is keyed by binding (#5055, #5057), CALL rows key on the resolved `FuncDecl` (#5059) and MCALL rows on the sole self-fn (#5060). MCALL rows key on the checker's pick (its overload choice or type-bound fallback), filed after the pass's checks return (#5457); the floor was mostly module mode, not overloads: of 20,435 rows over tests/**/*.vl, about 400 were unkeyed only because their declaration was merged under a mangled name, against 10 overload picks and 11 type-bound fallbacks, while the 20,019 collection and builtin method rows stay unknown by design (D2390); and `rcwSelfDeclsOf` reads that pick and each instance's, so `cwSelfDeclsNamed` is deleted (D14755 closed; D14756, an overloaded call in a generic body that skips the delivery check, is open); calls through fn values, params or unresolved names keep the D2390 unknown chain, by design; slice C keyed the capture writer's handles, mentions and binders by declaration (#5063), so `crwUseNames`, `crwBound`, `crwFnMentions` and `crwAnyWriteBase` are gone;  of the emitter-facing name banks, `crAfterBank`, `crBeforeBank`, `crCondDropBank`, `crSoleNames` and `crRhsNames` are gone, `crRhsRetired` holds place ids, `crLambdaHandle`, `crEscapesIn` and `crCapRecHandles` are keyed by declaration, and the capture-widen and capture-loss banks hold declarations rather than names, with `crCapRecNames` and the emitter's unread `capWidenOf` deleted; a `crDeclareWidened` layer is its slot (`crWideNames` is deleted; the same-scope redeclaration rule reads the name off the slot); `crAskProg` records the declaration a whole-program question asks about and the driver spells the persisted builder key from it (`skAsksNow`), and `crRootMayKeep` matches an assignment's target by declaration; and the capture-by-reference walk (`crCaptureByRef`) records captures, assignments and declaration loops by declaration, as the emitter's `cbox` walk it mirrors does, so the capture walks hold no binding names; `cwDeclCount`'s (frame, name) grouping is gone (#5081, D3027 closed) and `crCallCandidates`' cache keys on the outermost declaration (#5083), since the emitter allocates a local per declaration (#5077). This closes D14544, the transitional second resolver (DECISIONS.md, "The binder is the only identifier resolver"), and D14545's 12 programs are its witnesses. B3 is done (#5113, #5114, #5115): the clobber ledger, the write path's prefix scans over `npKeys` and D3307's root compare are on place ids. B2's first two stages are done (#5124, #5125, #5129 and the store move): the bank's type column is gone, every row reads the binding's storage type through `slotStoreOf`, and an identifier's narrowing is a row of the one narrowing store (`check_nar_store.vl`) at its zero-length place, carrying its kind, depth, epoch and stamp; `check_nar_bank.vl` is deleted. Stage 3a is done: each identifier row carries its layer's narrowed type, kept in step at every layer write, and a declaration clock retires a row whose binding was declared again (a module `let` the main pass reaches after its initializer's pre-pass); a probe found row and layer equal on every identifier read in 17,265 files. Stage 3b-i is done: every identifier-type read outside `check_scopes` asks the store's `declTyOf`/`identTyOf`/`placeNameTy`, which answer a live row's type before the layer's (`layerTyOf`). Stage 3b-ii is done: no narrowing writes a scope layer (save a guard test that leaves the type unchanged, whose scope still binds the name); the layer walkers ask the store's `narChainDepths`/`narTyAtDepth`/`narTopDepth`, `narSetScope` and the journal replay write the row, and the elaboration snapshot takes the store's type. B4 is done: `narSetScope` and the journal replay write rows only (a probe found no layer fallback in 17,265 files), `narIpScope` goes since `narIpSlot` already tells a bare name's entry from a path's, and `crFirstBank` is the store's `narRowAt`. The narrowing stores are one (B1–B4), with the layer writers gone and a per-declaration row index first), then B4 as listed under "Landed after #4966";
- step 7, repOf / variant identity (D14551, D14552): #5290 reads a variant with no cell from its type and deletes `paramVariantIndex`; #5311 and #5319 read a list method's result and receiver kinds off the rep of the call's and the receiver's types. The full move to the type alone is refuted and pinned as D14655: a record with its own struct row can sit in a `variant` cell, so the cell rungs wait on the variant and struct labels becoming one row. the kind-(ii) reader migration's groups 1–3, the heap-slot readers and the object-literal readers have landed (#5005, #5006, #5007, #5010, #5012), and `armRowOfRecordTyShim` and `vrIxFirst` are deleted (#5022; D14552 closed). D14551 is closed (#5017): every registrar mints at its held arena type and a row is found by its flat member set's canon id. The D14432 slice, union rows admitted and boxed by member reps, landed (#5027; D14432 and D3398 closed), and the nullable-variant kind and row have one producer (#5030, #5033). Remaining is the Ident ladder: `nulVariantIdxOfExpr` onto `repOf`, which deletes the `nulVariantIdxOf*` and `capturedNulVariantIdx` callers. The Ident arm of `nulVariantIdxOfExpr` now reads the row off the read's storage type, the per-instance narrowed store (`readNarrowedStoreAt`) else its own type, and the parameter, slot-column, capture, global and frame-`let` rungs go with `capturedNulVariantIdx`, `nulVariantIdxOfLetIn` and `paramNulVariant` (the two answers differ in 6 of 17,265 files: three narrowed lambda or generic parameters gain the niche row their storage holds, two hole-optional reads and an arm map beside its layout twin lose one; four of the six build byte-identical and the two hole-optional reads drop a redundant `ref.as_non_null`). The global branch landed with #5044 (`globalCellStructIdx`); the local and narrowed arms are s12's, unblocked and still open, reading `narrowedFromTyOf` (#5042) and, for a local, the `bindCellRep` column (#5047). In the census, 105 files are narrowed-niche reads (storage niche, rep a non-null variant) and 9 are reads of a box narrowed by `is` (storage box, rep `nulvariant`). In both, the storage is the rep of the type before narrowing, a fact the read's rep does not carry and slice 3 records. D14434 (#5019) is a refutation pin: a global's cell kind (`globalCellKindGo`) and a local's (`letBindRepClaims`) are two producers, and unifying them moved 19 of 6,804 `tests/cases` files from runs to not-runs until the global storage paths hold the local's kind. Since #5044 a global's cell kind comes from `letCellKind`, the local's producer; the target is still one stored cell-kind answer for both scopes, Step 6's per-binding storage column. The Ident ladder landed (#5127): `nulVariantRowOfRead` reads the row off the read's storage type. A local's cell kind is now `letCellKind`, the module global's producer, at the slot `letCellSlot` reads for that kind, so `letLocalSlot`'s own ladder is gone; the two disagreed in 1 of 17,265 files (a `string | null` instance's mapped list, which `letCellKind` gains a `strlist` rung for), and no file builds differently. A global's and a local's cell slot are one producer, `letCellSlot`: a `map`, `nulmap` or `reflist` cell reads the shape or row its stores and initializer deliver (`letMapShapeOf`, `nulMapShapeOf`, `letRefListSlot`) before the type's rep slot, and `emitGlobalSection` asks it at both its sites. D14643 was a local that refused where the global ran; after it, 1 of 17,265 files builds differently, a local reused for a nullable map whose shape code now matches an earlier one's, with the same types and output. Union-row identity (coordinator ruling, 2026-10-31): dedup by `repCanonId` is refuted, because canon folds a literal to its base, record fields included, and `is` dispatch needs `{x: 3|4}` apart from `{x: i32}` (2 files broke). A row is keyed by one literal-preserving key, `unRowOfTyKey` extended to declared literal unions and aliases; row-taking callers move onto it per family, and `unRowOfCanon` stays only for membership where folding is intended, renamed `unRowOfCanonFolded`. The row-taking callers moved in #5357, #5364, #5381 and #5391 and mono's four in the PR after them; the membership callers DEPEND on folding twin rows: moving them onto the key traps the compiler in 9 files (`std/json-deep-is-after-error-guard`, `std/json-deep-is-parse-result`, `std/json-union-narrows-at-top-level`, `unions/deep-is-json-shape-walk`, `types/is-bank-reader-spellings`, `types/newtype-union-distinct-reps`, `unions/pop-union-box-element`, `unions/twice-narrowed-alias-list-arm`, `maps/literal-union-map-beside-other-map`), so they move with the twin rows' deletion, not before. The name family (`rlSlotByNameTwin`, `letInitDeliversRow`): `letInitDeliversRow`'s spread and record cases are gone, a spread copy and a record list binding the row their element type keys, and two `rlSlotByNameTwin` callers ask `rlSlotOfTyOrTwin` of the element type (the nested-element check in `emit_classify` and a named call's result in `emit_value_sites`); shadowed over 17,631 files, the delivered row and the type-keyed row agreed everywhere, yet deleting the named-call and type-variable closure cases broke 5 files, because the delivered read mints the row a generic instance's result or a bound closure is built at and the type-keyed lookup then finds it, so those two cases wait on that row being minted at collect; of the 8 `rlSlotByNameTwin` callers left, the name finds a slot the element type does not key in 99, 76 and 35 files at the three widest (an index read's element, `fnRetRefListDemand`, the closure-site element read), nearly all a closure element, a nested list or a value union, which `rlSlotOfTy` keys by name today. Measured per caller (2026-11-02), the element types the callers hold are what differ, not the keying: the index read's element holds an open closure type, the closure-site read holds the checker's type where the slot holds the storage rep (`{f: f64}` against `{f: f32}`, a record against its nullable or union storage) (R6: keyed on the element of the expression's rep type, `exprRepTy`, the closure-site read's 35 files fall to 14, all an open closure, hole or nested-list element whose rep type does not close, plus two one-offs; the site now takes the slot its rep type keys and keeps the name only where that type does not close), and `fnRetRefListDemand` runs before mono, where `fnRecordedRetTy` has only the template's open type. Asked the elaboration's per-instance result instead (`elabResultOf(elabKeyAtPos(i))`, else `fnRecordedRetTy`), `fnRetRefListDemand` differs in 22 files in place of 76, its acceptance: about 11 an open closure result (steps 3 and 4), about 6 with neither an elaboration key nor a recorded result, and about 5 a storage rep beside the checker type (the per-binding storage column), one of them a literal-union element `9000000000 | 1 | 9000000001` whose list is stored at its render's widened row, `(i64|i32)[]` (D6460), which `tyToEmitName` prints as the same type, so it is no key defect.
- step 7, one row per record, step 4 (#5613): closed. The `"variant"` kind is the arm reference; a value's heap and fields come from its arm's row (`variantRowOf`), and `emit_bytes.vl`'s writers take a variant kind through the struct arms. The tag stays with the arm, because boxing reads `uTags[vi]` and twins share a row with distinct tags, so the producers and the `$fnsig` result token keep the variant kind (DECISIONS.md, "A record has one row; a union arm is a reference to it"). Folding tags into rows is a separate tag-numbering decision, not taken.
- step 7, variant-row keying (design, 2026-11-02; proposed, slice 1 buildable). Union rows keyed by canonical type, so a site reads the box record (step 5) without its own derivation. Owned by the step 5 coercion lane (session_01CnBfvZdoms6dgbJnpSmdzS, coordinator ruling 2026-11-03); its first item is [D15081](inventory/D15081.md), an alias row and a structural row for one member set, graded by output and `@log`, since unifying rows renumbers tags.
  - **The gap it closes.** A declared or inline union's row is keyed by its spelling's key text (`canonUnionKeyOfName`), where a record member keeps its NAME (`Cat|Dog`). The key a reader builds from the arena type renders the same member structurally (`{meow:i32}|{woof:i32}`, `canonUnionKeyTextOfTy`). So `unRowOfRecordTy` reaches no row for a record-arm union, and every box site keeps its own union as the fallback. Measured over all `tests/**/*.vl`: of the six sites reading the record (#5820, #5824, #5834, #5852, #5876), the fallback fires in 9 files. 6 are record-arm unions: `unions/un-annotated-empty-list-union-push` (`Cat|Dog`), and the five `??` record joins `unions/coalesce-record-join-inline`, `-left-chain`, `-nested-null`, `-undeclared` and `unions/record-join-place-elimination` (`A|B`, `A|B|C|null`, `B|A|null`). The other 3 are not keying: `maps/fn-set-map-get-binding` (`i32|null`), `simd/captured-reassigned-vector-cell` (`v128|null`) and `unions/litunion-nested-union-arm-module-global` (`K | (L | i32)`) have no closed record. Those wait on step 5's open item, post-check minting before the elaboration.
  - **The rule.** A union row is keyed by the canonical key of its member TYPES. Under the structural-records ruling (D3870) a record member's key atom is its structural render, and a member's name is a spelling of it, never part of the key. A variant row is already a reference to its record's one struct row (#5613, `uVarRow`), so variant identity follows from the union row's member types. The arm name stays only as a label (`uVariants`) for messages and the twin columns.
  - **D12465's question.** Its answer is yes. `type Circle = {r: i32}` as an arm of `Shape` and a standalone `type Dot2 = {r: i32}` are one canonical type, so they key one struct row, and `a == d` compares one heap type. D12465's `error-arm-struct-equality-mixed.vl` running is an acceptance cell of the slice that keys STRUCT rows by type, not of slice 1. Two same-shape arms of one union (`Cat`/`Kot`) are one member, which is what `uVarTwin` already collapses them to at the heap; keyed by type, the twin column has nothing left to do and goes with the slice that removes name-keyed registration.
  - **Tag order.** `assignTags` ranks every variant by its tag key (`variantTagKey`, the field-name signature), globally. So a new row or a merged one renumbers the tags after it: the tag set is a function of the rows minted, not of a spelling. Renumbering is accepted, because a tag is assigned once per module and every producer and reader in that module reads the same `uTags`. The host prints values through typed imports, never a raw box tag; that is read from the print imports, not proven for every export. A mover is graded by its output, not its bytes. It must print the same under the base and candidate seeds and match its own `@log` lines, and a byte diff of a mover must show only tag constants and the dispatch order that follows them. Measured on `claude/step7-box-rows` (minting a value-union row from every closed program-level box record before `assignTags`): 6 of 7,217 files moved, all tag renumbering (`i32.const 0` to `2` and the `if`/`else` arms reordered to match), and all 6 printed the same and matched `@log`. It removed none of the fallbacks, because record-arm unions are not value unions (`mintValueUnionRowOfTy` declines them) and the other three have no record.
  - **The producer.** One, before emit: `collectU`, the pass that already registers every declared, inline and inferred union. It keys each row it mints by its member types. A spelling that names an existing row (an alias, a reordered or record-named spelling) becomes a second NAME of that row, never a second row. The emitter mints no row from a type at a delivery site, since that would make it a second producer (coordinator ruling, 2026-11-02).
  - **Slice 1, as built and measured (2026-11-02): the type key as `unRowOfRecordTy`'s last rung, and the box record read through `nodeSrc`.** The registry already keeps each row's type key (`unTyKey`, the order-independent multiset of its members' literal-preserving type keys), so slice 1 asks `unRowOfTyKey` after the spelling keys rather than indexing a new alias. `boxRecordTyAt` also reads a copied node's record through `nodeSrc`, as the shadow's reader does. No row is added and the byte sweep reads 0 differ. The premise above does not hold for the six record-arm files: the fallback falls 9 files → 8, and the fixed one is the nested literal-union cell (`K | (L | i32)`), not a record arm. The six record-arm fallbacks are no gap at all. Traced with a control for each instrument (a plain value whose record agrees: probe silent, shadow `agree`; a boxed value with a record: both quiet) and one minimised file (`xs.push(pick(true))`, `pick` returning `Cat | Dog`), each is a value ALREADY of the destination union: a call result, or a `??` record join whose arms are boxes. Delivering a union into the same union is no coercion, so the checker records nothing, and the shadow classes it `value already a box` without asking a record. The fallback probe fired on any empty record, boxed or not, so it over-counted. Excluding already-boxed values, 2 of the 8 files fall back: `maps/fn-set-map-get-binding` (a record that reaches no row, the `""`-render class) and `simd/captured-reassigned-vector-cell` (`v128|null`, no record, a producer gap). A site needs no union for an already-boxed value except to decide a retag (`boxRetagNeeded`), which compares the value's own union against the destination's, so its derivation there is the value's own union. Keying an anonymous record member by its text where `canonUnionMembersWalk` declines it changed nothing and was reverted. The shadow now counts a delivery boxed inside another site's lowering as `nested <class>`; it had skipped them, so an outer box graded `agree` hid an inner one. The widened grading reads 134 nested deliveries over 40 files with no record, which join the producer-gap list beside post-check minting. Type-keyed rows (the rule above) still stand for the 132 records that render `""` and the about 50 unions with no row until a site boxes into them.
- step 7, the recorded-result flip's type-variable results ([D14901](inventory/D14901.md) class C): 17 valued functions the result-kind shadow grades `no token` or `no result recorded` whose result holds a hole-function value in a list, map or record (`((_) => _)[]`, `{m: {[string]: (_) => _}}`, `_`); a polymorphic value that closes per call or delivery, so it goes with (d1) and the per-delivery token. Classes A, B, D and E are closed or filed on the row.
- step 7, the closure signature key: `calleeCloSigKeyOfRead`'s held-value rung (`identClosureFeOfRead` → `cloSigKeyExt`) is not a deletion target. It keys a closure binding by the signature its held value is lowered at, which is what a call through it must use; deleting it moved 214 files to rc 1, and keying by the call's per-instance type instead broke 2 (D14825, closed as measured). A value holding a hole lambda or generic that crosses at another signature is the per-delivery token design, with D14841.
- step 7, the type-blind classifiers (census 2026-11-02, [type-blind-classifier-census-2026-11.md](type-blind-classifier-census-2026-11.md)): `emit_classify.vl` holds 179 classifiers (6,113 lines). 116 read no node type directly (3,180 lines, 605 call sites); 108 of those reach the arena through what they call. By caller phase over 17,630 files: 8 (210 lines) are called only after monomorphize, 4 (50 lines) only before, 96 (2,773 lines) in both, and 8 (147 lines) are the storage column itself, which stays. A classifier called in both phases is held by its asks before monomorphize, which are mostly template frames; the census counts them per classifier, and they are what step 7's "who still asks before monomorphize" work removes. The largest holds: `exprListRep` 233,073 calls (5,497 files), `listOfColumn` 232,981, `capturedKindOf` 137,574, `structIndexOfExpr` 94,072, `globalReadStructIndex` 53,357, `capturedStructIndex` 52,161, `callStoreListKind` 47,505. `letInitCellKind`, the binding ladder, agrees with the rep of the binding's type on every ask past monomorphize (275, 0 disagreements); its 15 disagreements are all before it, at template types. The three post-monomorphize-only classifiers that answer a rep (`exprNulScalarListKind`, `minMaxKind`, `callIsArrSlice`) read the node's rep at 0 disagreements, and `minMaxRecordedFloat` is deleted. The rest wait on the asks before monomorphize. By pass, `exprListRep`'s 232,921 asks before monomorphize were 97.9% `computeRetInference` (`criClassify`'s list rungs asking every return expression of every un-annotated function), then `monomorphize` 2,123, `collectA` 1,635 and `dispatchRewrite` 921. Return-kind inference now answers a closed recorded result first: a non-null, non-union list result is that list, and a result that is neither a list nor a union box runs no list rung. Its asks at a function frame fell 227,819 to 79,131, `exprListRep`'s 233,073 to 84,760, `listOfColumn`'s 232,981 to 83,140 and `callStoreListKind`'s 47,505 to 8,621, with byte-identical output. No mixed classifier is post-monomorphize-only yet. The remaining 79,131 are template (open) results, nullable lists (which `synthNulListRetAnns` pins as annotations, D1062, so `fRetKind` has no nullable-list arm), union joins and uncovered results.

### 3.2 What stands between master and deleting the split plan (re-census, 2026-11-02)

Step 4's final deletion removes `fn_split.vl` (6,107 lines), `fn_flow_shadow.vl` (3,494) and the driver's `FS_PLAN`/`FS_APPLY` loop. Measured with the split plan turned off (`holeFnSplitHas` answering no and `compileSrc` returning after its first compile), on fixpoint seeds, first at `a48eddb4` and again at `80e014f2` (after #5913):

| population | `a48eddb4` | `80e014f2` |
| --- | --- | --- |
| `@run` files under `tests/` | 62 of 5,398 refuse | 55 of 5,439 refuse |
| filed witnesses | 25 of 4,186 move, every one `runs` → emit refusal | 21 of 4,216 move: 20 `runs` → emit refusal, and D14943 check reject → emit refusal (with the plan off, `vl check` does not reach the instance's type error) |
| distilled corpus | 0 of 7,152 cells | 0 of 7,152 cells |

Between the two counts seven files left and none joined. B's two left with #5846. M-maker's
literal-union and two-result files left with #5854 and #5863. bundle-lam's two left with item (d)
slice 1 (#5878). H-b's left with #5870. Each of the 55 still refuses with the message the
`a48eddb4` census grouped it by, so the groups below are recounted by file, not re-minimised.
The filed rows that left are D4308, D6320, D6481, D6706 and D9380.

Each dependent was delta-debugged to a witness: greedy line removal, keeping the split-on run succeeding and the split-off refusal's message. The groups are by that witness, not by message: the 21 files that print `the reassigned function binding … holds functions called at more than one argument type` are three groups (W-cap, W-lam and seven of W-named), and two more W-named files carry the same witness under other messages. Re-minimised on 2026-11-02 at `a29c90e7`, the nine W-named files are four mechanisms (W-hand 5, W-split 1, W-field 1, and 2 hole-lambda files that are W-lam's), and W-cap's 7 are W-lam's mechanism with a closure written into the `let`. Owners are the lanes' open-list lines above.

| group | witness | `@run` files | filed rows | owner |
| --- | --- | --- | --- | --- |
| F | a generic handed in as a parameter, copied into a binding or a second type parameter, and called at two types (`mid<F, G>(a: G) { let b: F = a; b("w"); b2(3) }`) | 15 | D6200, D6240, D6425, D6520, D6530, D6762, D6793, D6884 | four shapes, below the table |
| W-hand | a written `let` of a set handed to a parameter whose function type is open at the call: an un-annotated parameter (`let f = inc0; f = dbl; w(f, 3); w(f, 3.5)`, slice 1, #5924) or `(x: T) => R` whose `R` the set's member binds to its own `T` (`app<T, R>(f, 3)`, slice 2) | 1 | D9030, D9131 | step 4 (γ): slice 1 (#5924) and slice 2 (#5929, #6010) landed; the file left is a written `let` of generics handed to a generic's closed parameter at two pins inside a generic body, an id per instance (D15103) |
| W-split | a written `let` whose members disagree on void against a value, called at statement position (`let m = inner; m = retV; m(7); m("t")`); its hole-function spelling traps with the plan on (D15015) | 1 | D15015 | ruling question: dispatch a call whose result is unread, or refuse at the write |
| W-field | a written `let` delivered into a record field at a closed type, then called at another (`const r: R = { g: f }; f = loud; f("t")`) | 0 | D15066, D15067 | closed with W-closed: each element or field a list or record literal delivers at a closed function type is an adapter, so the literal holds closures (`ftHolderCoerced`), nested literals and a written literal included; the spread `ys.push(...[f])` stays D15067 |
| W-lam | a hole lambda member of a written `let`'s set called at two types, seeded or written, at module scope, in a function, in a loop or from a closure (`let k = (x) => …; const flip = () => { k = other }; k(1); k("b")`): the closure is scenery, a named un-annotated seed runs | 16 | D3857, D3858, D3868, D3971, D3975 | step 4 (γ): unblocked under D3975 (A), one closure per call type; no witness needs flow typing, since the check already judges every member at every call type |
| bundle-lam | a hole lambda whose parameter is called at two types or two sets, handed to a hole parameter or pushed onto a list of hole functions (`lap = (g) => { g(1); g("s") }`) | 3 | D14824, D14845 | mono lane: closure-at-delivery item (d); slice 1 (#5878) took D6481 and D6706, slice 2 (#5913) closed the named spelling D14942, slice 3 took D14824's fixture, and D14845's non-capturing list element is tagged (`ftArmOnlyLams`); `hole-lambda-bundle-param-read-as-value.vl` runs since read-as-value slices A (a forward) and B (a capture) |
| M-record | a generic or a maker's result stored in a record field and called at two types, the record handed to a declared narrower record parameter (`show(o: G)`), or through a function's result to an un-annotated one (`show(get3())`) | 2 | D6702 | the list of the record (holder kind 6) closed two files with D15061 (M-record (A)); the narrower declared parameter is parked on the row question (column-G1, #5539) |
| M-maker | a capturing block-local maker called at two types, and a maker result called directly (`mkLoop()(5)`) | 2 | D5971 | mono lane (closure-at-delivery remnants); #5863 took the converting destinations and D9380. The block-local maker runs without the plan since the tag decision reads a nested callee's returns from its own declaration. The `mkLoop()(5)` file runs without the plan since `return k` in `mkPick`, whose result is `{k, j}`, is decided with that wider set; with `mkPick` uncalled it still refuses (D15070) |
| B | a `const` alias of a generic or hole function, at module scope or in a closure, called in a body instanced at two types | 0 | — | closed (#5846) |
| F-let | a `let` copy of a forwarded hole parameter (`let hh = h`), beside a list forward of that parameter to a member calling it at two types | 0 | D15100 | the copy also kept in a `const` list read only for its length runs (the elaboration's alias forward skips an element of such a list, `elabUnreadConstLit`); the copy re-pointed (`hh = mul`) runs too, the elaboration noting the parameter that seeds a written `let` with both sets (`mintSeedNote`, D15018); `same` handed two sets by two one-member list calls runs too (D15019); and where `inner`'s list holds two members (`[same, quarter]`) it runs since the handed-holder half (D15100) |
| C | an impure `else if` choosing generics (D14425) | 0 | — | closed: a join at a tail of another set's join, whose members that set holds, is typed at the outer join's set (`ftNestedJoinsFollow`), so the nested `else if` no longer carries the set of a binding beside it |
| H-b | a `const` list literal of a parameter called at two types, beside a copy of the parameter in a list (`twice(id); twice(dbl)` beside `copied`) | 0 | — | closed (#5870): the list widening is per instance |
| H-nested | a choice of functions nested in the caller handed to a hole parameter, whose arms are built where those names are out of scope (`ftMemberSeenAtArms`) | 0 | — | closed: a capture-free nested member is tagged (`ftNestedCaptureFree`), and the checker and the emitter take a dispatch arm's callee as its member's declaration (`fnTagArmCalleeOf`, carried to every copy by `identFrom`) rather than by name; a capturing member stays declined |
| L-nested | a list forward of a captured hole parameter inside a nested function (D14842's shape) | 1 | D14842 | design-size: a nested function's body instanced per encloser instance |
| L-set | a hole parameter forwarded through a two-member list or choice to a member calling it at two types | 0 | D14430, D15100 | closed by the handed-holder half: `ftScan`'s forwarder clause is lifted, and a member is marked partial only when an untagged set some call goes through holds it (`elabFnSetMembersUntagged`) |
| L-map | `.map` lambdas calling a list of hole functions at several types | 0 | — | closed: no split-plan dependent at `9a45989d` calls a list of hole functions from `.map` lambdas |
| N | a function declared above a module `const p = fw(add)` calling `p` at two types; declared below it, it runs | 0 | — | closed (#5926): the global-init pre-pass records the set its initializer yields |

**Re-censused at `9a45989d` (2026-11-04).** With the split plan off (`compileSrc` returning after its first compile) against the fixpoint seed, 18 of 5,708 `@run` files under `tests/` refuse; two more first read as dependents (`atomics/rmw`, `simd/int-unary`) and match the seed in exit code and output three runs of three on each compiler, a timeout under load. Each of the 18 was delta-debugged to a witness (master's run succeeding with output, the split-off run keeping its refusal message), and grouped by that witness:

| group | files | witness |
| --- | --- | --- |
| F | 6 → 3 at `3f036bfe` | a function parameter copied, aliased or re-pointed in a generic body and called at two types (`let b = a1; if c { b = a }; a("x"); b(3)`): `written-let-reassigned-to-other-param-called-at-two-types` (D15409), and the two re-pointed `let`-copy files D15404's close added (`written-let-copy-of-hole-param-in-{list,record}-called-at-two-types`), one family with one owner (a parameter both a written `let`'s source and called directly at a second type); `written-param-alias-called-at-two-types-runs` and `generic-fn-value-type-param-params-swapped-nested-generic` run without the plan at `3f036bfe`, `param-copied-into-unread-binding-of-other-type-param` runs without the plan since D15403, `hole-fn-copy-in-record-called-beside-other-key` since D15404 (D15445's record holder, and an un-written `let` copy read as a `const` one), and `fn-value-param-copied-into-binding-called-at-another-type` since D15400 (a closure-keyed instance on a chain the set entered is excused from the partial rule, `elabReachHandsSet`) |
| W-hand | 1 → 0 | `written-let-handed-at-two-pins-in-generic-body-at-two-types` (D15103, slice 4b-iii) runs without the plan: a `let`'s hand at the enclosing generic's own `U` is an escape, its adapter calling a `const` copy of the value per instance (`fvaAdapt`) |
| W, other | 2 | a void and a value generic written to one `let` and called at two types (`generic-value-return-written-to-void-generic-let`, W-split's ruling question; ruled B2 on 2026-11-05, the void-seeded order is accepted and its module block, the binding called at two types, is [D15449](inventory/D15449.md), closed the same day: a set split only as `void` against one value stays tagged (`rsVoidSplit`), so the file runs without the plan), and a written set handed to a hole parameter then spread into a closed list (`fn-set-list-of-hole-param-spread-into-closed-push`, D15432: the copy's adapter is built at the template) |
| W-lam | 1 → 0 at `3f036bfe` | two lambda cells re-pointed at each other, called at two types (`cell-peer-called-at-two-types`: D15433, mono's per-binding signature count under a capture cell, is closed; the file stays on D15435, its `const`-seeded lambdas declined as leaves) |
| L-set | 3 → 1 at `a090a48b`, → 0 with D15450 | a hole parameter forwarded through a two-member list (`forwarded-hole-fn-to-list-element-value-param`, `hole-fn-list-handed-hole-param`: both run unsplit at `a090a48b`) or an `if` choice of a nested capturing function (`choice-of-nested-capturing-function-handed-to-hole-param`: a capturing member is declined, `ftMemberSeenAtArms`; D14841's shape, the closure-at-delivery design) |
| returned list | 2 → 1 | a returned list's element called at two types (`deliver0()[0](1.25)` beside `take0(deliver0())`): `function-list-element-at-two-types-in-record-pushed-onto-records` runs without the plan since D15062's record escape closed (a record literal pushed onto a list whose element widens only its function fields is built at that element, and holds its closures, `ftLitBuiltAt`); `function-list-element-at-two-types-pushed-through-hole-helper` is D15440, the member's hand to a hole helper that pushes it |
| M | 2 → 1 with D15430, → 0 with the direct call through a `const` record field | a maker's generic result in a record field called at two types (`maker-result-in-module-record-field-returned-or-listed`: closed by D15430, a closed named call's result handed to a hole parameter holds the set's id), and a generic record field narrowed by `is` to a declared row (`record-generic-field-called-and-read-under-is`, parked on the row question) |
| alias | 1 → 0 | a hole function aliased and handed different functions (`const k = apply2; k(h)`, `k(add)`): `apply-fn-read-as-value-five-ways` runs without the plan since D15441's close: the module alias's call is noted through the set (`holeAliasHandsSet`, D15442) and a function-local alias's call is the member's direct call in the tag decision (`ftLocalAliasedFn`, D15443) |

L-map, F-let, B, C, H-b, H-nested, N and W-field have no dependent. D15101 runs with the split plan off and is closed.

**Re-censused at `a090a48b` (2026-11-04), then with D15430.** 16 of 5,730 `@run` files refuse with the split plan off on master; the two L-set files that forward through a two-member list run, so L-set's one file left is the capturing choice, which is D14841's (a capturing member's id would carry its environment). With D15430 (a named closed function's result handed to a hole parameter holds the set's id, as a binding does) the M maker file runs too: **15**. The rest of this lane's groups are named by mechanism: W-hand is D15103 (slice 4b-iii), W-lam's file is D15435 once D15433 (mono's per-binding signature count under a capture cell) closed, the spread push is D15432 (the copy's adapter is built at the template and receives an id in the instance), and M's `is` file stays parked on the row question.

**Re-censused at `3f036bfe` (2026-11-05), `@run` and error fixtures.** Plan on is the fixpoint seed; plan off is the same tree with `compileSrc` returning after its first compile. Every `@run` file (5,758) was compared on exit code and output, and every `@error`/`@emit-error` fixture (1,285) on exit code and diagnostics. **8 `@run` files differ and no error fixture does.** All 8 run with the plan on and refuse at emit with it off:

| file | refusal with the plan off | row, owner |
| --- | --- | --- |
| `closures/choice-of-nested-capturing-function-handed-to-hole-param` | `unsupported argument type for f in a call to both` | D15450 (L-set, a capturing member's id), closed: it runs without the plan as a bundle |
| `closures/fn-set-list-of-hole-param-spread-into-closed-push` | `the reassigned function binding f holds functions called at more than one argument type` | D15432 (step-2 lane) |
| `closures/function-list-element-at-two-types-pushed-through-hole-helper` | `a function value is called at two signatures, and the closure it holds was built for one` | D15440 (split-dep lane) |
| `closures/written-let-copy-of-hole-param-in-list-called-at-two-types` | the same as the row above | runs without the plan since #6383: the seed rule takes a `const` list read only as `r[i](...)`, as #6376 made it take the record, and mono copies a callee `x[0]` as a capture cell's read only where `x` is a cell (`monoIsCellRead`) |
| `closures/written-let-copy-of-hole-param-in-record-called-at-two-types` | the same | runs without the plan since #6376: a seeded written `let` read only as a field of a `const` record called in place keeps the seed rule (`elabHolderOnlyCalled`) |
| `closures/written-let-reassigned-to-other-param-called-at-two-types` | `parameter a of one is called at two function types that no parameter per type separates` | D15409 (group F, the residue of D15122 and D15123: two sources carrying different generics, one also called directly at another type) |
| `generics/generic-value-return-written-to-void-generic-let` | `the reassigned function binding m holds functions called at more than one argument type` | D15030 (W-split, Q5), ruled B2 on 2026-11-05: D15030's order is refused by design and this file's void-seeded order is accepted; the refusal was then its module block's two-type call, D15449, closed 2026-11-05: runs without the plan |
| `objects/record-generic-field-called-and-read-under-is` | `a generic function taken as a value reaches no call that fixes its type` | D15252 (M, the `is` relation), runs without the plan since the direct call through a `const` record literal's field (`constRecFieldFnRead`): the field keeps one meaning, so the relation is not asked |

The "reassigned function binding" refusal (`monoBindSigFail`) is read by two of these, D15432 and W-split; with D15432 and D15449 closed (2026-11-05), with the plan off nothing reaches it, nor a keep or refuse answer of `monoLetPinTake`, in any `tests/cases` file, filed witness or distilled corpus cell, so both are deleted with `monoLetPins` and `monoPinWidensTo`; the refusal's sentence stays at its six sites, without asking the plan. Before D3942, D15408 and D12219 closed (#6367, #6369), three more shapes reached it.

**What deleting the two files touches, by call graph (2026-11-05, `3f036bfe`).** The graph resolves names through each module's imports over `compiler/*.vl`: 16,277 functions and 62,023 edges. The plan's entry points are the driver's `fsPlan` and `fsAfterParse`, plus the mode plumbing `fsReset`, `fsSetMode`, `fsModeOf`, `fsAsked` and `fsGrew`.

- `fn_split.vl` has 243 functions over 6,087 lines.
  - **231 are reached only through the plan entries** and go with the driver loop.
  - The other 12 are the ask hooks and their helpers: `fsAsk`, `fsAskCallee`, `fsAskList`, `fsAskOpenCall`, `fsAskTyParam`, `fsNoteListCall`, `fsMinted`, `fsNoteLoopCallee`, `fsParenPeel`, `fsParseReadOf`, `hasI32` and `letDeclOfRead`.
  - They are called from 21 functions outside the plan:
    - 16 in emit_mono.vl, among them `monoMakeInstanceLater`, `monoPinAnnotatedParam` and `monoHoleGenFnPin` (`monoBindSigFail`, the 17th, is deleted);
    - 3 in wasmEmit.vl (`emitDirectCall`, `emitIdentNonLocalRead`, `emitCallRefAt`);
    - `check_operators.splitWidenedFnRead`;
    - `emit_collect.liftFnsInExpr`.
  - Without the plan, an ask hook is a no-op and `fsMinted` is always false. Each caller's asking branch is deleted with it, and nothing has to move.
  - `fsModeOf` is also read by four mono bundle pins: `monoBundlePin`, `monoBundleNamedPin`, `monoBundleHandOnPin` and `monoClosureBundlePin`. Their plan-mode arms go too.
- `fn_flow_shadow.vl` is **not** plan code. It has 140 functions over about 2,600 lines: mono's flow table, built by `monomorphize` (`fnFlowTableBuild`, reset by `fnFlowShadowBegin`) and read through 28 query entries by 44 emit_mono functions.
  - Its shadow audit (`ffGrade`, `ffSweep*`, 44 functions reached only through wasm exports) was deleted on 2026-11-05. Four one-line mutations of the table showed the audit caught only one that no other gate caught, and it caught that one through its own verdict rows. The cost bound on the table's walk is now the `fn-flow` fuel pair in `tests/vl_scaling_shape_test.ts`.
  - The file can go only once those 44 mono readers are deleted or rebuilt on the elaboration's flow facts. That is the pin-helper work, not the plan's deletion.
  - Deleting `fn_split.vl` does not require it.

**The deletion, prepared (2026-11-05, branch `claude/fn-split-delete`, draft until the census is 0).** It deletes `fn_split.vl` and the driver's plan loop, as the call graph above predicts, with three corrections to it:

- **`fsAfterParse` was not only plan plumbing.** Every compile, the plan's or not, ran `fsConstLets`: it respells an un-annotated, unexported `let` that nothing re-points as `const` when it holds a lambda, a function or a list literal of those (D6472, D13521). It and its seven helpers move to `const_lets.vl` unchanged (`constLetsAfterParse`), so 8 of the 231 functions survive the deletion.
- **Three parser helpers die with it.** `reparseArrowLambdaAt`, `reparseChoiceExprAt` and `reparseFuncDeclAt` had no reader but the plan.
- **Four callers of the ask hooks go whole**, since asking was all they did or answered: `splitWidenedFnRead` (check_operators), `monoAskSplitRetCopies`, `monoAskJoinBinding` and `monoCalleeListRead` (emit_mono). `emit_mono.vl` falls from 1,138 functions to 1,135.

`checkSrc`'s instance-diagnostic mute reduces to "the build succeeded", the rule #6398 left once the kept-program filter went. The seed falls from 6,520,731 to 6,349,672 bytes (−2.6%).


F's 15 files are four shapes by witness:

- A, 2 files: a result `: F` with a parameter handed back (D6200, D6425). The shape is served
  without the plan in three layers:
  - the elaboration's hand-back fact now holds across a hand-on to a named function's
    un-annotated parameter (`elabParamOnlyReturned`);
  - a tag rule covers a type parameter that is shared and handed back (`ftOwnTyParamSharedBack`,
    mirrored at mono's set pin);
  - the partial-set rule ignores the reaches of the signature-alternative instances the result's
    type makes (`elabKeyCallsHandSetValue`).

  Both rows' witnesses run, pinned by `generic-fn-value-two-type-param-params-one-handed-back`.
  Both files run without the plan, after two further facts:
  - a returned `const` copy of a parameter (`const b: F = a1; b`) hands that parameter back
    (`fnTagParamCopyOf`), and its seed read and annotation are the parameter's;
  - the tail value of a `void` function is discarded, so no id leaves it (`ftRetVoid`).
- B, 4 files: a hole parameter copied into an un-annotated binding called at two types.
- C, 8 files: a copy of a parameter into a binding annotated with a type parameter (`let b: F =
  a1`). Three are served without the plan. Mono pins a copy at its seed parameter's own pin
  (`monoCopySeedParam`, `monoLetPinAt`): D6703's shape (`typaram-binding-seeded-from-another-typaram`)
  and, through a chain of copies of one type parameter whose second parameter keeps its own pin
  (D6090's rule no longer counting the copies as reads of `F`), `generic-fn-value-two-type-param-params-into-annotated-binding`.
  The elaboration takes a type parameter that names no parameter as agreeing with the parameter
  its copies seed it from (`param-copied-into-two-type-params-called-apart`). Of the other five, the first two now run too:
  - two have D6760's un-annotated seed (`type-param-binding-seeded-from-unannotated-param`,
    `type-param-seeded-by-copy-result-handed-back`). They run without the plan since D15071: a
    function with a type parameter whose result holds a hole that parameter does not bind gets
    its instance (`elabParamsClosed`);
  - one copies into a record and waits on A's third layer;
  - one (`param-copied-into-unread-binding-of-other-type-param`) is refused by the flow table's
    two pins for the parameter (`monoHoleGenManyPins`, D6741), one of them taken by the copy. That
    table is `fn_flow_shadow.vl`, deleted with the plan, so it waits on that step;
  - one (`fn-value-param-copied-into-binding-called-at-another-type`) is a written `let` holding
    either parameter, not a copy. It runs without the plan since D15400: the forwarder's instance
    keyed at the closure the check typed the hand at is excused from the partial-set rule when
    the instance handing it holds the set (`elabReachHandsSet`).
- D, 1 file: parameters swapped through a recursion (D6240).

Per-parameter pins live in mono, because the elaboration binds a function's type parameters to
the generic's open signature. Moving them to the elaboration is the follow-up. Each mono-side
pin rule then becomes an elaboration fact mono reads:

- D6090's per-parameter pin for a generic handed to a second `T` parameter (`genPin`,
  `monoTyParamOnlyBareParams`);
- a copy of a parameter taking that parameter's pin (`monoCopySeedParam`, `monoLetPinAt`);
- the set pin of a type-parameter-annotated parameter. Since 2026-11-05 it reads the tag
  decision's output, a tagged argument, instead of mirroring `ftOwnTyParamJoins`, and the joined
  set it pins at is the elaboration's binding, recorded per call and argument by `elabSetArgBind`
  (`fnTagCallJoinOf`), since a union over a type variable has no instance row to read it from;
- D6760's un-annotated seed, which waits on this move, since pinning it in mono mints a late
  demand.

**The first slice: a type parameter bound per parameter (D15401).** A type parameter is
*bare-only* when it appears only as the whole annotation of parameters and of unassigned copies of
them, and never in the result, another annotation, an `is` or `as`, or type arguments
(`tyParamIsBareOnly`). The check drops such a type parameter, so each parameter it annotated
becomes a hole of its own (`tyParamSplitRun`: `f<F>(a: F, c: F)` checks as `f(a, c)`). It does
this only under two conditions:
- nothing relates the parameters: each is read only as a callee, as an argument to a hole, or as
  the seed of an unassigned copy;
- every call hands them named functions of one signature.

Under those conditions each hole binds what the shared parameter bound at every call. The
elaboration then keys each parameter apart, and the tag rules see each one as a hole, with no rule
of their own.

Three things stay on the shared binding:
- a write that joins two parameters (a `let` seeded from one and assigned the other, D15402);
- a hand to an annotated parameter;
- a recursive call that permutes the parameters.

Giving each parameter a fresh type parameter (`f<F, F__1>`) instead of a hole turned three
handed generics into a refusal, which the hole spelling runs.

The slice deletes no mono rule yet. Measured over the `@run` files, with the split plan on:
- D6090's keep-own-pin and `monoFwdCarriedRewrite` are deleted. The last file that needed them
  is `generic-fn-value-type-param-params-swapped-into-other-generic`, a group handed on to another
  generic's group. It runs once the check treats that hand as one shared set:
  `fnTagOwnTyParamShared` accepts arguments that read the caller's parameters of one type
  parameter, and `elabMintFwdTarget` records the hand as a forward. With that, no instance leaves
  the set partial, and the late decision tags it without the optimistic round the coordinator
  ruled for. That round was built, measured and found unnecessary, so it is not landed.
- The set pin through `fnTagOwnTyParamShared` fell from 12 files to 7: written copies, swaps and
  aliases.
- The copy pin in `monoLetTyParamMisfit` is still reached by 11 files.

Besides the programs, four kinds of reader ask the plan, and each must lose its question before the files go:

- the checker: the D14439 rule that leaves a choice of names called at two instances untagged because the plan splits it, which is H-choice's mechanism;
- the driver: `vl check` asks the plan when the instance error channel raised (`fsAsked`), and the channel's kept-program filter;
- mono and the emitter: the refusal sites that request a split (`fsAsk*`: 28 calls in `emit_mono.vl`, 6 in `wasmEmit.vl`);
- the tests that pin the plan's own behaviour.

No dependent would turn into a miscompile if the plan were deleted today: H-choice's 3 such rows run since #5838. The checker no longer requests a split (#5870).


### 3.3 Retiring the flow table, reader by reader (proposal, 2026-11-05)

`fn_flow_shadow.vl` (139 functions) is the last producer of function-value facts outside the
elaboration. It is a union-find over the checked tree's bindings. Each class records the functions
that flow in (sources) and the closed signatures it is called or annotated at (pins). Mono reads it
through 32 entries from 48 functions. The cad lane's coverage probe hit 138 of the 139 functions
over 23,803 programs, so there is no dead code to plan around.

**What the table carries, measured.** On master `63dae4dc` (fixpoint seed), each group of entries
was cut to its no-table answer, and the 5,792 `tests/cases` files marked `@run` were run before
and after. A file counts as moved if its output changed.

| group | entries | mono readers | files moved | of which print nothing |
| --- | --- | --- | --- | --- |
| whole table (`fnFlowTableBuild` skipped) | 32 | 48 | 135 | 121 |
| sources and writes | `fnFlowDeclWritten`, `fnFlowReadWritten`, `fnFlowReadGenFn`, `fnFlowDeclPathSrcs`, `fnFlowDeclPathHeldSrcs` | 13 | 47 | 47 |
| pins | the 13 `fnFlow*Pin*` entries, plus `fnFlowDeclPathUncalled` | 24 | 84 | 70 |
| hole-lambda chains | `fnFlowLamPin`, `fnFlowAliasLam`, `fnFlowCellLam`, `fnFlowRespellLam` | 7 | 7 | 7 |

- The groups overlap only between sources and pins (14 files). Together they cover 119 of the
  whole-table population's 135.
- The other 16 move only when the table is not built at all. They are reached through
  `fnFlowDeclFn`, `fnFlowStageInstHoles` and the slice helper.
- 108 of the 135 are under `closures/`.

**What the elaboration already records for each group.**

- **Sources and writes.**
  - The write index (`cwBindingWrittenValues`, check_write_scan.vl) answers whether an `=` writes
    a binding and with what.
  - `fnTagSharedArgDecl` follows the same un-annotated `const` alias chain that `fnFlowReadGenFn`
    does.
  - A slot's held functions are the members of the set its type carries
    (`fnTagMembers(fnTagSetOfTy(..))`), now including the joins at a shared type parameter
    (`fnTagCallJoinOf`) and at a list, record or map slot.
  - The one gap is the capture cell (`let d = [v]`, `d[0] = v`). The cell is built after the check
    by emit_collect's rewrite, so the write index never sees it. Either the rewrite records its
    cells as writes, or the cell reads its binding's set.
- **Hole-lambda chains.**
  - The elaboration instances a hole lambda at each closed signature a call through its set
    takes (hole rows, `elabHolePinNote`).
  - The four entries name a lambda through `const` and `let` chains and capture cells, so that
    mono can find the instance. The elaboration resolves the same chain at the call, so the
    instance is the hole row keyed at the callee's set. The cell is the gap again.
- **Pins.** A pin is a closed parameter list some call or annotated destination delivers a slot's
  value at. The elaboration has these facts per instance, not per class:
  - each call's bound parameter types (`elabCallParamTy`, `elabNodeTy(ix, k)`);
  - each member's instance at those types (`elabMemberKeyAt(d, pTys)`);
  - each closure delivery at a closed type (`mintCloDeliveryNote`).

  An agreed pin (`fnFlowDeclPathAgreedPinTys`, `fnFlowDeclPathOnlyPinCall`) is then "every member
  of the slot's set has one instance key". The per-call pins (`fnFlowDeclPathPinTysAt`,
  `fnFlowCallPath*`) are that call's instance types. Annotation pins (`fnFlowDeclPathPinRets`,
  `fnFlowCallPathAnnPinTys`) need the delivery types recorded with a result, which today's
  delivery rows do not carry. `fnFlowDeclPathUncalled` is "no member has an instance and the set
  escapes nowhere". That needs an escape fact the elaboration does not have yet.

**Order.** Each step cuts its readers to the elaboration's answer, grades the cut at 0 movers with
the split plan on and off (the byte-diff sweep, error fixtures included), then deletes the
entries.

1. **Hole-lambda chains** (7 files, no overlap). Landed 2026-11-05; fn_flow_shadow.vl is down
   from 139 functions to 128.
   - The alias, cell and respell chains read `check_lam_chain.vl`. For each un-annotated binding
     it records the initializer, the values written to it and the function declaring it. These are
     source facts noted from the write index before `captureBoxRewrite` turns a captured `let` into
     a cell. The rewrite mutates that `let` in place, so a cell read names the same binding.
   - The one pin a lambda's class agrees on is the one parameter list that every elaboration
     instance of the lambda closes at (`elabDeclOnePin`).
   - Of the 7 files, the chains carry 5 and the pin carries 2.
2. **Sources and writes** (47 files). `fnFlowDeclWritten` and `fnFlowReadWritten` move to the write
   index. `fnFlowReadGenFn` moves to `fnTagSharedArgDecl`. `fnFlowDeclPathSrcs` and
   `fnFlowDeclPathHeldSrcs` move to the members of the slot type's set. The 14 files shared with
   pins are graded again in step 3.
3. **Pins**, by reader family, smallest population first:
   1. agreed and only-call pins, read off member instance keys;
   2. the per-call pins `monoRetypePinCalls` and `monoHoleOwnCallsDiffer`, read off the call's
      instance types;
   3. the slot pins `monoPinListElems`, `monoStoredSlotFnTy`, `monoFlowSlotPins` and
      `monoDeclPathKeys`. This is the (γ) e/f population in §3.1; its open rows go first;
   4. annotation pins, once a delivery row records its result;
   5. `fnFlowDeclPathUncalled`, once an escape fact exists (below).

**The escape fact `fnFlowDeclPathUncalled` needs** (2026-11-05). The table answers "uncalled" for slot
`(d, path)` when no pin reaches the slot's class and the class is not marked *top*. A pin is a call
or an annotated delivery. The only writer of *top* is `ffOpaque`: a function-typed argument handed
to a callee the program does not declare (a builtin, a host import, an unresolved name). Its calls
happen where no fact can see them, so the slot has to be treated as called.

- **What it means.** Function `f` *escapes* when a value holding `f` is passed as a positional
  argument to a call whose callee resolves to no declared function and is not a call through a
  function value. Escape is a fact about the function, not the slot. Under §2.2 a slot's value is
  one of its set's members, so a slot escapes when one of the functions it holds escapes.
- **Who writes it.** The check's last pass over the source program (`lamChainSnap` in
  check_lam_chain.vl, at `elabPrepareRun`, before any emit rewrite), as `fnEscapes(f)` (private as `_fnEscapes` until this reader lands):
  - at each such call, for each argument whose type carries a set, every member of that set;
  - for an argument naming a declared function directly, that function.
  - The answer is the same in every instance, because it depends on the callee being opaque and on
    the argument's set, and neither changes per instance. One set per compile, reset with the
    elaboration's other rows.
- **What reads it.** `uncalled(d, path)` holds exactly when all three are true:
  - `elabSlotSetCalls(d, path)` is empty: no call through the slot's set, or through a join that
    holds the set;
  - the split-dep lane's `elabSlotDeliveries(d, path)` is empty: no closed delivery;
  - no function `elabSlotHeldFns(d, path)` returns has escaped.
- **What it replaces.** The table's per-class *top* label, which is the only escape the table
  records.
- **Globals and exports.** The table marks neither, and does not need to:
  - A module global is a binding in the one merged arena. Every read of it is a node the program's
    own facts see, and a call through it is a call through its set.
  - A binding another module imports is in the same compile, because modules are merged before the
    check.
  - The host is handed only scalar module bindings as wasm globals (`exportGlobalRows`), so a
    function value never reaches it that way.
  - An opaque callee can therefore only receive a function as an argument at its own call, and
    that call is where the fact is written. A function stored first and passed later escapes at
    the later call. A value written into a container that is later handed to an opaque callee escapes through
  the container's type, which carries the same set, so the set-keyed fact covers it without
  following the container.
- **Acceptance.** The uncalled cut's 3 files:
  - `closures/generic-stored-through-map-param-read-only-by-length.vl`;
  - `closures/hole-fn-generic-map-handed-two-maps.vl`;
  - `closures/hole-helper-pushes-listed-member-onto-uncalled-list.vl`.
  Plus one control, where an uncalled-looking slot's function is passed to an opaque builtin, so it
  must not be answered uncalled.

   Each family is measured alone by its own cut before it is scheduled.

**The uncalled family, landed** (2026-11-06). `elabSlotUncalled(d, path)` answers it from the
elaboration: no call reads its callee from the slot (`fnSlotCalled`, the checker's per-slot call
index), no call goes through the set its type carries (`elabSlotSetCalls`), no closed delivery
(`elabSlotDeliveries`), and no function it holds escapes (`fnEscapes`). Shadowed against the
table at its three mono readers, it agreed at 159 of 165 site-hits until two gaps closed: a call
through a one-member set reads its callee from the slot but the set records no call, and a `for`
variable over a list is that list's element slot (`calleeSlotOf`). Then 165 of 165.
`fnFlowDeclPathUncalled` is deleted.

**Census of the remaining non-slot readers** (2026-11-06, master `214bc5d9`; witnesses are the
`tests/cases` files where the entry gives a non-default answer):

| entry | family | mono callers | witness (hits / files) | elaboration answers today |
| --- | --- | --- | --- | --- |
| `fnFlowDeclPathOnlyPinCall` | agreed, only call | monoPinOpenCallLams | `generics/hole-call-generic-lambda-arg.vl` (91 / 32) | retired: `elabValueOnlyCall`, the forward climb's one call |
| `fnFlowDeclPathAgreedPinTys` | agreed | monoHeldSrcsFnTy, monoHoleGenBindFnArgs | `closures/hole-fn-in-unannotated-map.vl` (2 / 2) | as above |
| `fnFlowDeclPathAgreedPinTysSkipping` | agreed | monoElemFnPinTys | `closures/hole-fn-if-join-result-handed-hole-fn.vl` (10 / 5) | as above |
| `fnFlowCallPathAgreedPinTys` | agreed, per call | monoPathSlotPinnedFnTy | `closures/generic-fn-in-unannotated-map.vl` (9 / 5) | the call's instance types |
| `fnFlowCallPathAnnPinTys` | annotation | monoPathSlotPinnedFnTy | none in `tests/cases` | no: delivery rows record no result |
| `fnFlowPinSigOf` | spelling helper | 4 | `maps/function-valued-map.vl` (3,523 / 554) | needs no table; the table uses it too |
| `fnFlowElemKind` | syntax | monoPlaceRoot | `std/array-sorted.vl` (3,608 / 495) | needs no table; the table uses it too |
| `fnFlowWholeSliceRecv` | syntax | monoFlowSliceAsSpread | `closures/generic-list-slice-copy-own-instances.vl` (7 / 2) | needs no table; the table uses it too |
| `fnFlowDeclFn` | rest | monoDeclFrameIn, monoReadIsBinding | `loops/loop-value.vl` (67,693 / 1,188) | retired: `elabDeclFnOf` (`recEnclosingFn`, through a minted `let`'s anchor) |

The last three are also read by the table's own walk, so they leave with the file. The four
programs `monoHoleGenFnPin` still has no elaboration answer for split across families: the only-call
pin (`closures/generic-fn-value-returned-through-identity-hole.vl`, D12340), the skipping agreed pin
(`closures/hole-fn-if-join-result-handed-hole-fn.vl`) and the uncalled slot
(`closures/hole-helper-pushes-listed-member-onto-uncalled-list.vl`). The agreed family's missing fact
is a pin fixed by calls through a function's result (`fw(x)(y)`, `mk(g).f(3)`).

**The only-call pin is the slot-delivery climb's calls** (2026-11-06, measured on #6465's head
`732c3b24`, a probe recording every call `elabReadOn`'s callee arm reaches during
`elabSlotDeliveries` / `elabSlotClimb` from the value `monoHoleGenFnFlowDecl` names). Against
`fnFlowDeclPathOnlyPinCall` over the 55 `tests/cases` files the table answers in, counting
site-hits:

| result | hits | files | cause |
| --- | --- | --- | --- |
| agree | 68 | 22 | the forward climb's one call is the table's |
| table only | 18 | 11 | forward gap: the argument edge in `elabReadOn` and `elabSlotAliasOn` resolves a callee only through `identFnDeclOf`, so a call through a function value (`const k = lap; k(id)`, `fs[i](add)`, `if c { p } else { q }` as the callee) stops the climb |
| elaboration only | 35 | 13 | the table's class is a bidirectional union: `keep((x) => x + 1)` is called only at `q(7)` inside `keep`, but `lap(f) { f(2.5); f(3); keep(f) }` puts `lap.f` and `keep.g` in one class, so the table declines |

No new fact is needed: the climb already follows a value through argument passing, aliases,
joins, returns, element and field writes and capture cells, and the agreed and skipping pins are
the same climb's calls with the same forward gap.

**The forward answer is adopted** (coordinator ruling): it is more precise than the class union,
which pins a value at calls that never reach it. The union also kept the reps of a shared slot
aligned, and that is the condition the switch carries. A slot one value reaches as a plain closure
and another as a bundle (`keep.g` above) is called through one body, so the call site has to serve
both reps. The switch therefore lands:

1. after the forward gap closes (a callee resolved through the value it reads);
2. graded on output, not bytes alone, with 0 runs → not-runs over the 35 sites that change;
3. with a witness of the shared-slot shape (a lambda and a bundle reaching one parameter called
   once) that runs and prints the right values;
4. falling back to the table's answer wherever the forward answer moves output or validity, each
   fallback named here, rather than a wider rule.
**The slot-delivery family, landed** (2026-11-06, #6465). `monoDeclPathKeysIn` reads `elabSlotDeliveries`; `rets` mode stays on the table. Known over-width: `closures/binding-copied-through-uncalled-chain.vl` lowers one closure with an unused trailing `i32` parameter that its call site fills (output unchanged), for a later rep pass to drop.

**The slot readers of the agreed pin, landed** (2026-11-06). `monoPathSlotPinnedFnTy` and
`monoHeldSrcsFnTy` read a slot's pin from the checker's per-slot call index
(`slotCallArgsInto`, check_calls.vl) in place of `fnFlowCallPathAgreedPinTys` and
`fnFlowDeclPathAgreedPinTys`. Shadowed at both sites over `tests/cases`, the index first agreed
at 8 of 14 site-hits. Two gaps closed the rest:

- a call through a `const` copy of a list (`const bs = [...ps]; bs[0](2)`) is noted at the
  binding the copy reads, so the reader asks that binding (`calleeSlotHolderOf`);
- one call with no arguments (`ks[0]()`) is a tuple, not the absence of one
  (`fnSlotCallArgsInto`).

That gave 11 agree with equal tuples, 3 where neither answers, and none on one side only. The
reader is unkeyed by call. The table's per-call narrowing moved no file: fixpoint seeds against
master build all 7,538 sweep programs byte-identical with the split plan on and off.
`fnFlowCallPathAgreedPinTys` is deleted. `fnFlowDeclPathAgreedPinTys` stays for
`monoHoleGenBindFnArgs`.

**The forward gap, closed** (2026-11-06). Both argument edges of the climb resolve a callee
through `elabCalleeFns`. That is the declared function a name calls, else each function the slot
it reads can hold: an alias, a list element, a joined value, or a written `let` and its writes.
The only-call shadow on master `0e6d2104f`, over `tests/cases` (site-hits):

| | agree | table only | elaboration only | neither |
| --- | --- | --- | --- | --- |
| before | 68 | 18 | 35 | 80 |
| after | 81 | 5 | 53 | 62 |

The 5 table-only hits left:

- 2 are D15444's order rule;
- 1 is D15455's parameter-written record field;
- 2 are D6883's annotated copy stored in a record (`const b: F = a; const r = { f: b };
  r.f("w")`), whose climb stops at the annotated `const`. Fixpoint seeds build all 7,538 sweep programs byte-identical
with the split plan on and off, so this is shadow-only until the only-call reader switches. The
shared-slot witness is `closures/shared-slot-hole-fn-and-closure-through-function-value-callee.vl`.
Its failing twin, through a list or joined callee given a hole function and a closed-typed
function, is D15484.

**The only-call pin, switched** (2026-11-06). `monoPinOpenCallLams` reads `elabValueOnlyCall(d)`,
the forward climb's one call. It falls back to `fnFlowDeclPathOnlyPinCall` in two named cases:

- the climb reaches none, which covers the 5 table-only hits above;
- the value is one the write index does not cover (minted after its build), whose climb would
  read an index row that is not there.

Graded on fixpoint seeds against #6471, over all 7,538 sweep programs with the split plan on and
off:

- 0 runs → not-runs;
- 1 file builds different wasm, `closures/generic-returned-to-un-annotated-param-lambda.vl`. Its
  output is unchanged, and the only difference is an unreachable stub's signature.

Without the second fallback, `generics/hole-fn-arg-through-hole-callee.vl` trapped the compiler.
The shared-slot witness is `closures/shared-slot-hole-fn-and-closure-through-function-value-callee.vl`.

**The only-call fallbacks, closed** (2026-11-06). The climb's call search now goes on through a `let`
annotated with a type parameter, through a value written into a named binding's field, into a callee
an argument adapter wraps, and through a call whose callee is a `for` loop variable or a read a
rewrite re-resolved past the index (`elabCalleeFns`). The second fallback had no hit left: the climb
skips an uncovered value, and the table answers none there either. With the table compared at
every only-call site over all 19,309 sweep programs, no site disagrees, and
`fnFlowDeclPathOnlyPinCall` is deleted.

Two routes record the calls a value reaches, and they count different sets. The only-call search
(`elabValueOnlyCall`) records through `elabCallRec`, in the climb's callee edge, before the
`elabNoCallParam` and `elabDlvOmit` filters. `elabCallSink` (`elabSlotOnlyCall`, and the agreed
reader's `elabValueAgreedCallTys`) records in `elabCallDeliveryAdd`, after them. Neither query is
answered from the slot memo. They are not unified, so a reader of one cannot assume the other's
answer.

**The agreed pin's parameter readers, switched** (2026-11-06). `monoElemFnPinTys` (skipping) and
`monoHoleGenBindFnArgs` (lamparam) now read `elabValueAgreedCallTys(d, skip, tys)`. That is the one
closed argument tuple across the calls the value reaches as their callee, recorded through
`elabCallSink` (which bypasses the delivery memo), leaving out calls inside `skip`.
`fnFlowDeclPathAgreedPinTys` and `fnFlowDeclPathAgreedPinTysSkipping` are deleted.

- **Skipping site, shadowed over `tests/cases`:** 10 agree, 0 table only, 12 elaboration only,
  29 neither, 0 differ.
- **Lamparam site:** reached by no program in a population of 23,451. That population is
  `tests/**`, the distilled corpus (cells and named, 11,774 files) and both inventories'
  single-file witnesses. The control is an entry marker in `monoHoleGenBindFnArgs`: it fires once
  (`closures/generic-returned-to-un-annotated-param-lambda.vl`), with its parameter loop run
  twice. The zero excludes programs written inline in `tests/*.ts`, so the arm is switched, not
  deleted.

Fixpoint seeds against master `3682cc74` build all 7,538 sweep programs byte-identical with the
split plan on and off, the 12 elaboration-only answers included. The shared-slot witness runs.

4. **The rest.** `fnFlowElemKind` and `fnFlowWholeSliceRecv` are syntax, and move out with
   the helpers they need. `fnFlowDeclFn` becomes `recEnclosingFn`. `fnFlowTableBuild` and
   `fnFlowShadowBegin` go with the file.

**The annotation pin is live** (2026-11-06). `fnFlowCallPathAnnPinTys`, read only by
`monoPathSlotPinnedFnTy`, returned no pin on any of 23,374 programs: `tests/cases`, the distilled
`cells/` and `named/`, and the 4,065 filed witnesses of both inventories. Its call site is reached
in 4 of them. It does return a pin on an inline program of `tests/vl_fn_set_rep_test.ts`
(`storedInListDelivered`), which no corpus holds:

```vl
function inc(a) { return a + 1 }
function dbl(a) { return a * 2 }
function sel(c: boolean) {
  if c { return inc }
  return dbl
}
function ap(f: (x: i32) => i32, x: i32) { return f(x) }
const fs = [sel(true), sel(false)]
print(ap(fs[0], 3))
```

The list `fs` reaches the annotated parameter `f` only through an element read handed on, so no
call passes the slot's parameters (`slotCallArgsInto` finds none) and only the annotation pins
them. Without the pin the program builds a different module from its `sel(c): (a: i32) => i32`
spelling, which the test asserts it must not. The pin stays until the elaboration answers an
annotation delivery of a list element; a corpus fixture of this program should land first, so the
sweep sees the next attempt.

**Deletion checklist** (2026-11-06). These are what `fn_flow_shadow.vl`
still exports and who reads each one. The file goes when every row is checked.

| export | read by | owner | replacement |
| --- | --- | --- | --- |
| ~~`fnFlowDeclPathOnlyPinCall`~~ (done, #6480) | `monoPinOpenCallLams` | lane F | the forward climb's one call (`elabValueOnlyCall`) |
| ~~`fnFlowDeclPathAgreedPinTys`~~ (done, #6479) | `monoElemFnPinTys`, `monoHoleGenBindFnArgs` | cad | the agreed pin read off member instance keys or the check's slot-call index |
| ~~`fnFlowDeclPathAgreedPinTysSkipping`~~ (done, #6479) | `monoElemFnPinTys` | cad | as above, with the skipped functions' calls left out |
| ~~`fnFlowCallPathAnnPinTys`~~ (done) | `monoPathSlotPinnedFnTy` (via `monoListSlotPinnedFnTy`) | builder | `slotAnnFnTyOf`: the closed function type a parameter is annotated with, noted where a slot read is handed to it (`fnSlotAnnNote`) |
| ~~`fnFlowDeclFn`~~ (done, #6475) | `monoDeclFrameIn`, `monoReadIsBinding` | lane F | `recEnclosingFn` |
| ~~`FF_PIN_DECLINE`~~ (moved: `PIN_DECLINE`, `emit_sig_tokens.vl`) | `monoDeclPathKeys`, `monoDeclPathKeysIn`, `monoDeclPathPinsPerInstance`, `monoSlotRetName`, `monoSlotRetCount` | builder | none needed: its readers are all mono's own, so the sentinel moves to a module mono imports |
| ~~`fnFlowPinSigOf` (with `ffPinSpell`)~~ (moved: `pinSigOf` / `pinSpell`, `emit_sig_tokens.vl`) | `monoDeclPathKeysIn`, `monoElemPinTysUnder`, `monoFlowSlotPins`, `monoPinFnParamTys`, `monoReachSlotPins` | builder | none needed: pure spelling of a parameter list; moves beside `sigKeyOfTy` in `emit_sig_tokens.vl` |
| ~~`fnFlowElemKind`~~ (moved: `elemSlotKind`, `emit_query.vl`) | `monoPlaceRoot` | builder | none needed: a node's type is a map or not; moves to `emit_query.vl` |
| ~~`fnFlowWholeSliceRecv` (with `ffTyHasFn`)~~ (moved: `wholeSliceRecv` / `tyHasFnDeep`, `emit_query.vl`) | `monoFlowSliceAsSpread` | builder | none needed: syntax plus a deep function-in-type test (`crTyHasFn` is shallow, so `ffTyHasFn` moves with it); moves to `emit_query.vl` |
| ~~`fnFlowTableBuild`~~ (done, with the file) | `monomorphize` | lane F | deleted when the cad and lane F rows are done |
| ~~`fnFlowShadowBegin`~~ (done, with the file) | `runEmitPasses` (emit_sections) | lane F | deleted with the build; its one outside reset, `tyHasFnMemoReset`, is called there directly |

The four "moves" rows can land now and independently: none needs the table, and `emit_mono.vl`
takes no new functions. The file is deleted after the last cad and lane F rows, together with the
build and begin hooks and the budget row.

**`fn_flow_shadow.vl` deleted** (2026-11-06). Every row above is checked, and the file goes with
`fnFlowTableBuild` in `monomorphize`, `fnFlowShadowBegin` in `runEmitPasses`, and its row in the
pin-helper budget, which now holds `emit_mono.vl` alone.


---

**A shadow compares three outcomes, not two** (2026-11-06). A reader switch has to agree on the
answer when both sides answer, *and* on declines: where the old reader declines, the new one has
to decline too. A caller's later fallbacks treat "declined" differently from "pinned", so an
answer the new side alone gives is a behaviour change until a sweep proves otherwise. Measure at
the function that is being replaced, not at a downstream site that sees only the final answer.

The worked instance is `monoHoleGenFnPin`. The elaboration's answer, `et` where it closes and
otherwise the argument read's one same-arity delivery, matched the final pin at all 230 site-hits
of `monoPinHoleParam`. Switched inside `monoHoleGenFnPin`, it broke two programs and changed one
program's output. Measured at the function over 23,456 programs (`tests/**`, the distilled corpus
and both inventories' witnesses), against the chain it would replace:

| source | site | agree | old only | new only | differ | both decline |
| --- | --- | --- | --- | --- | --- | --- |
| `et` at the frame's key | hole | 35 | 8 | 114 | 0 | 1 |
| `et` | type parameter | 6 | 2 | 5 | 0 | 6 |
| argument read's delivery | hole | 42 | 0 | 52 | 1 | 63 |
| argument read's delivery | type parameter | 8 | 0 | 5 | 0 | 6 |

The chain itself no longer reads the flow table. `monoHoleGenFnFlowTy` reads `elabSlotDeliveries`
and `elabSlotOnlyCall` at the read's binding, so there is no table reader to retire here, and the
57 new pins would be a capability change to grade one by one. `monoHoleGenFnPin` stays as it is.

**Named follow-up: the 57 new pins.** The argument read's delivery answers at 52 hole-site and
5 type-parameter-site calls where `monoHoleGenFnPin` declines today (the table above). Taking
them is a capability change, not an alignment. Each is graded on its own: an output sweep, the
run of each moved program, and a named fallback where it moves. Three of them, as first
switched, broke `generics/list-of-fns-at-generic-list-param.vl` and
`closures/hole-fn-list-row-index-alias-and-generic-arg.vl` and changed the output of
`functions/hole-lambda-literal-two-instance-types.vl`.

**The reach pair reads the climb (2026-11-06).** `monoReachListTy` and `monoReachRecTy` are
deleted. A list or record literal's open function slot is typed at the forward climb's agreed call
tuple (`elabLitSlotCallTys`) and each value's result there (`elabResultAtParams` where the template
leaves it open). value_reach's `vrCalleeTy` stays as the gate: a slot it finds no one call type for
is left open, as before. Of the 380 slots it types over the 23,103 programs (every `tests/cases`
entry, both inventories, the distilled corpus), 333 take the climb's answer. One of those differs
from value_reach's: `named/d15209_fs_in_list_half.vl` types `[half]` at `(i32) => f64` where
value_reach gave `(i32) => i32`, and that program refuses either way. The other 47 keep
value_reach's own type as a named fallback:
- 27 whose call type keeps the enclosing generic's own type parameter, which the climb's closed
  tuple cannot carry (it needs a per-instance tuple);
- 14 whose one call passes a generic or hole function;
- 4 the climb reaches no call for;
- 2 with a spread element.
A byte sweep of the 23,103 against master's fixpoint seed differs on none.

**Named follow-up: the 222 new reach slots.** The climb answers 222 slots value_reach leaves open:
- 173 whose value reaches a place value_reach does not follow (`vrLostIn`);
- 33 whose call sits in a template whose result stays open;
- 16 where value_reach finds no call.
None of the 222 is a slot called at two closed types. Taking them is a capability change, graded one
by one like the 57 above.

### 3.4 emit_mono's decision arms, measured (2026-11-05)

A coverage probe counted, per program, every `if`/`else` body in `emit_mono.vl` at master f0caaf0:
5,575 arms, over 23,810 programs (every `tests/cases` file, the distilled corpus, every filed
witness in both inventories). The counter was validated on `monomorphize`'s own arms before any zero
was read. A *decision arm* records a node type (`nodeTyRecord`, `monoRetype*`, `monoRecordOpen`) or
returns a computed pin; an arm that refuses (`emitFail`, a `*Fail` helper) is a refusal arm.

**Arms are not deleted on zero hits** (coordinator ruling). A dead function's callers are already
unreachable; a dead arm sits in a live function, and deleting it reroutes an unmeasured program to the
next rung. `monoArgTyNameRep`'s scalar tail (`exprIsF64` to `"f64"` and its neighbours) is unreached,
and its cascade ends in `"i32"` (D23): deleting a rung would pin an unmeasured f64 argument at `i32`,
a clause-1 miscompile no corpus program sees. The zero list is a map of what earlier rungs or the
elaboration already decide:

- 46 decision arms with no hit, by function: `monoArgTyNameCascade` (2), `monoArgTyNameProjected`,
  `monoArgTyNameRep` (14), `monoCallWrittenLet`, `monoCapturedDestListPin`, `monoCoerceChoiceBinding`
  (2), `monoCopyCellRead`, `monoHeldRecPaths`, `monoHoleGenFnPin`, `monoInitHeldTy`,
  `monoLoopVarRecordPin`, `monoModuleLetPin` (2), `monoPinCallRecord`, `monoPinFieldContainer`,
  `monoPinFieldValue`, `monoPinOpenCallLams`, `monoPinWidened`, `monoPinnedAnnTyAt`,
  `monoRecordInstOpen`, `monoRecordPinnedRecv`, `monoRetConstRecord`, `monoRetypeCallsAt` (5),
  `monoRetypeLamCells` (2), `monoRetypeMethodReads`, `monoSigFnTyNameAt`.
- 36 refusal arms with no hit, kept: `monoBindExplicitTyArgs`, `monoBindingAtPin` (2),
  `monoBundleNamedPin` (2), `monoBundlePinArg`, `monoBundleRecordTy`, `monoCloCoerceBuild` (2),
  `monoClosureBundlePin`, `monoCoerceWrittenCell` (3), `monoHandWrittenLet` (2),
  `monoIfChainRebuildPinned`, `monoInertArgsStubbed`, `monoInstantiateCallIn`, `monoLayoutConstOf`
  (2), `monoLetTyParamMisfit`, `monoMakeInstanceGo` (2), `monoMakeInstanceLater` (2),
  `monoMakeInstanceParams`, `monoMakeInstanceWalk`, `monoNicheNulListCheck`, `monoOpenCallAtElems`
  (2), `monoPinColsMisalignedFail`, `monoPinHoleParam`, `monoPruneTemplates`, `monoShadowRenameDecl`
  (2), `monoTwoListArgFail`.

**The most-reached decision arms are the next stage's queue**, each to be shadowed against the
elaboration fact that should carry the same answer: `monoWalkIdentCall`'s instance of a generic call
(9,384 programs, D3961), `monoHoleGenFnPin` (7,937), `monoPinNoteReturns`,
`monoNarrowedNominalPinName`, `monoReachListTy`, `monoCloneGenericCallArm` (D12702),
`monoReachRecTy`, `monoCloPinAnnNodeOfExpr`, `monoMakeInstanceGo`'s instance note,
`monoIfChainRebuild`, `monoPinBodyLambdasRaw` (D1990), `monoCloneGenericCalls` (D2849, two arms),
`monoCloneLambdaSubst` (two arms, D943 and seven more), `monoPinLamFromCheckedTy` (now `monoPinLamAtDelivery`; D3820, D3834).

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
invalid wasm. That was [D15500](inventory/D15500.md), live on master in other spellings: a
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

G2's write through a parameter (D15492) lands in the caller's map with its set; what refused it
was the store into the parameter's slot, which the tag rule now takes when every call hands a
holder of the set or a wider one decided with it (`ftParamHolderHolds`), and only for a written
value naming a declared function, whose set no call changes. Bucket 1 is 32 parameters in 16
programs. The map pin (`r5_rt`, the argument's checked type) still answers 13: 5 in D9480's
fixture, whose map holding a non-generic keeps the set untagged, 3 written as a record `{f: id}`,
3 an uncalled set (G5), and 2 outside bucket 1. The 3 record-written hits are all in
`closures/hole-fn-generic-map-stored-through-parameter.vl`, whose `{id}` set three maps keep on
mono, each alone: `c`, written only directly (served since D15532); `b`, a map of records
a helper widens to two generics (D15493); and `h`, a map of functions a helper widens to two
generics (served since D15531: the helper's write is the member's leaf, `fnTagMapWriteLeavesOf`).
They move only when `b` is served too.

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
  on master (a decline, not a refusal). Two different generics in one map of records still refuse
  loudly (D15493).

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

**Exit checklist: the pin helpers, census of 2026-11-06** (master `d0f6b7722`, 1,090 functions,
then #6491: 1,088). Every function the pin-helper budget counts is classified by what its decisions
read. A decision is a pin a function returns, a type it returns or records, or a gate choosing
between them. A function with several sources takes its weakest.

| class | reads | functions |
|---|---|---|
| a | the elaboration | 82 |
| b | the checker's node type or another checked fact | 146 |
| c | no type decision: syntax, cloning, renaming, registries, walk drivers | 635 |
| d | a mono-derived decision no elaboration fact owns yet | 225 |

(c) stays: mechanics are not a pin decision. (b) stays while the checked fact is the answer at the
instance. **(d) is the work list**, and "shrink the pin helpers" is done when it is empty. Each (d)
function is graded against its owning fact by the three-outcome shadow above, then switched or
deleted. The count is programs, of the 23,456, that reach any arm of the function, from an
arm-coverage run of 5,566 `emit_mono` arms. A walk driver reads high, so it ranks a family; it is
not a hit count for one decision. 209 of the 225 have an arm reached; 16 have none.

| family | owning elaboration fact | functions | programs reached, most | held by |
|---|---|---|---|---|
| unbound default | an elaboration-owned default for an unbound type parameter or hole | 12 | 18,170 | split-dep |
| slot held fns | `elabSlotHeldFns` of the binding or slot | 29 | 9,604 | split-dep |
| slot deliveries | `elabSlotDeliveries` of the binding or cell | 9 | 9,601 | — |
| node type | `elabNodeTyAt` at the instance | 29 | 9,592 | blocked on Fn#d |
| slot type | `elabSlotTyAt` / `elabSlotTys` of the slot | 27 | 9,578 | — |
| lambda sigs | `elabLamParamSigs` | 11 | 9,023 | lane F |
| instance binding | the instance key's binding (`ekTys`, `elabInstTyAt`, `elabParamTyOwnAt`) | 34 | 9,023 | reach, split-dep |
| literal arm row | the record solve's literal arm row (`litArmRowOf`) | 5 | 8,956 | — |
| value returns | `elabValueReturnsFrom` | 7 | 8,077 | reach |
| instance result | `elabRetOf` at the instance key | 10 | 8,023 | reach |
| walk type | `elabWalkTy` / `elabWalkNarrowedTy` at the instance | 33 | 7,470 | reach |
| call param | `callArgRepTy` over `elabCallParamTy` | 13 | 5,624 | split-dep |
| uncalled slot | `elabSlotUncalled`, and a default for an uncalled slot | 6 | 4,712 | — |

- [ ] **unbound default** (12): `monoElabDefaultsPrime` 18,170, `monoHoleGenFnFlowTy` 7,941, `monoChoiceArmFlowTy` 7,929, `monoDefaultTyParamsOnlyGenFns` 5,541, `monoArgClosedPin` 2,657, `monoUncalledSlotFnTy` 318, `monoUncalledListElems` 225, ~~`monoUnboundDefaultTy` 90~~, `monoBindTyParamDefault` 50, `monoDefaultUnboundTyParams` 21, `monoHoleFnPinTyOf` 21, `monoUncalledNestedListElems` 15.
  An empty `[]` argument of an unbound call is built at the elaboration's default instance
  (`elabArgBuiltTy`: the callee's parameter at that instance's bindings), which `monoArgClosedPin`
  reads where mono's own default rung was: 12 decisions in 6 programs, all byte-identical.
- [ ] **slot held fns** (29): `monoWalkIdentCall` 9,604, `monoWrittenGenLetFrame` 9,601, `monoFlowReadsAll` 9,597, `monoFlowLetCalls` 8,067, `monoFlowLetVals` 7,770, `monoFlowParamVals` 7,769, `monoFlowDeclVals` 7,740, `monoFlowValsOf` 7,511, `monoCoerceWrittenLetTys` 5,811, `monoFlowReadsRound` 2,993, `monoFlowUsePlanAt` 2,921, `monoArmWrittenLetSeed` 1,627, `monoFlowAliasReadVals` 1,174, `monoFlowLetLeaf` 655, `monoFlowRetLocalLists` 581, `monoFlowKeptIndexElem` 511, `monoFlowMapVals` 384, `monoFlowDirectSet` 186, `monoFlowAliasMaps` 170, `monoFlowElemsGen` 105, `monoFlowLetMapLeaf` 75, `monoFlowReadElemAt` 72, `monoFlowMapReadVals` 50, `monoFlowLoopVarVals` 26, `monoFlowReplanPending` 18, `monoLetSeedGenFe` 5, `monoCellCall` 5, `monoFlowReadElem` 0, `monoFlowUsePlan` 0.
- [ ] **slot deliveries** (9): `monoCallIfBound` 9,601, `monoCallWrittenLet` 9,597, `monoPinListElems` 6,819, `monoCoerceWrittenCell` 913, ~~`monoReachSlotPins` 546~~, ~~`monoDeclPathPinsOrReach` 173~~, `monoStoredSlotFnTy` 152, `monoRetLitElemTy` 81, ~~`monoReachSlotPinsAt` 78~~.
- [ ] **node type** (29): `monoCloseRetFnTy` 9,592, `monoInitHeldTy` 6,742, `monoArgClosedTyIn` 5,475, `monoPinBin` 4,320, `monoPinnedOperandTy` 3,781, `monoSubstLetType` 3,348, `monoCloneLetDecl` 3,020, `monoCoerceListCbArg` 2,889, `monoPinReturnedObj` 1,945, `monoCbFnListRowSpell` 1,107, `monoDeadNullTest` 882, `monoCgcTplTy` 668, `monoRetFnListTy` 608, `monoPinnedAnnTyAt` 509, `monoLeafParamPin` 420, `monoBoundFnListElemsTy` 352, `monoPinnedReadTy` 341, `monoClosedObjLitTy` 174, `monoLetAnnTyOf` 66, `monoHoleFnPinTy` 33, `monoLetWriteRhsTyRec` 15, `monoPinnedListElemPin` 14, `monoLetWritesRecord` 6, `monoModuleDupPin` 3, `monoArgOpenValueTy` 1, `monoModuleLetPin` 0, `monoClosedFieldValTy` 0, `monoLetWriteRhsTy` 0, `monoPinnedListAnnTy` 0.
- [ ] **slot type** (27): `monoBindingAdoptInit` 9,578, `monoHoleGenFnPin` 7,952, `monoListSrcElemTy` 7,925, `monoReachLitTys` 6,959, `monoReachSlotTy` 6,938, `monoPinMapValues` 6,754, `monoPinFieldContainers` 798, `monoPinRecordFields` 733, `monoLetWritesClosed` 703, `monoPinObjFields` 695, `monoRetypeLamCells` 565, `monoPinRecordField` 466, `monoWritesCoercedFirstCall` 454, `monoPinNestedListElems` 315, `monoPinFieldContainer` 112, `monoPinMapSlot` 66, `monoLetWritesAt` 57, `monoNoteBindCall` 28, `monoPinFieldValue` 25, `monoPinJoin` 22, `monoPinStoredRecords` 20, `monoRenameInitAt` 12, `monoSigJoin` 3, `monoPinnedElemAnnTy` 2, `monoHandWrittenLet` 2, `monoPinMapNestedFnLists` 0, `monoWrittenLetRetsDisagree` 0.
- [ ] **lambda sigs** (11): `monoPinBodyLambdasRaw` 9,023, `monoPinMapLambdas` 9,016, `monoNoteBindDeliveryCall` 6,903, `monoCloneLambdaSubst` 1,259, `monoPinLamFromCheckedTy` 1,111, `monoLamSubstParams` 931, `monoLamParamPinAnn` 797, ~~`monoLamReachParamTy` 124~~, `monoRecvParamElem` 41, `monoDeliverLamLit` 6, `monoLamInstSigs` 2.
- [ ] **instance binding** (34): `monoHoleBinding` 9,023, `monoMakeInstanceGo` 9,023, `monoBindCols` 9,020, `monoMakeInstanceLetTyCol` 9,020, `monoCadNoteInstance` 9,017, `monoNicheNulParamsCheck` 9,013, `monoBindBareUnionArm` 8,993, `monoBindNullArm` 8,980, `monoSlotParamPins` 8,714, `monoPreBindPastUnionRest` 8,710, `monoInstantiateCallIn` 8,710, `monoLetTyParamMisfit` 8,701, `monoExactPinTyOf` 8,679, `monoPinAnnotatedParam` 5,749, `monoNicheNulListCheck` 5,704, `monoParamPinnedNull` 5,486, `monoPreBindPastEmptyLit` 5,305, `monoPoisonSharedPins` 2,705, `monoBindInnerUnionArms` 1,804, `monoExactBind` 1,275, `monoLetSeedMisfits` 1,250, `monoSubstAnnNode` 1,223, `monoPinnedTyParamCanon` 1,001, `monoInstParamPinTys` 472, `monoPinTyParamComposite` 427, `monoLitElemPin` 238, `monoBindEnclosingPins` 138, `monoBindBareArenaPins` 104, `monoSubstTyArgNodes` 47, `monoPreBindNonArrowArgs` 46, `monoBindFromLaterArg` 3, `monoLayoutConstOf` 0, `monoSeedCallSigTys` 0, `monoSlotSig` 0.
- [x] **literal arm row** (5): `monoNoteLitDest` 8,956, `monoNoteLitDestIn` 4,887, `monoNoteListLitDests` 16, `monoVariantRowAmong` 3, `monoArgOwnVariant` 0 — deleted; the elaboration records the union a call hands a literal back into (`litRetUnionIx`, read by `litRetArmRow`).
- [ ] **value returns** (7): `monoFlowRetVals` 8,077, `monoFlowConstCallArgs` 8,064, `monoFlowAnnLits` 6,049, `monoDeliverCallRets` 1,021, `monoFlowCallLeafAt` 175, `monoIfBoundRetAtPin` 24, `monoFlowCallLeaf` 0.
- [x] **instance result** (10): ~~`monoRetRecordOf` 8,023~~, ~~`monoRetRepOf` 7,745~~, ~~`monoPinCallRecord` 6,765~~, ~~`monoPinInPlaceCallRecord` 6,763~~, ~~`monoReturnedBundlePin` 6,538~~, `monoPinnedRetAnnTy` 505 (switched, #6511), ~~`monoCallInstRetTy` 205~~, ~~`monoRetConstRecord` 66~~, ~~`monoInstRetLitTy` 34~~, ~~`monoInstAnnRetTy` 26~~. #6498 deleted the record-pin four, #6511 the instance-literal pair, and the delivered-rep fact the rest (below).
- [ ] **walk type** (33): `monoExprRebuild` 7,470, `monoPinRetype` 7,368, `monoPinnedTyOf` 6,521, `monoElseRemainderAt` 6,167, `monoPinFnValueTy` 4,955, `monoPinRecvName` 3,289, `monoPinRecvLit` 3,162, `monoPinCoalJoin` 2,708, `monoIfChainRebuildPinned` 2,654, ~~`monoIfArmsAllTy` 2,641~~, ~~`monoHoleJoinPinsString` 2,368~~, `monoPinMemberCall` 1,241, `monoLamPinRetAnn` 1,112, `monoNumUnionOpPin` 788, `monoPinCoalListDefault` 781, `monoHoleNodeTy` 686, ~~`monoArmTailIsTy` 643~~, `monoLamCallTy` 522, `monoHoleCoalUnion` 321, `monoHoleTy` 252, `monoNumOperandPinTy` 241, `monoPinArmSubst` 124, ~~`monoIfArmsPinJoin` 86~~, `monoChainPinnedTys` 74, `monoHoleJoinDropsArm` 72, `monoTpJoinObjTy` 54, `monoSubstIsExpr` 53, `monoHoleBindingOf` 24, ~~`monoHoleJoinPinTy` 11~~, `monoArmPinnedTy` 5, ~~`monoHoleJoinHasAtomArm` 1~~, `monoNumUnionCompoundPin` 1, ~~`monoArmPinsLitUnion` 0~~.
  The hub is `monoPinnedTyOf`: the recorded type substituted at the binding, which most of the
  family reads. Shadowed against the elaboration's closed type at the instance (`elabWalkNarrowedTy`,
  else `elabWalkTy`) over 23,384 programs, 6,163 reaching a node whose recorded type names a
  variable (per program, answer and node kind): agree 4,487, differ 58, mono only 151, elaboration
  only 6,855, neither 1,413. Graded by output: taking the elaboration's answer in every differ cell
  leaves 45 of 46 programs printing the same, and the one that moves is
  `generics/filled-string-literal-typed-by-literal-union-destination.vl`, where mono's `i32[]` for a
  `(1 | 2 | 7)[]` list works around [D3540](inventory/D3540.md) (a numeric literal union is its base
  only in a field slot, D611). Switched: where mono's pin closes, the elaboration answers, except
  that list. Against a master fixpoint over 19,316 programs, 2 byte movers
  (`closures/hole-fn-generic-map-handed-two-maps.vl`,
  `functions/hole-param-lambda-open-map-result-pinned-by-callee.vl`), both printing master's output.
  The mono-only cells stay with the lambda-sig family: dropping mono's answer there leaves 53 of 59
  programs printing the same, and the other 6 already refuse and change only their message
  (`closures/listed-hole-fn-written-param-reject.vl`, `closures/listed-hole-fn-escaping-list-reject.vl`,
  D15010, D15011, D15483, D1666). The elaboration-only cells are mono's decision not to retype.
  The rebuild helpers (`monoExprRebuild`, `monoPinRetype`, `monoPinFnValueTy`, `monoPinRecvName`,
  `monoPinRecvLit`, `monoPinCoalJoin`, `monoPinCoalListDefault`, `monoTpJoinObjTy`,
  `monoIfChainRebuildPinned`, `monoNumUnionOpPin`, `monoNumUnionCompoundPin`, `monoPinMemberCall`,
  `monoSubstIsExpr`, `monoHoleCoalUnion`) remake syntax and consume a type: class (c) once their
  type reads the elaboration, which through the hub it now does where the pin closes.
- [ ] **call param** (13): `monoBindSeededTyParams` 5,624, `monoArgTyName` 5,220, `monoPinHoleParam` 3,734, `monoCallIfValue` 2,887, `monoArgPinTyIx` 404, `monoArgTyNameCascade` 360, `monoArgTyNameRep` 215, `monoArgTyNameBound` 177, `monoSpelledRecordLeavesRow` 127, `monoPreBindArgName` 63, `monoPreBindArgTy` 63, `monoArgPinName` 61, `monoArgTyNameProjected` 9.
- [ ] **uncalled slot** (6): `monoInertParamStubPin` 4,712, `monoValsInert` 12, `monoCallRetsInert` 12, `monoValsReachNoCall` 8, `monoLitReachesNoCall` 0, `monoInertReach` 0.
  The type an uncalled slot holds its functions at is the elaboration's (`elabUncalledSlotTy`,
  from `elabSlotHeldFns`), read by `monoUncalledSlotFnTy`. Shadowed over 23,381 programs, 507
  decisions in 318 programs: 105 agree, 401 decline on both sides, 0 disagree. In one, D12218,
  the elaboration answers where mono declines; a held value whose checked type is no function
  type keeps it declining. What is left mono-derived is the gate deciding the slot is uncalled.
  Before #6503 gated the stored slot on `elabSlotUncalled` alone, 59 of the 105 reach the default through `monoValsInert`, `monoValsReachNoCall` or
  `monoLitReachesNoCall` while `elabSlotUncalled` says the slot is called. That calledness
  disagreement is this family's next item.

The unbound default, which every program reaches through `monoElabDefaultsPrime`, is split-dep's,
with the rest of the §3.4 tail. The cad lane takes slot deliveries, then node type, then slot type.

**Slot type, map values switched** (2026-11-06). `monoPinMapValues` takes the map's type from
`elabSlotTyAt` wherever it closes; `monoPinMapSlot` only instances the stored values at it, and a
disagreement is a loud refusal. Two fact fixes came first: a non-generic slot member answers from
its own signature (#6536), and a slot handed to an open function parameter declines (#6539); the
refusal found the second on D10311, D10383, D10401 and D14400. Where the elaboration declines, an
untagged map whose generic is called at two signatures, mono's one-signature spelling stays: it is
a rep spelling, not a type, and waits on a holder bundle fact (D15494). Over 19,318 programs with
fixpoint seeds no byte moves, and 4,601 filed witnesses grade as filed.

**Slot type, record fields** (2026-11-06). `monoPinRecordField`'s 10 mono-only decisions were
gates in the slot close, not missing facts. An instance's binding now falls back to its
initialiser's closed type there (`elabNodeTy`), and a member not instanced per call answers from its
own signature: four now agree. The four D15494-shape decisions (a generic in a field called at two
types) join its grading list. The last two (`inRecord`: a written `let` of nested lambdas in an
instance) need a nested member read from its instances under the key; that admits the fact but mints
late demands for the lambdas, so it waits until the run foresees them. No byte moves over 19,318
programs.

**Slot deliveries, the reach rung deleted** (2026-11-06). `monoDeclPathPinsOrReach` and
`monoStoredSlotFnTy` fell back to value reach (`vrCalleeTy`) where the elaboration's slot pins were
empty. Over the 23,456 programs the reach rung never answered alone: at 1,553 site-hits the pins
agree 61 times, the elaboration alone answers 383, and neither answers 1,109. The rung and its
three functions are deleted. The written `let`'s seed signature (`monoSeedCallSigTys`, under
`monoCallIfBound`, `monoCallWrittenLet` and `monoCallIfValue`) is reached past its gates by 8
programs: in 6 its parameters agree with `elabCallParamBoundTy`, and in 2 neither closes (D15260's
shape, which runs).

**Node type, first reading** (2026-11-06, the same population, against `elabNodeTyAt` at the
instance):

| function | path | agree | both decline | mono only | elaboration only | differ |
|---|---|---|---|---|---|---|
| `monoArgClosedTyIn` | past a closed caller pin | 4,336 | 210 | 0 | 0 | 4 |
| `monoArgClosedTyIn` | the caller's pin | 4,163 | 0 | 38,241 | 0 | 11 |
| `monoCloseRetFnTy` | | 0 | 873 | 28 | 19 | 0 |

- **Switched: past a closed caller pin.** The four differences are one test
  (`pin-exact-key-set-and-its-map.vl`), where the elaboration's type is the `match` arm's non-null
  narrowing. It prints the same either way. `pinnedParamTyAt` and `nodeTyInOf` leave `emit_mono`.
- **Not this family: the caller's pin.** It is `monoArgPinTyIx`, the rep cascade, which belongs to
  the call-param family.
- **Not switched: `monoCloseRetFnTy`.** The elaboration declines a returned list of functions (28
  reads), and it closes 19 calls mono leaves open.

**Instance result, first pass (2026-11-06).**
- `monoRetRecordOf` and its consumers `monoRetConstRecord`, `monoPinCallRecord` and
  `monoPinInPlaceCallRecord` are deleted. The chain never pinned: over the 23,103 programs
  `monoRetRecordOf` returned no record in 112,273 calls, and a build refusing wherever it would
  return one passes the deno suites. A byte sweep of the 23,103 against master's fixpoint seed
  differs on none. The elaboration's result (`elabResultAtParams`) answers 10 of those calls, all
  in `std/idtable-*.vl`. That is a capability question, declined under ruling (a).
- `monoPinnedRetAnnTy`'s 29 answers are a returned list literal of hole functions pinned by its
  caller's calls (`hole-fn-list-returned-reread.vl`). The instance result is open there, so its
  owning fact is the forward climb over the literal's element slot, as for the reach pair, and not
  `elabRetOf`.
- `monoRetRepOf` and `monoReturnedBundlePin` are rep decisions, so they move to the per-call
  delivered rep below.

**Node type, blocked on closed function-holding types** (2026-11-06). Two more helpers were
shadowed against `elabNodeTyAt` at the instance:

| function | agree | both decline | mono only | elaboration only |
|---|---|---|---|---|
| `monoClosedObjLitTy` | 0 | 158 | 8 | 272 |
| `monoRetFnListTy` | 0 | 767 | 23 | 563 |

Mono answers only a type that holds a function (`{m:{[string]:(i32)=>i32}}`, `((i32)=>i32)[]`,
`(i32)=>i32`), which is all these helpers exist for. The elaboration declines every one, and where
it answers (`{q:i32}`, `i32[]`) mono declines by design. `monoCloseRetFnTy` has the same shape.
The rest of the family waits on `elabNodeTyAt` closing a function-holding type at the instance,
the Fn#d lane's function-value identity (D15298). Those mono-only rows are its acceptance
witnesses. Four helpers move to the instance-binding family: `monoPinBin`, `monoPinnedOperandTy`,
`monoPinnedReadTy` and `monoDeadNullTest` read only the instance's own pin column, in
`monoMakeInstanceGo`'s body rewrite.

**Slot type, first reading: `monoReachSlotTy`** (2026-11-06). Value reach (`vrCalleeTy`) against
the climb's agreed tuple (`elabLitSlotCallTys`), each computed on its own:

| outcome | site-hits | files |
|---|---|---|
| agree | 314 | 161 |
| both decline | 505 | 253 |
| the elaboration only, reach declines | 228 | 107 |
| reach open, the elaboration declines | 26 | 20 |
| the elaboration only, reach open | 1 | 1 |
| reach only | 17 | 10 |
| differ | 0 | 0 |

The rung stays. The 17 reach-only site-hits are where the climb records no tuple, so they are the
next forward-climb edges to add:
- a list built by `push` or spread (`closures/hole-fn-generic-pushed-list-spread.vl`,
  `closures/hole-fn-into-pushed-lambda-bound-by-every-call.vl`);
- a lambda member of a capturing list (`closures/hole-fn-list-capturing-lambda-member-at-handed-result.vl`,
  `closures/hole-lambda-on-hole-fn-list-capturing-hole-param.vl`);
- a function field handed to a narrower declared parameter
  (`structs/record-with-generic-fn-field-into-narrower-declared-param.vl`,
  `functions/exported-generic-reached-through-lambda-field-or-list-called.vl`);
- D2853, D2862, D12880 and D12940.

The 228 the elaboration alone answers are calls mono leaves untyped today, so the switch admits them
too, and they are graded as newly admitted programs.

**Slot type, parked and pruned** (2026-11-06).

- **`monoReachSlotTy` is parked.** 13 of its 17 reach-only site-hits call the slot's function with a
  lambda argument whose type is open at the call (D12880, D12940, and the pushed-lambda and
  capturing-lambda-member tests). That is the lambda-signature family's, and lane F has them as
  acceptance witnesses. In D2853 and D2862 the call is through a field of a record a call returns
  (`mk(7).g()`), which the reach lane's value-returns family owns. The other 4 are answered by the
  binding's slot call tuple (`slotCallArgsInto`), which lands with the deletion. The rung keeps
  reach's decline for the 228 sites only the elaboration answers.
- **The 13 lambda-argument site-hits now have the climb's tuple.** The open argument is a generic
  function handed by name (`f(snd)`). `elabLitSlotCallTys` closes it, per slot value, at the one
  tuple that value's parameter is called at and the function's result there. Re-read on master
  `e925b06a` over 23,384 programs (counts per program and answer type): agree 175 → 180, reach only
  20 → 9, differ 1 → 1 (`named/d15209_fs_in_list_half.vl`, already on master), elaboration only
  132 → 132. No byte moves over the 19,316-program sweep. The 9 left keep the rung.
- **`monoReachSlotTy`'s value-reach rung is deleted.** The climb gained the 9 left: a value a call
  hands back or a lambda is climbed from its node; a reached call's result is its agreed or checked
  type, or, for a function result, the result's own calls (`ks[0]()(5)`, D2853, D2862); a literal
  an instance copied reads its source, and an argument open at check takes its agreed instance
  type; a spread copy reads its source's held values (initialiser, pushes, element writes, pushes in
  a function it is handed to) at the copy's own slot; a `self` function's UFCS calls count as its
  calls. Reach only 9 → 0, differ 1 (D15510), elaboration only 160. Reach's answers open in the
  enclosing generics' own type parameters (D7202) are kept by the climb (`elabOpenOnlyIn`). Against
  a master fixpoint over 19,316 programs: 0 runs lost, 13 byte movers, every one printing master's
  output. `vrCalleeTy`, `vrCallTy`, `vrOpen` and `monoFrameTyParamsOf` go.
- **Value reach's no-call half, dropped where it never decided.** Three gates ask
  `elabSlotUncalled(...) || reach finds no call`. Where the elaboration says the slot is called,
  reach alone said "no call" this often:

| gate | elaboration uncalled | reach alone | site-hits |
|---|---|---|---|
| `monoStoredSlotFnTy` | 136 | 0 | 136 |
| `monoPinNestedListElems` | 19 | 0 | 19 |
| `monoPinListElems` | 256 | 23 | 293 |

  The first two now read `elabSlotUncalled` alone. In the third, reach's answer stays: 23 site-hits
  in 17 files where the elaboration has no uncalled answer (D10795, D10796, D10893 to D10895, D12472
  and others). `monoValsInert` stays too, since it decides 34 site-hits with two pins that the
  elaboration has no fact for.
- **No longer mono-derived since #6496:** `monoPinRecordField`, `monoPinRecordFields` and
  `monoPinNestedListElems` read only the elaboration's slot pins (`monoDeclPathPins`).

**`monoPinnedRetAnnTy` is parked.** Re-keyed onto the forward climb (`elabLitSlotCallTys` over
each returned list literal, with each element's result) and shadowed over the 23,103 programs:

| outcome | events |
| --- | --- |
| both answer, agree | 11 |
| both answer, differ | 0 |
| old only | 18 |
| new only | 1 |
| neither | 1,027 |

The 18 old-only fall into two groups:
- 13 are an uncalled slot, which takes the unbound default (the D15293, D15207 and D15294 named
  sets; `named/d15293_string_alone.vl`). That belongs to the uncalled-slot and unbound-default work.
- 5 are a returned list reached only through a callback method or a hand-on
  (`hole-fn-list-unbound-and-returned.vl`), which the climb does not follow yet.

The switch waits for the default, then for that climb edge.

**`monoPinnedRetAnnTy` is switched** (2026-11-06). Each returned list literal closes from the climb
(`monoLitSlotCallTy`, which follows nested list rows). Where the climb does not close it, it closes
as the elaboration closes a held literal (`elabReturnedClosedTy` over `elabHeldClosedTyAt`, D15294's
fact) at the instance the call reaches. Ruling (a) keeps that fallback to a generic's instance or a
list holding no record. `monoCallInstRetTy` and `monoInstRetLitTy` are deleted.

The re-shadow over the 23,103 programs reads 27 agree, 1 differ, 2 new only and 1 old only:

- The differ is `named/d15293_bound_returned.vl` at `mk("s")`. The old answer was stale
  (`x: i32`, from the `mk(5)` instance), and the program prints the same output either way.
- The old-only case is `hole-fn-list-unbound-and-returned.vl`, one instance called at two types,
  where declining is correct.
- The 16 D15207/D15294 cells the fallback would also answer are declined. Admitting them moves no
  byte of any of the 23,103 programs: those cells are already served by `monoHeldRecordListAt`
  (D15294's reader of `elabHeldListFacts`), so they need no change here.

The byte sweep against master's fixpoint moves 2 of 23,103 programs with the same output:
`list-of-generic-returned-measured.vl` and `named/d15207_fn_list_ret.vl`. Each loses the dead body
of an uncalled list function, which the old path instanced as a side effect of `monoRetFnListTy`.

**Value returns are aligned.** `monoFlowCallLeaf` names the module-level generic every `return` of
a call's callee reads. Over the 23,103 programs the climb confirms it: the one top-level generic
whose value `elabValueReturnsFrom` finds reaching that return agrees at 87 queries. It differs at
none, misses none, and answers 2 more. A reverse fact ("the values reaching `f`'s returns") would
replace at most the walk's 3 producers, so the family stays.

The shadow found a defect in `elabValueReturnsFrom`. `elabSlotDeliveries` memoised an outermost
query whenever no call sink was on, but the return sink was not in that gate. A second query for
the same value read the memo, walked nothing and answered false. The memo now skips a return-sink
query; `tests/vl_elab_rets_reach_test.ts` asks the query three times. No program in the population
changed output.

**The uncalled-slot gates are rewrite-owned.** `monoPinListElems`' reach half
(`monoLitReachesNoCall`) and `monoValsInert` are kept, and they close only when the flow pass's
`monoFlow*`/`mfr*` family (the slot held fns row, 29 functions) is retired. Each gate answers
"uncalled" about the program after `monoFlowReadSet` has rewritten every read of the slot to name
its generic. `elabSlotUncalled` answers about the program before that rewrite. An elaboration fact
that took mono's rewrite as an omit set would move the dependency, not remove it.

Shadow over the 23,103 programs at `4f3d9023`. Both predicates are asked at every slot reaching a
gate. E is `elabSlotUncalled`; M is the mono predicate the gate reads.

| gate | both called | both uncalled | E only | M only |
| --- | --- | --- | --- | --- |
| list, no pin (`monoLitReachesNoCall`) | 14 | 27 | 245 | 23 |
| list, pushed, two pins (`monoValsInert`) | 5 | 0 | 0 | 2 |
| nested list, no pin (`monoValsReachNoCall`) | 0 | 1 | 22 | 0 |
| stored slot, no pin (`monoValsReachNoCall`) | 0 | 23 | 129 | 0 |
| stored slot, two pins (`monoValsInert`) | 17 | 0 | 0 | 34 |

The two rows with no M-only cell read `elabSlotUncalled` alone since #6503. At a no-pin gate the two
answers are joined by `||`, so E only changes nothing. All 59 M-only cells run correctly, and only
through the uncalled default.

Each M-only cell is graded by what makes E answer "called", and by which reasons are left once the
rewritten calls (`mfrSetCalls`) are omitted:

- **`fnSlotCalled` (44 cells): every list cell, and 19 stored ones.** It is the checker's
  call-through-slot note. It is keyed by holder and path, with argument tuples and no call node
  (`fnSlotCallNote`), so it cannot omit a rewritten call. In 18 of the list cells and both pushed
  ones, every set call and delivery is a rewritten call as well. In 6 of the stored cells a held
  function also escapes through a map parameter.
  - List witnesses: D7385, D12472, D10795, D10796, D10893, D10894, D10895,
    `closures/hole-fn-list-computed-index-call-as-value.vl` and
    `functions/lambda-through-const-list-element*.vl`.
  - Pushed: D9482 and `closures/hole-fn-generic-pushed-list-spread.vl`.
  - Stored: D9310, D9480, D9591, D15298 and `closures/hole-fn-generic-in-map-called-at-two-types.vl`.
- **Rewritten calls only (2 cells).** Omitting `mfrSetCalls` leaves no reason
  (`closures/container-of-generic-flow-reads.vl`).
- **Handed reads (13 cells).** The rewritten read is an argument, as in `run(mv, 2)` where `run`
  calls `f`, so the two pins are the deliveries through `run` at two types. `monoFlowReadSet` lists
  only called reads in `mfrSetCalls`, so these deliveries survive the omission. Witnesses:
  D10311, D10383, D10384, D10401, D14400 and
  `generics/fn-value-generic-handed-from-call-map-or-repointed-let.vl`.

Whoever retires `monoFlowReadSet` needs two facts that do not exist yet: `fnSlotCalled` keyed by the
call node, and the handed reads.

**The `monoFlow*` read rewrite, first reading** (2026-11-06). The rewrite (`monoFlowReads`) runs once,
before the walk. `monoFlowReadSet` re-points a read of a list element, a record field or a written
`let` at the one generic it holds, so each read takes its own instance. Every elaboration fact sees
the reads before that rewrite. `compiler/mfr_shadow.vl` asks, before each rewrite, which function
the elaboration says the read holds:
- the element a literal index of a module-scope `const` list names (`constListFnElemDecl`);
- else the read slot's value-flow set (`elabSlotFlowFns`), new here;
- else what its call's callee can be (`elabCalleeFns`).

`elabSlotFlowFns` is `elabSlotHeldFns` with one-way spreads. A list holds what the lists it spreads
hold, but not what is written into a list that spreads it. Without that, `xs.push(id); ys = [...xs];
ys[0] = inc` reads `xs[0]` as `id` or `inc`. `elabSlotHeldFns` keeps its two-way union, which is
what a shared element rep needs. Over the 23,456 programs:

| outcome | site-hits | files |
|---|---|---|
| agree | 351 | 129 |
| the elaboration names several | 10 | 5 |
| the elaboration names none | 26 | 18 |
| differ | 0 | 0 |

What is left before the planner reads the elaboration:
- several: a list parameter's element read per call site, and nested lists. These need an
  instance-keyed held set.
- none, 10: a record literal stored in a map value and read back by field (`s.set("k", {f: id});
  s.get("k").f(..)`). The write index does not follow a stored literal to its field.
- none, 4: nested field paths.
- none, 12: nodes minted after `elabRun`, which wait on the same source mapping as the instance
  ladder's tail.

**The `monoFlow*` rewrite, second reading** (2026-11-06). `mfr_shadow` gains two lookups:
- a read straight out of a literal (`{ f: inc0 }.f(3)`, `[a, b][1]`);
- a descent along literal index and field steps from the read's root, through `const`s, unwritten
  `let`s, a call's returned values and a parameter's argument at each call. It declines where the
  slot is written after it is built (`cwSlotWriteCount`) or where the leaves name different
  functions.

Over the same population:

| outcome | site-hits | files |
|---|---|---|
| agree | 372 | 140 |
| the elaboration names several | 1 | 1 |
| the elaboration names none | 14 | 7 |
| differ | 0 | 0 |

The 14 are the callees of desugared optional calls (`m["k"]?.f(2)`), minted after `elabRun`; S2
shows they decline harmlessly. The one "several" is a list reached through an alias and called in a
callback (`closures/hole-fn-list-reached-through-alias-called-in-callback.vl`).

**The `monoFlow*` rewrite takes its generic from the elaboration** (2026-11-06).
`monoFlowReadSet` re-points a read only where the elaboration names the same one generic
(`mfrElabNames`). The value-set walkers no longer choose the generic. They are now only the soundness
gate: they decide which reads are asked. A desugared optional call's callee is minted after
`elabRun`; the emit rewrite records the `?.` read it stands for (`optCallCalleeOf`), and the
elaboration answers through that read. Over the 7,538 sweep programs this moves no bytes, and both
programs that a decline there turned into loud refusals run
(`closures/container-of-generic-flow-reads.vl`, `closures/hole-fn-generic-in-map-called-at-two-types.vl`).
Any other node minted after `elabRun` still keeps the walkers' choice.
One program's bytes move with the same output: `closures/hole-fn-list-reached-through-alias-called-in-callback.vl`,
where the elaboration names several generics and the read is no longer rewritten.

**B1: the chain gate admits callee reads** (2026-11-06). `monoFlowAdmitChain` asks
`mfrChainFns` of every call's callee read: one walk down the read's value chain, gated at every
link. A written binding holds every value written to it; a slot holds every value stored there
(`cwSlotWrittenValues`, through a callee's parameter too); `??` holds both sides; a parameter
holds every call's argument, unless its function is exported, whose callers outside the program
the walk cannot see. A literal index needs the literal unwritten after its build and the
index inside it, so a read past the end still traps. A lambda leaf, a parenthesised name (the emitter does not
instance one taken as a value: [D4120](inventory/D4120.md)), an
annotation, a parameter default, or any unknown link declines. The read's ROOT must be a `let` or `const`: a read rooted at
a parameter keeps its argument built as closures at the call, and renaming it lost 8 runs and
moved 2 outputs (`closures/hole-fn-{bound-list-returned-from-hole-param, flat-list-called-at-one-type,
flat-list-called-at-one-type-tagged, list-handed-to-hole-param-tagged,
list-literal-results-differ-handed-to-param-runs, list-returned-index-call-at-two-types,
list-returned-reread, nested-list-handed-open, nested-list-length-read-tagged}.vl`,
`closures/mixed-result-fn-list-literal-handed-to-hole-param-runs.vl`). The target is a generic or
un-annotated-parameter function at module scope whose name nothing else declares. A written
binding takes every value written to it rather than the value at the read; reaching writes are
deferred until a census shows a walker-rewritten read this declines. `monoFlowDirectSet` is
deleted. `monoFlowLetCalls` (its `LetLeaf`) and `monoFlowConstCallArgs` stay: they rename
ARGUMENT reads, which the gate does not ask about, and switching them off lost 3 runs. They go
with B2. Use classification stays mono's (syntax, class c).

Open, not acted on: an exported function's function-typed parameter takes the tag layer's
closed-world set, so a call through it dispatches over the program's own members even when a host
calls the export. Closed-world tag set vs open needs a host-ABI ruling.

**B2-prep: the literal roots are an elaboration fact** (2026-11-06). `mfrLitsRun` runs straight after
`elabRun`, before any emit rewrite mints a node the write index does not cover, and fills per
declaration the list, record and `Map()` literals it can hold (`mfrLitsOf`). The links are the chain
walk's: a binding's every write, a parameter's every argument unless its function is exported, a
function's returns, `??` (a `null` side adds nothing), a member or operator call through
`elabCallDeclOf`, a slice's receiver, a map read at any key through `cwSlotWrittenValues`, and an
element or field of a literal. A function's name is a leaf. A binding minted after the elaboration
stands for its initialiser when that is a covered literal or a read of a covered binding; that
serves `emit_rewrite`'s `spillLocal` (`asg#<ix>#<tag>`) and its capture-cell write temp (`__cbv<n>`).
Its shadow against the walkers' `mfrVals`, over the 23,456-program population with each value read
as its literal or the generic it names: 5,327 agree, 3 walker-only, 5 differ, 2,436 elaboration-only
(wider). Walker-only: 3 minted spills the pass-through declines (two
`asg#` spills whose initialiser is not a plain read, in `eval-order/compound-assign-place-once.vl`,
and `lists/concat-nested-right-operand.vl`), which stay on mono. Differ: 4 are `.slice()`, whose
walker root is the spread literal `monoFlowSliceAsSpread` mints; that literal is mono's class-(c)
mechanic, so B2's consumer maps a binding initialised by `.slice()` to mono's minted literal rather
than to the receiver's. The fifth is `simd/f32x4-positions.vl`'s `sb = Buffer(16)`, where the
elaboration also sees the return inside `Buffer`'s shared-memory branch: the walkers' set was an
under-approximation.
Its 2,436 elaboration-only roots are three classes, and every program among them builds today.
215 hold only non-generic functions, which canonicalise to nothing mono plans. 1,986 hold a generic
function and no container (`let v = id`, `const g = r.f`, a parameter handed one): those are callee
reads, and the chain gate (`mfrChainFns`) owns them, so **B2's consumer takes container roots only**
and a second consumer of a function-only set is not added. The 232 container roots are B2's
widening, sweep-proven with every mover named; a subclass that moves output is declined.

**B2's named bar: 16 programs the walkers' literal mechanics carry.** With the whole walker planner
off and the chain gate admitting callee reads, 7,538 sweep programs at fixpoint lose 16 runs and
move no output. These are the reads the gate does not answer: an argument handed on, a loop over a
literal, a spread or slice, a map store through a parameter. B2 replaces the planner's literal roots
with the chain walk's and must recover all 16:
- argument reads: `generics/fn-value-generic-copied-returned-or-aliased-handed.vl`,
  `generics/fn-value-generic-container-read-listed-or-stored.vl`,
  `generics/fn-value-generic-handed-from-call-map-or-repointed-let.vl`;
- spreads and slices: `closures/generic-list-spread-copy-written.vl`,
  `closures/generic-list-spread-copy-written-inside-function.vl`,
  `closures/hole-fn-generic-pushed-list-spread.vl`, `closures/generic-list-sliced-called-at-two-types.vl`,
  `closures/generic-list-to-unannotated-param.vl`;
- map stores through a parameter: `closures/hole-fn-generic-map-handed-two-maps.vl`,
  `closures/hole-fn-generic-map-stored-through-parameter.vl`;
- no call fixes the type: `closures/container-of-generic-flow-reads.vl`,
  `closures/hole-fn-generic-in-map-called-at-two-types.vl`,
  `closures/list-of-generic-element-called-at-its-stub-signature.vl`;
- `closures/hole-fn-in-record-field-at-field-call-instance.vl`,
  `closures/lambda-called-directly-with-generic-at-two-signatures-beside-one-signature-consumer.vl`,
  `closures/container-of-generic-read-positions.vl`.

Letting the elaboration also choose the candidates (option B) fails the soundness bar. Over the 7,538
sweep programs, with the gate "a `const` or unwritten `let` whose slot nothing writes later", 23
programs move output, lose a run, or build a refusal fixture. The gate still needs three facts:
- a callee's write into a container handed to it as an argument;
- the value a copy of a written `let` held when it was copied, which is a flow-sensitive fact the
  elaboration does not have;
- per-instance generic results.

#### Next stage, first item: a per-call delivered-rep fact

**Built for the instance result** (2026-11-06). The reach rows (`elabReachRows`, emit_elab) hold,
per reach the elaboration recorded (a call node and the instance it reaches), the rep each
parameter of that instance is delivered at where it is not the parameter's type: the record of one
closure per signature a bundle parameter is called at, or the wider record `callArgRepTy` names.
`elabCallArgRep` reads them, `ELAB_REP_NO_ROW` where no reach was recorded, which mono refuses
loudly. `elabRetParamOf` names the parameter a function returns whole, and `monoInstanceRet`
returns that parameter's delivered rep in place of `monoReturnedBundlePin` and `monoRetRepOf`.

Shadowed over 23,103 programs and the deno inline programs: every instance agrees, 148 of them
moved off the result's type (135 bundles, 13 wider records), and 0 reach no row once the rows key a
method call's receiver as its first parameter and a `[]=` write's dispatch call carries its operator
node (`drwOpCall`). The byte sweep against master's fixpoint is 23,103 identical.
`tests/vl_elab_arg_rep_test.ts` holds the rule that a rep differs from its type only as one of the
two. The other readers (`monoArgRepRowTy`, `monoPinHoleParam`, `monoPinAnnotatedParam`,
`monoBundlePin`) come next.

`pass2(m, Set())` returning its parameter (D15040's set at a bare type parameter) reaches no row
and is now a loud emit refusal; D1578's witness, which must stay invalid wasm, returns `i32`.

**An argument's built record** (2026-11-06). Beside each slot, `erArgBuilt` holds the record the
argument is built at where the call's bind row keys or pins it at its rep (`callBindRepKeyedAt`,
`callBindRepMixedAt`), measured against the argument's own type. `elabArgBuiltRep` reads it where
`monoArgRepRowTy` derived it, which is deleted. The rep slot alone answers the parameter's
question, not the argument's: at a declared wider parameter (D2060's covariant records) the
parameter's type differs from the argument's own while the argument keeps its record, and the 272
such sites stay declined.

**The parameter pins are aligned.** `monoPinHoleParam` and `monoPinAnnotatedParam` read
`callArgRepTy` over `elabCallParamTy`, the checker's fact `erArgRep` is built from, and agree with
the column at all 40 sites a rep reaches. They stay on it: 157 of their queries are calls with no
reach row (124 the elaboration never reached, the rest reached only from another instance), where
the rep is the type and the column has nothing to answer.

**The bundle pins read the fact** (2026-11-06). `monoBundlePin` takes the record a bundle argument
is delivered at from `elabCallArgRep`, and `monoClosureBundlePin` takes the closure, in place of
minting either from the signatures; `monoCallsHandGenerics` is deleted, its gate now the
elaboration's (`elabCloBundleRep`). One minter, `bundleRecordTyOf`, serves both. The fact was wrong
at one slot first: a lambda calling its own parameter at two or more signatures (`use(lap)` in
`closures/lambda-bundle-through-hole-param-at-several-signatures.vl`) is one closure taking their
bundle, not a bundle record, and it now records the closure whatever the callee's own signature
count. Shadowed over 23,103 programs: 295 bundle sites and 12 closure sites agree, none differs or
is new-only. The byte sweep against master's fixpoint is 23,103 identical.

`monoBundleTys` and emit_bundle's `bundleTys` and `bundleRecs` still answer "is this type a bundle".
A type-shaped answer from the fact agrees at 586 of 587 reads and is wrong at the other:
`closures/hole-lambda-bundle-positions.vl` writes `type B = { c0: …, c1: … }` by hand, a bundle's
shape that keeps its own fields. Their replacement has to ask per call, not per type.

DECISIONS.md, "An instance's type and its rep are separate facts", gives the elaboration the
instance's type and gives mono the parameter's rep. `callBindAdoptReps` already records that rep for
a record built wider, which is why 34 of the 74 pairs close under `callArgRepTy`. Each remaining kind
was checked against the emitted wasm before anything was built:

- a value delivered non-null to a nullable function parameter (16 pairs) is not a gap. Mono spells
  the instance's parameter at the non-null type, but every instance lowers it to the same nullable
  closure reference, so the binding's `| null` type already is the rep;
- a closure bundle handed to a parameter (14 pairs) is a real rep, a struct of closures. The
  elaboration already holds its signatures (`elabCallBundleSigs`); mono adds the gate that the
  callee only calls the parameter (`monoBodyReadsOtherThanCalled`), without which the signatures
  claim a bundle mono does not build (5 calls). The gate moves into the elaboration beside them;
- a record whose row mono keys narrower or wider than the binding, or cannot spell because it holds
  generic functions (8 pairs), and literal-union spellings the render softens (2 pairs), are still to
  be checked against the wasm the same way.

The fact: for each argument `i` of each call, the rep it is delivered at, read through `callArgRepTy`
and the bundle record of `elabCallBundleSigs`. Mono's instance choice in `monoWalkIdentCall` and
`monoPinHoleParam` then reads the elaboration's type and this rep, and stops deriving either. The
instance choice switches in one change with the derivation's deletion, graded by
`scripts/inst-shadow/run.sh`. It needs no `REAL` tag, and every `no:` bucket left must be a named
fallback. A cell where the elaboration answers and mono declines or leaves its pin open (the 1,969
calls above) must keep declining, or be shown output-neutral by the sweep: a `monoHoleGenFnPin` switch
whose site shadow read 230 of 230 agree still lost two runs to such cells.

#### The canonical instance key, measured (2026-11-05, master `82069a442`)

The switch derives mono's instance key from the elaboration, not from mono's own spelling. Each
instance `monoMakeInstance` built was recorded with its elaboration key (`monoKeyEk`), over every
`tests/cases` file with a fixpoint seed: 13,046 instances in 2,415 files, 12,919 of them keyed.

- **Callback specialization (96 groups).** Mono keys an instance by the function value it is handed
  (`@inc`, `@__lambda_3`), so the call inside is direct. One elaboration key, several instances. The
  elaboration has no such dimension; the key keeps it as its own component.
- **One elaboration key, several mono keys besides specialization (15 groups).** Under the key
  below, 9 differ by their specialization value once mono's `(()=>i32)` / `()=>i32` spelling is read
  as "unspecialized" / "specialized". 2 are one nested generic instanced per enclosing instance
  (`shadowOther`'s `inner`, marker `^20`), whose copies read different environment structs: the
  parent component. 2 are a check-reject fixture's. 2 are true duplicates with identical bodies
  (`deliver` in `closures/generic-returned-record-param.vl`, `F$m…` in
  `generics/instance-call-of-literal-union-field-function.vl`), which the key merges with no change
  in output.
- **No elaboration key (127 instances).** 109 are their template's only instance (46 lambdas, 41
  hole-parameter functions solved closed, 22 annotated functions at one storage row): the
  declaration is the key. 4 are two hole-parameter functions instanced twice at one literal-union
  type (`elem`, `glob` in `generics/type-param-write-literal-union-at-pin.vl`, `K|null` against
  `K|null#litK`), with identical bodies: duplicates. The other 14 are the gap: 7 annotated,
  non-generic functions each instanced at two storage rows (`take` at `{f: i32 | null}` and at
  `{f: i32}`, in the `soundness/built-container-*` and `fresh-literal-handed-back-wider-*` fixtures).
  Their rep is already a checker fact: `recArgRepNote` records the row a built-container read
  handed to an annotated parameter is stored at (D14532), and `monoPinAnnotatedParam` pins at
  `recArgRepOf` of the argument, else the annotation. The key's rep component is therefore
  `callArgRepTy` for a generic call and `recArgRepOf`, else the parameter's declared type, for a
  non-generic one: no fact is missing.
- **One spelling, several keys (26 groups).** One generic returned by different functions;
  `elabInstSpelling` omits the parent, so the key carries it.

The per-parameter comparison (`callArgRepTy` against mono's pin, 37 pairs) found no pair where mono
is nearer the wasm than the elaboration. The key is therefore: the elaboration key (or the
declaration), the parent key, the rep row of each parameter with union members in canonical order
and a literal union named by its rep, and the callback specialization.

**Callback specialization is mono's component of the key** (coordinator ruling, 2026-11-05). The
elaboration owns what an instance means: its type and its rep. Specializing an instance on the
function value it is handed makes the call inside direct and changes no meaning, so it is a
code-generation choice and mono's to make. The key is (elaboration type and rep, the parent where
the spelling omits it, the specialization value or none); the 96 groups above are its evidence.
The condition: one predicate decides "specialize this call on this value". Today that is
`monoSpecializableCallbackName`, but each of its two callers gates it differently. The generic
instance key (`monoMakeInstance`'s `cbFnNames`, suffix `@name,`) skips a callee read through a
written binding (`viaWritten`). The non-generic specialization (key `C<fe>@name`) has its own
assignment check (`monoReadIsAssigned`). Those gates move into the one predicate before the switch.

#### The call half and the value half (2026-11-06)

**A function delivered as a value has all its instances in the value half; a function only ever
called by name has all its instances in the call half** (coordinator ruling, 2026-11-06). The
predicate is `elabDeclIsValue`: some read of the name is not a call's callee. Under it no function
has instances keyed two ways. Splitting one function's instances across the halves (the written
binding a value is copied through, which one instance has to serve) was the one source of output
movers that keying by rep could not close.

- **The call half** keys an instance made for a call by the elaboration's call-time key
  (`elabWalkKeyOf`) plus the rep and tagged set each parameter is pinned at, the enclosing call
  frame and the callback specialization (`instKeyCanon`). The body is still elaborated at mono's
  demanded key, which is rep-consistent. Measured over `tests/cases` with fixpoint seeds: 8,450 of
  11,271 call-made instances, 76 programs' bytes move and 0 programs' outputs.
- **The value half** keys an instance of a function delivered as a value, call and value alike,
  by the elaboration's key for it (`instKeyValueTime`: the call's key, else the value's, else the
  typed slot's), plus the same rep, frame and specialization components. Its typed-slot rule is
  `elabMemberKeyAt(decl, T)` with `T` the type the checker recorded for the slot, never mono's pins.
  Measured over `tests/cases` with fixpoint seeds: 0 programs' bytes move. An instance the
  elaboration has no key for keeps mono's spelling.

The typed fallback (`monoTypedKeys`), which reuses an instance by its pinned types, serves a
request only where the request's elaboration key and the instance's spell the same instance: one
rep can carry two types whose bodies differ, by an `is` test (a `Set` and its map twin, D10540) or
by a type parameter read as a value (`R.size` in the `flat-generic-rows-*` fixtures). That guard
replaced `monoElabSplitKey`, which asked the elaboration for the call's wanted instance a second
way (`elabCallInstWant`); both are deleted. Gating the guard on `elabTestsTyVar` alone misses the
`R.size` reads and miscompiles three programs, so it applies to every body.

**A lambda's instance is keyed by the instance it is nested in** (2026-11-06): the walk top
(`elabWalkTop`), the declaration, and the rep and tagged set of each pin. Measured against the
elaboration's own index of nested instances (`elabKidsAt`) over the 1,423 lambda instances in
`tests/cases`, that key names exactly the elaboration's instance for all 1,377 made inside an
instance walk; the 46 made outside one have no elaboration key and keep mono's. It moves no
module's bytes.

The typed fallback (`monoTypedInstKey`) slices mono's spelled key at the offsets
`monoMakeInstanceKeyOf` recorded, so it is derived from that spelling and never from the
canonical key that replaces it. Sliced from the canonical key it read garbage: the 76 byte
movers of the call half were that, and it reused a wrong lambda instance when the lambda key
first switched (`generics/hole-call-generic-lambda-arg.vl` trapped).

**Where the two keys still disagree** (2026-11-06, fixpoint of master `597704eca`). 165 instances
have a call-time key (`instKeyCallTime`) that spells differently from the key mono demanded
(`elabDemand`):

| class | n | difference | partition |
|---|---|---|---|
| set vs signature | 140 | a hole parameter handed a tagged set is keyed by the set (`Fn#7`) on one side and by its closed signature on the other | one-to-one per declaration |
| one set, two signatures | 3 | a generic in a set instanced at two types (`generic-fn-value-returned-through-identity-hole.vl`) | the set alone merges two instances; the pinned reps keep them apart |
| nested member at another parent | 14 | the typed-slot lookup returned a nested instance under the first enclosing instance | fixed: `elabMemberKeyAtTys` prefers `elabKidsAt(decl, walkTop)` |
| bundle member | 4 | a lambda handed as a closure bundle has one instance per signature; the value key names another member | the key needs the member's signature (`elabCallBundleSigs`) |
| type vs rep | 4 | one side names the type (`T=(1\|2)`, `{r:null}`), the other the rep | expected; the rep component carries it |

The 4 bundle members are keyed since #6461: the value key (`instKeyValueTime`) asks
`elabValueKeyAt` for the member taking the pinned types. The other classes are spellings the
canonical key already absorbs.

## 4. Scoreboard

The scoreboard reports side effects of the migration; it is not a landing criterion (§3).

One row is now held: the pin and position layer, row (a) of the special-case helpers, may only fall. It grew from 1,516 functions (76a3eb8fd, 2026-10-25) to 1,571 (f2599d8e5, 2026-11-04) while the elaboration that replaces it was built beside it, because no gate graded it. `tests/budget_pin_helper_test.ts` holds each of the three files at or below `scripts/pin-helper-budget-baseline.json`. A PR that retires helpers lowers the baseline in the same PR; a PR that needs a new one says why in its body and raises it there.

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

### 4.1a Reading at cb348241 (2026-10-31)

Same commands as 4.1; the baseline above stays as the reference.

| Metric | 76a3eb8fd | cb348241 |
|---|---|---|
| compiler/*.vl lines | 371,600 (229 files) | **366,524** (238 files) |
| emitter / checker / fn_* lines | 188,533 / 112,825 / 9,594 | **173,193 / 120,408 / 9,601** |
| functions | 14,784 | **14,927** |
| seed bytes | 5,916,548 | **5,954,946** |
| special-case helpers, (a) pin and position | 1,516 | **1,490** (emit_mono.vl 1,064, fn_split.vl 243, fn_flow_shadow.vl 183) |
| special-case helpers, (b) classifiers | 892 (3,971 call sites) | **818** (3,143 call sites) |

The emitter fell by 15,340 lines and the checker grew by 7,583: facts moving to their producer, as §3 intends.

### 4.1b Reading at 2d9c02fc8 (2026-11-01)

Same commands as 4.1, on a quiet 4-core cloud box (load under 1 at start). Fuel and counts are exact;
this box's RSS is not comparable with 4.1's, so only the plumb RSS (graded by its own script) is given.

| Metric | 76a3eb8fd | cb348241 | 2d9c02fc8 |
|---|---|---|---|
| compiler/*.vl lines | 371,600 (229 files) | 366,524 (238 files) | **366,702** (238 files) |
| emitter / checker / fn_* lines | 188,533 / 112,825 / 9,594 | 173,193 / 120,408 / 9,601 | **172,530 / 121,178 / 9,601** |
| functions | 14,784 | 14,927 | **14,982** |
| seed bytes (fixpoint) | 5,916,548 | 5,954,946 | **5,965,733** |
| L2 self-compile fuel | 75,749,721,676 | 59,619,845,390 (measured today) | **61,904,280,945** |
| diderven check / build fuel | 48,290,741,306 / 6,282,852,143 | – | not read: no diderven tree on this box |
| plumb-shape main / tail fuel | 7,493,309,049 / 5,422,531,645 | – | **7,312,307,918 / 5,325,933,774**; RSS 316.2 / 315.9 MB |
| special-case helpers, (a) pin and position | 1,516 | 1,490 | **1,477** (emit_mono.vl 1,051, fn_split.vl 243, fn_flow_shadow.vl 183) |
| special-case helpers, (b) classifiers | 892 (3,971 call sites) | 818 (3,143) | **815** (3,075) |
| special-case helpers, (c) ExpCtx | 17 fields | 5 fields | **4 fields**: 128 writes outside `expCtx*`, 22 resets |
| whole-arena scans outside a pass | 67 (baseline file) | – | **46** live; the baseline file holds 52 |
| emitter pass rows | 47 (27 re-derive) | – | **43**; the re-derive split was a hand reading and is not re-graded |

The (c) row's counting rule is a field write `x.<field> =` outside the `expCtx*` helpers, a reset being
one whose value is `false`, `0` or `-1`. It reads 427 writes and 64 resets at 76a3eb8fd, where 4.1 hand-counted
458 and 83, and 146 and 26 at cb348241.

What moved since cb348241, across 93 commits that touch compiler/:

- Lines rose by 178 net. The largest deletions: #5396 (−312), #5394 (−233), #5392 (−181),
  #5462 (−161), #5368 (−149), #5442 (−132), #5416 (−119), #5454 (−112). The largest additions were
  elaboration and check work: #5448 (+242), #5345 (+227), #5441 (+213), #5424 (+151), #5360 (+108).
  The checker grew by 770 lines and the emitter fell by 663.
- The seed grew by 10,787 bytes (+0.18%).
- L2 fuel rose 3.8%, and not monotonically. Fixpoint samples: #5377 59.77 G, #5384 59.81 G,
  #5394 60.49 G, #5392 60.44 G, #5402 61.80 G, #5433 60.84 G, now 61.90 G. The largest single
  step is #5402 (+1.36 G, +2.2%). From 76a3eb8fd to cb348241 it fell 21%.
- Helpers (a) fell by 13, all in emit_mono.vl, where the mono deletions above landed. (b) fell by
  3 classifiers and 68 call sites; it was not read per commit. (c) lost a field (`rawNullRead`,
  #5385).

### 4.1c Reading at b9f2a457f (2026-11-01, afternoon)

Same commands and box as 4.1b, nine hours and 129 commits later (114 of them touch compiler/).

| Metric | 2d9c02fc8 (4.1b) | b9f2a457f |
|---|---|---|
| compiler/*.vl lines | 366,702 (238 files) | **368,372** (239 files) |
| emitter / checker / fn_* lines | 172,530 / 121,178 / 9,601 | **173,413 / 121,750 / 9,802** |
| functions | 14,982 | **15,083** |
| seed bytes (fixpoint) | 5,965,733 | **6,003,573** |
| L2 self-compile fuel | 61,904,280,945 | **58,741,013,921** |
| plumb-shape main / tail fuel | 7,312,307,918 / 5,325,933,774 | **7,077,967,937 / 5,159,264,911**; RSS 312.4 / 311.9 MB |
| special-case helpers, (a) pin and position | 1,477 | **1,480** (emit_mono.vl 1,054, fn_split.vl 243, fn_flow_shadow.vl 183) |
| special-case helpers, (b) classifiers | 815 (3,075 call sites) | **819** (3,011) |
| special-case helpers, (c) ExpCtx | 4 fields, 128 writes, 22 resets | **1 field** (`litUnion`), 49 writes, 8 resets |
| whole-arena scans outside a pass | 46 live (baseline 52) | **27** live, baseline 27 |
| emitter pass rows | 43 | **43** |

What moved:

- **L2 fuel fell 5.1%.** The claw-backs were #5520 (nliAtomOfExpr's name index, −3.9%), #5510 (the
  nul-atom memo, −0.88%) and #5518 (the lazy value-reach index, −0.77%). At efc86b3b4 it read
  58,086,244,007, which is the tripwire baseline (#5531), so later landings put back about 1.1%.
  That rise was not read per commit.
- **Plumb fuel fell 3.2% (main) and 3.1% (tail).**
- **(c): ExpCtx lost three fields** (`nulBool`, `nulLitUnion` and `nulString`, with every write to
  them) in #5571. Only `litUnion` is left.
- **Arena scans went 46 → 27.** #5520 removed one. #5525 allow-listed 13 once-per-module scanners,
  which held 18 findings. Only `nliAtomOfExpr` carried fuel: the other scans each read ≤0.27% of
  either profile.
- **Lines rose by 1,670 net.** The largest deletions were #5571 (−256), #5492 (−159), #5486 (−101)
  and #5473 (−81). The largest additions came with union-arm reference rows: #5584 (+279), #5553
  (+142), #5574 (+135), #5538 (+131) and #5479 (+122). The seed grew by 37,840 bytes (+0.63%).

### 4.1d Where the seed's growth went, 0becd8120 → 9d1d7374 (2026-11-01)

#5735 rewrote the seed-size baseline after +177 KB of growth since the #5235 reading, which was taken
at 0becd8120. This section prices that growth by function. It is a one-off measurement, not a gate.

Method. Each tree was built to its own fixpoint, then once more with `--names`. Function bodies were
summed from the code section, keyed by function name. Names are compared without their module hash and
line, so a function that moved files is not counted as added and removed.

| | 0becd8120 | 9d1d7374 | change |
|---|---|---|---|
| seed bytes (fixpoint) | 5,901,246 | 6,078,235 | +176,989 |
| code-section bytes | 5,461,169 | 5,630,768 | **+169,599** |
| distinct function names | 14,886 | 15,384 | +498 |

The code-section change splits as follows:

| | bytes |
|---|---|
| names that are new | +503,263 (1,557 functions) |
| names that are gone | −267,772 (1,060) |
| names in both, grew | +83,599 |
| names in both, shrank | −149,491 |

**Where it came from: the new producers.** The elaboration, the tag decision and the mint
(`emit_elab.vl`, `check_elab_cap.vl`, `check_fn_tag.vl`, `check_mint.vl`) went from 38,699 to
215,196 bytes, **+176,497**. That is more than the whole net growth.

- **The largest new or grown functions:** `elabRun` (+4,647), `readRepGo` (4,548), `rowMintFrom`
  (3,527), `elabOne` (+3,335), `elabCanonStr` (3,095), `elabSetArgBind` (2,525), `fnTagDecide` (2,461),
  `ftPlan` (2,188) and `elabSetCallRows` (2,187).
- **By file, bytes in names that are new:** emit_elab.vl 85,682, emit_classify.vl 42,535 (the read-rep
  layer, against 60,063 gone from that file), check_fn_tag.vl 39,210, check_elab_cap.vl 35,827 and
  check_fit_rules.vl 31,975.

**What was deleted.** The largest falls by file were emit_classify.vl (−48,750), wasmEmit.vl (−15,499),
emit_collect.vl (−12,176), emit_ty_canon.vl (−12,006), emit_ref_list_kinds.vl (−11,297),
emit_narrow_slots.vl (−11,275, gone) and emit_sig_tokens.vl (−10,940). These are step 5 and step 6's
classifier and narrowing deletions. Named families §3 marks for deletion, now at or near zero:

| family | 0becd8120 | 9d1d7374 |
|---|---|---|
| `pushNarrow*` | 3,314 | 290 |
| `pinHoleLambdaArg` | 1,532 | 0 |
| `expCtx*` | 1,309 | 0 |
| `nodeTyInDerived`'s rungs | 1,193 | 188 |
| `letRefListDestSlot*` | 694 | 0 |

**What was meant to go and is still here.** The step 2 to step 4 deletions have not started in bytes:

| family | 0becd8120 | 9d1d7374 | change |
|---|---|---|---|
| fn_split.vl | 165,849 | 167,688 | +1,839 |
| fn_flow_shadow.vl | 75,676 | 75,125 | −551 |
| emit_mono.vl's `mono*Pin*` functions | 116,212 | 113,000 | −3,212 |
| `genFnHole*` | 10,173 | 10,126 | −47 |

Those families still hold 366 KB. Mono's rung B (#5723) accounts for 992 bytes of the `mono*Pin*` fall,
counting the rung and the two helpers only it called. Its neighbour `monoPinAnnotatedParam` grew by
1,238, to 5,086.

So the refactor has paid for the new producers (+176 KB) almost entirely in seed bytes. The deletions
those producers exist to enable are still to come. §4.2's step 4 "↓↓" on seed is the line that has to
move. Retiring the split plan (increment 3) deletes fn_split.vl and fn_flow_shadow.vl (243 KB). The
pin ladder's deletion (step 2) is the other 113 KB.

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

Step 4's deletion half, measured on its prepared branch (§3.2, 2026-11-05): `fn_split.vl` goes
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
