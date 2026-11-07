# What stands between master and deleting the split plan

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.2 on 2026-11-07; its `§` references are to that file.

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
| W, other | 2 | a void and a value generic written to one `let` and called at two types (`generic-value-return-written-to-void-generic-let`, W-split's ruling question; ruled B2 on 2026-11-05, the void-seeded order is accepted and its module block, the binding called at two types, is [D15449](../inventory/D15449.md), closed the same day: a set split only as `void` against one value stays tagged (`rsVoidSplit`), so the file runs without the plan), and a written set handed to a hole parameter then spread into a closed list (`fn-set-list-of-hole-param-spread-into-closed-push`, D15432: the copy's adapter is built at the template) |
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
