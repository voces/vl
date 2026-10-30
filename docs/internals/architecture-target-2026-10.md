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

**Mono reads the closed type first (#4860, #4878, #4888, #4892, #4911, #4915).** The open-argument i32 floor is no longer an instance key (#4860), and `monoClosedTyName` reads the closed elaboration (#4878). `monoArgTyName` reads the closed type first, and the cascade serves only three facts (#4888, a staging step with two producers): records, function types and narrowed kinds, which disagree at 1,349 sites in 246 files, 361 in 67 and 60 in 15. Fact 2 has landed: a closed function type pins through `monoFnTyPin` (#4892). A generic function named at a closed function type adopts per instance, as an identifier and then as an element, field or return (#4911, #4915); pin sites go from 478 files to 456.

**Increment 3, D1: mono reads the checker's instance (#4839, #4843).** The checker re-keys `callBind` at the adopted rep (`check_bind_adopt.vl`), and mono reads that key through `elabDemandFrom`. The bridge stays on two declines: a `Fn#` or hole in the key, and a closed pin not assignable to the key's substituted parameter. Instances collapse by rule (DECISIONS.md, "Two instances share a function when rep and elaboration agree"). An instance's spelling names only the type variables its declaration reads (#4843), which leaves +1 generics and +2 closures in the self-compile, each a distinct binding master merged by key collision.

**Increment 3, slice (ii), waits on the elaboration moving into check.** The root-seeded `Fn#d` instance is the producer of hole-function instances reached through function values. Lazily checked instances run after the rewrite passes (`loopValueRewrite`, `dispatchRewrite`, `captureBoxRewrite`) on a rewritten arena and pin nothing. Binding fallbacks on 8d0974164 are 9 (lamcall 1, operand 5, pinned 3).

**Moving the elaboration into check, measured on 8d0974164.** Two populations block it:
- **Late demands.** 2,165 late instance checks in 518 of 5,065 @run files, all from emit_mono's `elabDemand`; the self-build has 0. By kind: nocall-root 1,052, unusable-root 336, then nock and pins. nocall-root by pin source: 586 from the fn-flow class pin (`ffBuild` over the rewritten tree), 196 identity through a field, 84 keyable now, 186 with no source (capture-cell lambdas). The missing fact is function-value flow: Decision 5's `Fn#d`, carried through typing, replaces the 0-CFA pin.
- **Speculative instances.** `monoRecheckEnd`'s rollback discards 820 instance diagnostics in 152 files that run today, so surfacing them would veto. By minting site: the eager seed 589 (310 type-parameter, 279 hole-parameter declarations), hole-function pin rows 173, nested calls of a seeded instance 36, mono's late demand 22. The main producer is the checker's closed `callBind` rows: a row that fixes a hole parameter at one call's type mints an instance whose body does not check at another call's type (`closures/hole-copy-chain-called-at-two-types.vl`).

The order: checker rows for value-of-generic deliveries, one slice per kind; then `elabRun` moves into check with the error channel once both populations are 0, and `pinHoleLambdaArg` goes with it.

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

What is left (56 files on 2026-10-30), by what the elaboration would need to know:
- a hole function returned through an identity (`fw(g)`) and called at several types, where mono builds one instance per type the result is called at;
- a callback over records whose pin names the adopted row (`{v: A}`) where the checker holds the structural type. Keys stay nominal, since fixtures keep same-shaped rows apart;
- two instances widening to one pin, and string literal unions (an atom, not `string`), which wait on mono keying instances by the elaboration;
- the capture-cell hole lambdas (D14425) and function values delivered into a still-open generic slot, which mono defaults;
- a tail of single rules.

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
- step 4: (γ) by position, `Member`/`ObjLit` landed (#5001, D9191 closed) c-3's stamp is on the tag rule (#5009), container slot writes join (#5015), callback deliveries adapt through `fvaAdapt` (#5032) and a `.map`/`.filter` callback over a set's list is delivered through it at every set size (#5049); next the remaining pin populations (e, 98 files; f, 34), then returns, (b) shape interning for nested tagged lists, and ef-1b (singleton hole fns in map values or record fields with no call through the set), each slice deleting the element-pin reads it covers, with c-2 beside it; D14435 is closed (the bound spelling `const fs = [twice, lenOf]; for g in fs` runs: `holeSlotJudge` compares no hole members' results for an element its initialiser alone fills), and D14645 is closed (a pushed element joins the binding's set, `elabFnListLetTy`), D14646 is closed (an index write is an id store into the tagged list, `ftCtxOk`), D14647 is closed (an alias's writes join the source's set, `cwListElemFnTargets`), a re-pointed `let` joins its re-pointing literals (`cwLetRepointFnTargets`), a returned list literal is read per call (`holeSlotRetApart`), with D14648 (parameters, returned lists written after, record list fields and map index writes, still judged) open; D14428 (g4) after (γ); D14431 (filed by #5001); D14433 (a map of a set through a generic helper; waits on mint); D14429 (fh1), D14430 (`ftInOpenFn`) and the in-instance tuples with slice (c)'s per-instance mint, whose facts, decide reader, mint-scope instances and `Param` types landed (#5064, #5067, #5072, #5075; pins freed 1 of 31); next the fact producer visiting every call through a hole parameter in an instance, and the emitter's per-tuple instance reading the mint, which closes D14439 (a two-member set handed to a hole parameter called at two tuples, clause 1); measured on 2026-10-29 (D14439, "The emitter piece"): arms calling each member at the call's tuple, mono's and the emitter's set read through the facts and the instance's elaboration run the reduced witness, and what stands in the way is the split plan (D6210) copying a parameter a tagged set reaches; the let-write join slice (the capture cells and the impure else-if nested join, D14425); slice (d); the pin callers go in the slice that closes the last cell; the fresh `let` read head with the `Fn#` mislabel; then fn_split, fn_flow_shadow and the driver loop, deleted jointly with increment 3;
- increment 3: move the elaboration into check (both populations to 0, then the error channel, which deletes `pinHoleLambdaArg`); then slice (ii), the binding fallback, the D6210 rung and `holeFnSplit*`; late demands fall from 589 to 56 of 17,267 files ("Late demands, re-measured" below); the step-4 mint waits on the same work, since the split plan (D6210) copying a parameter a tagged set reaches is its blocker (D14439);
- mono: cascade facts 1 and 3, then one producer for `monoArgTyName`;
- container adoption: the name scan, once the checker settles a literal's field types at the node;
- step 5: `rlElemKindTbl` (D14227; its readers go one at a time once the type reader covers each, first `forInElemKind`, whose table ladder no file over 17,267 reached, then twelve element-kind tests in `emit_classify` (union, row, map, closure) that a probe found agreeing with the type at every read), 5c's five `ExpCtx` fields (a bare `null` reads its delivery's stamp since #5117–#5119; on 2026-10-29 the two seed floors left in `nullOwnAt` were reached by 5 of 17,265 files: the D4671 null-unit cell by `types/infer-null-hole-never-filled`, `types/null-unit-heap-positions`, `unions/null-list-arm` and `unions/null-list-arm-unann`, a `null` stored in an `i32` sentinel cell that no type names, so it waits on the per-binding storage column; the D14640 elaboration floor by `generics/join-type-params-literal-union-string-null` alone, so it waits on step 4's mint; `nulString` waits on D14641), `numLitWidth` as the single width reader (every `emitNumLitAs` caller takes `w` from a checker type), the three named width-passers (`njPushSide`, `emitBinOperandAs`, and `emitInstLitAs` after the per-instance mint), the literal-union and lexeme-fit readers, the two orphan-literal builders, and the destination-bound pin fact for `dstRetypeLitArgs`;
- step 5, the nullability family: slices 1a (#5021), 1b (#5026) and 1c (#5031), the map reader (#5036), the null compare's rep predicate (#5037), the niche question (#5038) and the nullable-struct reader (#5040) are done. Census of 1,533 Ident read occurrences where rep and storage disagree: about 1,416 are narrowed reads, whose producer is `narrowedFromTy` (#5042); 22 plain lines (64 occurrences) belong to the per-binding column; 127 non-Ident lines (box-field Member, `if` joins, Index, `??`) are beyond both. Open: the litunion pair (`exprIsLitAtom`/`exprNulLitUnion`), refuted as a reader change by shadow A/B (736 lines in 281 of 1,410 reaching files; a rep-only build fails 92 of 6,569): its narrowed buckets read `narrowedFromTy`, and its atom-versus-storage buckets (the 22 plain lines) move onto the per-binding column, which landed with #5047, in s12's next slice, under the storage-gap ruling above; the `nulnone` reader (D14564), parked on `narrowedFromTy` too, because a null-narrowed read's answer is its cell kind, the rep of the type before narrowing; and the variant kind, which has one producer since #5030 but stays storage-keyed and moves with Step 7's Ident ladder. `exprNulStrArray` asks about element nullability and is not in this family. D3421 (clause 1) now traps on `ref.as_non_null` because its read is recorded as `string`;
- step 5, the record line (DECISIONS.md, "A fresh record converts at one delivery point"): the converting-copy producer, `recNullWidened`'s allowance and the D81/D139 dst-pin are done (#4987). The operand slice (#4997), `exprIsF32`'s recorded type (#5008) and the i64/f64/v128 family onto `exprScalarWidth` (#5016) are done. `exprScalarWidth` still reads four ABI facts the recorded type does not carry: a direct call reads its callee slot's result, a `??` reads what its lowering yields, an open parameter read reads its instance's declared type, and a function-value call reads its signature's result. D14562 is the cost row for the "narrowed module bindings" scaling arm; D14495; D14496 (an un-annotated parameter fed a call into a wider record, 2 silent cells); D14492's operand hole waits on mint's store;
- step 6: c-2, per-instance rep flow (an instance's type and rep as separate facts, deleting `callBindAdoptRekey` as a type producer; D14515 kind 1, D14426); then D14532's rep flow to rep-taking destinations, with D14530 and D14531; the `recReadInPlace` deletion with the slot patch, and the stamp mint without its D244/D2750 losses; the `arrLitElemName` destringify (D14533); the collector mint and the literal build together, with slice (c) minting each instance's `#anon` row; a per-binding storage-rep column (B2c-3, s12), which is D14434's one cell-kind producer for `globalCellKindGo` and `letBindRepClaims`: global storage reads the rep since #5044 and the `bindCellRep` column landed with #5047; literal-union storage has one producer for lets (#5053) and globals (#5061), and G1 landed (#5058); loop variables read the column and the slot flag `localLitUnion` is gone (#5068, #5069, #5071), and a slot holds its declaration in one column (#5073), which a read resolves through (#5077); the name-keyed `declaredSlotLive` and the D1597 readers stay, in progress; next the storage-gap ruling's remaining bucket, G3. Open: `monoTpJoinBindAnn` still mints the instance copy's binding annotation, beside `monoCoalBoxBindAnn`, `monoApartJoinAnn`, `monoPushedListAnn`, `monoStoredMapAnn`, `monoHoleListLitAnn` and the out-list copy, each losing a file when ablated (78, 27, 5, 6, 9, 49 and 26 reaching files on 2026-10-29; `monoCollCtorAnn`, `monoCloPinListAnn`, `monoCloPinShapeAnn` and `monoMapReadNulAnn` moved nothing and are deleted), and on 2026-10-28 183 lines reading `.parType` stand in 21 emit files (104 in `emit_mono.vl`; 188 before #5084 by the same count); #5075 moved the two literal-atom `Param` arms onto the elaboration, #5084 put the instance parameter-type reads behind `paramTyAt`, and #5092 deleted it with its fallback to the minted annotation (c2): the readers call `nodeTyAt`. `paramCloSigKey` stays on the annotation, blocked by D14572. These go together (D14568, a4cf), with D14572 (`elabWalkTy` answering another instance's type) and D14573 (the Set spelling against the boolean map) as the refutation pins that must keep running; then #5028's `letNulScalarBoxName` guard becomes a read of the column, and D14563's two producers are one since 2026-10-29 (`letCellKind` answers `nulbool`, `globalReadCellKind` deleted); the narrowing stack: the `narrowedFromTy` column landed for identifier reads (#5042), field-read receivers read the checker's narrowed-read fact with path reads recorded per instance (#5070), and closure, niche, nullable-literal-union, null-test and numeric-join reads read it through `readNarrowedStoreAt` (#5074), and C1 and C2 moved the print, coalesce, pin, for-in, map-read, shared-field and nullable-string-list readers onto `readNarrowedTyAt` (#5080, #5082), so no lowering reads the stack. C3 deleted the stack (#5089); next the checker's two narrowing stores as one (B2). The D14487 pair is gone (#5078);
- step 6, the narrowing stores (DECISIONS.md, "One lexical binder writes every identifier's declaration"): B0, the lexical binder, before B1b-i, because 56,482 `placeKeyOf` calls reach an `identDeclOf` not yet written (43.4k member receivers, 11.6k bare assignment targets, 1.4k condition subjects). B0 is done (#4985, #4991, #4995). The two read-side loop finders are one, asking the plan by declaration (D14543 closed). E1, one type store keyed by declaration (`envTy[decl]`, with an undo log), is done (#5011). B2a (#5014), Q1 (#5023), B2b (#5024), B1b (#5029) and B2c-1 (#5035) are done: scope reads, member calls, the narrowing bank, the guard-key lists and the flow analyses ask the binder's declaration, and `envDeclOfNameForFlow` and `declare` are deleted. B2c-2a (#5041) deleted the by-name scope chain and elab_cap's by-name side, and repaid B2c-1's floor (diderven check 1,972,235,704); B2c-2b (#5043) keyed the write scan's frames by declaration and deleted `cwSoleBinderOf`/`cwFrameDeclCount` (1,970,277,404). B2c-2c (aa0c): the occurrence index is chained by declaration with call and method-call rows on one may-write-anything chain (D2390) (#5046), `cwBoundOnce` takes a walk and the index files binding rows for `LoopVar`/`ForRange` (#5048), and the single-binding readers take the binding's declaration (#5050). The alias-set world is keyed by declaration (#5052), `covarRootFrame` and `cwSameFrame` are gone (#5054), the capture writer is keyed by binding (#5055, #5057), CALL rows key on the resolved `FuncDecl` (#5059) and MCALL rows on the sole self-fn (#5060). Floors that remain, each with its deletion target: overloaded or type-bound MCALL spellings, plus `cwSelfDeclsNamed`, keep the unknown key until the key is filed from the checker's resolved pick (`ovPickFor` or the ufcs fallback), which needs filing after checking or per-generation invalidation of the lazily filled chains; calls through fn values, params or unresolved names keep the D2390 unknown chain, by design; slice C keyed the capture writer's handles, mentions and binders by declaration (#5063), so `crwUseNames`, `crwBound`, `crwFnMentions` and `crwAnyWriteBase` are gone;  of the emitter-facing name banks, `crAfterBank`, `crBeforeBank`, `crCondDropBank`, `crSoleNames` and `crRhsNames` are gone, `crRhsRetired` holds place ids, `crLambdaHandle`, `crEscapesIn` and `crCapRecHandles` are keyed by declaration, and the capture-widen and capture-loss banks hold declarations rather than names, with `crCapRecNames` and the emitter's unread `capWidenOf` deleted; a `crDeclareWidened` layer is its slot (`crWideNames` is deleted; the same-scope redeclaration rule reads the name off the slot); `crAskProg` records the declaration a whole-program question asks about and the driver spells the persisted builder key from it (`skAsksNow`), and `crRootMayKeep` matches an assignment's target by declaration; and the capture-by-reference walk (`crCaptureByRef`) records captures, assignments and declaration loops by declaration, as the emitter's `cbox` walk it mirrors does, so the capture walks hold no binding names; `cwDeclCount`'s (frame, name) grouping is gone (#5081, D3027 closed) and `crCallCandidates`' cache keys on the outermost declaration (#5083), since the emitter allocates a local per declaration (#5077). This closes D14544, the transitional second resolver (DECISIONS.md, "The binder is the only identifier resolver"), and D14545's 12 programs are its witnesses. B3 is done (#5113, #5114, #5115): the clobber ledger, the write path's prefix scans over `npKeys` and D3307's root compare are on place ids. B2's first two stages are done (#5124, #5125, #5129 and the store move): the bank's type column is gone, every row reads the binding's storage type through `slotStoreOf`, and an identifier's narrowing is a row of the one narrowing store (`check_nar_store.vl`) at its zero-length place, carrying its kind, depth, epoch and stamp; `check_nar_bank.vl` is deleted. Stage 3a is done: each identifier row carries its layer's narrowed type, kept in step at every layer write, and a declaration clock retires a row whose binding was declared again (a module `let` the main pass reaches after its initializer's pre-pass); a probe found row and layer equal on every identifier read in 17,265 files. Stage 3b-i is done: every identifier-type read outside `check_scopes` asks the store's `declTyOf`/`identTyOf`/`placeNameTy`, which answer a live row's type before the layer's (`layerTyOf`). Stage 3b-ii is done: no narrowing writes a scope layer (save a guard test that leaves the type unchanged, whose scope still binds the name); the layer walkers ask the store's `narChainDepths`/`narTyAtDepth`/`narTopDepth`, `narSetScope` and the journal replay write the row, and the elaboration snapshot takes the store's type. B4 is done: `narSetScope` and the journal replay write rows only (a probe found no layer fallback in 17,265 files), `narIpScope` goes since `narIpSlot` already tells a bare name's entry from a path's, and `crFirstBank` is the store's `narRowAt`. The narrowing stores are one (B1–B4), with the layer writers gone and a per-declaration row index first), then B4 as listed under "Landed after #4966";
- step 7, repOf / variant identity (D14551, D14552): the kind-(ii) reader migration's groups 1–3, the heap-slot readers and the object-literal readers have landed (#5005, #5006, #5007, #5010, #5012), and `armRowOfRecordTyShim` and `vrIxFirst` are deleted (#5022; D14552 closed). D14551 is closed (#5017): every registrar mints at its held arena type and a row is found by its flat member set's canon id. The D14432 slice, union rows admitted and boxed by member reps, landed (#5027; D14432 and D3398 closed), and the nullable-variant kind and row have one producer (#5030, #5033). Remaining is the Ident ladder: `nulVariantIdxOfExpr` onto `repOf`, which deletes the `nulVariantIdxOf*` and `capturedNulVariantIdx` callers. The Ident arm of `nulVariantIdxOfExpr` now reads the row off the read's storage type, the per-instance narrowed store (`readNarrowedStoreAt`) else its own type, and the parameter, slot-column, capture, global and frame-`let` rungs go with `capturedNulVariantIdx`, `nulVariantIdxOfLetIn` and `paramNulVariant` (the two answers differ in 6 of 17,265 files: three narrowed lambda or generic parameters gain the niche row their storage holds, two hole-optional reads and an arm map beside its layout twin lose one; four of the six build byte-identical and the two hole-optional reads drop a redundant `ref.as_non_null`). The global branch landed with #5044 (`globalCellStructIdx`); the local and narrowed arms are s12's, unblocked and still open, reading `narrowedFromTyOf` (#5042) and, for a local, the `bindCellRep` column (#5047). In the census, 105 files are narrowed-niche reads (storage niche, rep a non-null variant) and 9 are reads of a box narrowed by `is` (storage box, rep `nulvariant`). In both, the storage is the rep of the type before narrowing, a fact the read's rep does not carry and slice 3 records. D14434 (#5019) is a refutation pin: a global's cell kind (`globalCellKindGo`) and a local's (`letBindRepClaims`) are two producers, and unifying them moved 19 of 6,804 `tests/cases` files from runs to not-runs until the global storage paths hold the local's kind. Since #5044 a global's cell kind comes from `letCellKind`, the local's producer; the target is still one stored cell-kind answer for both scopes, Step 6's per-binding storage column. The Ident ladder landed (#5127): `nulVariantRowOfRead` reads the row off the read's storage type. A local's cell kind is now `letCellKind`, the module global's producer, at the slot `letCellSlot` reads for that kind, so `letLocalSlot`'s own ladder is gone; the two disagreed in 1 of 17,265 files (a `string | null` instance's mapped list, which `letCellKind` gains a `strlist` rung for), and no file builds differently. A global's and a local's cell slot are one producer, `letCellSlot`: a `map`, `nulmap` or `reflist` cell reads the shape or row its stores and initializer deliver (`letMapShapeOf`, `nulMapShapeOf`, `letRefListSlot`) before the type's rep slot, and `emitGlobalSection` asks it at both its sites. D14643 was a local that refused where the global ran; after it, 1 of 17,265 files builds differently, a local reused for a nullable map whose shape code now matches an earlier one's, with the same types and output.

---

## 4. Scoreboard

The scoreboard reports side effects of the migration; it is not a landing criterion (§3).

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
