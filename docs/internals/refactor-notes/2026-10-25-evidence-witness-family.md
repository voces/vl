# Evidence: the witness family, its root cause, and the pipeline survey

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §1.1–§1.3 on 2026-11-07; its `§` references are to that file.

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
