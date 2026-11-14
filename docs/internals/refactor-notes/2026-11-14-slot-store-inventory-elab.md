# Inventory: the function-holding-slot facts in the elaboration (read-only survey, 2026-11-14)

All line numbers are `compiler/emit_elab.vl` unless another file is named. "Slot" below means
(holder, path, instance). I counted 138 top-level functions matching
`elab(Slot|Held|Value|Written|Lit|Uncalled)*` (130 in emit_elab.vl, 8 in check_elab_cap.vl). The
family tables in §5 also take in about 30 helpers with other names that compute the same facts
(`elabBindingWholeTy`, `elabReadOn`, `elabLamParamTy`, ...).

---------------------------------------------------------------------------------------------------
## 1. HOLDERS: which ones get a fact, and how holder, path and instance are identified

### 1.1 The table
* `elabSlotTys: {[string]: i32}` (13384) is keyed `holder|k` (`elabSlotKey`, 13386). The value is
  the closed type of the **whole holder**. A path is never part of the key: it is applied at read
  time by `elabTyAtPath` (13416).
* It is reset in `elabRun` (10256), so every tag round's `elabPrepareRun` rebuilds it.
* Writers (there are exactly five):
  | writer | line | holder | key |
  |---|---|---|---|
  | `elabSlotFacts` (let) | 13590 | `LetDecl` with `letType<0 && letInit>=0`, outside an instanced fn, whose checked type is `elabSlotOpenFn` (an open list/record/map holding a fn leaf, 13738) or `elabSlotWholeFn` (an open fn, or a nullable of one, 13749) | `ix\|-1` |
  | `elabSlotFacts` (result) | 13611 | `FuncDecl` with `fnRet<0`, `fnTyParams==0`, a body, and result type `elabSlotOpenFn`; ONLY when every returned value is a list literal or a `let` read (`elabSlotRetElems` 13703), closed by `elabSlotCloseElems` (lists only) | `fn\|-1` |
  | `elabSlotInstFacts` | 13659 | the same `LetDecl` class, when it is inside an `elabFnInstanced` fn (generic, or a parameter with no type, 13627) | `h\|k` for each non-guess `k` with `ekDecl[k]==fn` |
  | `elabSlotBundleFacts` | 13452 | the program-level lets `elabSlotFacts` left unfacted (`elabSlotUnfacted`, 13441) | `ix\|-1` |
  | `elabSlotRecordNote` | 7337 | a `LetDecl` record literal whose field keeps a record of members whole (`elabSlotRecFieldTy` 13542) | `d\|-1` |

* **Holders that never get a fact:**
  * Parameters. This includes lambda parameters, whose closed types come from the separate
    producer `elabLamParamTy`/`elabLamInstParamTy`/`elabLamDeliveredParams` (15590–15715) and are
    not stored in `elabSlotTys`.
  * Loop variables. `calleeSlotOf` (check_calls.vl:4481) rewrites `for f of fs` to `fs`+`e`, so a
    loop variable is never a holder of its own.
  * Annotated lets and annotated record fields. They are closed by their annotation; the guard is
    `letType<0` and `tyHasTyVar` in `elabSlotOpenFn`.
  * Map holders keyed per instance through a function result.
  * The results of generic or instanced functions.
  * Record- or map-shaped results. The result rule is lists-only.
  * Closed-type holders. A closed function-set type gets no fact even where its STORAGE (closure
    vs tag) varies.
* Inconsistency: the result rule (13600) tests `fnTyParams.length == 0` but NOT `elabFnInstanced`.
  A function with an un-annotated parameter is instanced per call, yet gets a program-level (`-1`)
  result fact. The let rule avoids exactly this leak (13581–13586). `elabHeldValTy` (17924) reads
  that fact as `elabSlotTyAt(fnIx, path, fnIx)` from an instance frame, falling back to `-1`.

### 1.2 Holder identity
* The holder is the declaration's node index: `LetDecl`, a `FuncDecl` for its result, and at read
  time any node.
* Normalisation is done differently by each function:
  * `elabSlotTyAtKey` (13406) and `elabHolderSlotTy` (17583) map a clone to `nodeSrc` for the
    instance key, but use the clone itself for the `-1` key.
  * `elabSlotDeliveries` uses `elabCellLitBinding` (cboxCellLits, 14826) and `declOrigOf`
    (15141).
  * `elabSlotPerInstance` uses `cboxWriteCells`, `declOrigOf` and `nodeSrc`.
  * `elabSlotHeldIn` uses `declOrigOf`.
  * `elabWrittenSlotTy` uses `nodeSrc`.
* The checker's holder is whatever `slotOfRead`/`calleeSlotOf` returns (check_calls.vl:4481–4590):
  a `LetDecl` (a const copy resolved through), or a non-generic `FuncDecl` for a call's result
  (`calleeCopyCallSlot`, 4575). A Param or loop var is never a holder there; a loop var reads as
  its iterable plus `e`. So `slotOfRead`'s holder set ⊂ `elabSlotDeliveries`' holder set
  ({LetDecl, Param, FuncDecl, ArrayLit, ObjLit, Ident, loop carrier, capture temp}).

### 1.3 Path representation: three encodings
1. Elaboration: `string[]` of `e`/`v`/`f.<name>`, root first. Built by `calleeSlotOf`, which pushes
   after recursing. The comment on `elabSlotTyAt` (13389) says "outermost last" while
   `elabTyAtPath` (13414) says "outermost first". They describe the same root-first order, but the
   wording is inconsistent.
2. Write index: `"[]"` (element OR map value) and a bare field name (`cwSlotPath`,
   check_write_scan.vl:1886; `cwSlotWrittenValues` 1967; `elabWrittenSteps` 17293). It is
   converted by hand in at least 4 places:
   * 15156–15166 and 17485–17494 (e/v → `[]`, `f.x` → `x`)
   * 15259 (`[]` → `e`, even for a map)
   * `elabWrittenSlotTy` 17353 (walks `[]`/name itself)
3. `fnTagSlotMembers` (check_elab_cap.vl:3122) adds the step `r` (a call's result), which
   `elabTyAtPath`/`elabSlotTyOf` do not accept.
* e/v strictness differs between readers. `elabSlotTyOf` (17171) and `fnTagSlotMembers` accept
  `e` or `v` for list and map alike. `elabTyAtPath` is strict (`e` only for TyArray, `v` only for
  TyMap). Line 15259 produces `e` for map steps.
* Path walkers that duplicate one another: `elabTyAtPath`, `elabSlotTyOf`, `fnTagSlotMembers`,
  `elabWrittenSlotTy`'s loop, `elabRetFnListLitTy`'s nested loop (13996), and `fnTagPlaceRep`
  (check_elab_cap.vl:3829, steps `""`/name/`?`).

### 1.4 Instance identity
* `k` = an index into `ekDecl` (and `ekNames`/`ekTys`). `-1` = the program.
* `elabSlotTyAt(holder, path, fnIx)` (13393) maps an emitted function to its key with
  `elabKeyAt(fnIx)` and returns -1 inside a generic's own template (13396).
* Guess keys (`elabGuessKeys`) are excluded by `elabSlotInstFacts` (13644), `elabHeldFnTy` (12952)
  and `elabHeldFnTyIn` (13680).
* Keys minted after `elabRunKeyEnd` (10619), for example mono's clones, have no fact.
  `elabWrittenSlotTy` refuses them explicitly (17349). `elabSlotTyAt` silently falls back to
  `holder|-1`.
* `elabSlotDeliveries` instead filters by an admitted set: `elabDlvKey` plus `elabDlvAdmit`
  (`elabReachClosure`, 14836) and `elabDlvEnterCall` (14978), per call row `elabCallKeys`.

---------------------------------------------------------------------------------------------------
## 2. DELIVERIES: how each walker finds what flows into and out of a slot

### 2.1 `elabSlotDeliveries(d, path, k)` (14672) → `elabSlotDeliveriesAt` (15007) → `elabSlotDeliveriesInto` (15039)
* **Direction:** forward, from the holder to where its slot is read. Its answer is the closed
  function types the slot is delivered at: context stamps and call tuples, not values.
* **Memo and bounds:**
  * Memo per arena epoch (14727), nest memo (14708), cycle stack `elabDlvActive`.
  * `elabDlvDepth>8` (15009); `seen.length>32` (15195, 16337, 16357); `path.length>=8`;
    `elabLitSlotDepth<4`; `outer.length<12`; guard 16.
  * A walk that exceeds a bound returns a SUBSET with no signal.
* **Modes** (globals that change the answer): `elabDlvAnnOnly`, `elabDlvOmit`, `elabCallRec`,
  `elabCallSinkOn`, `elabRetSinkOn`, `elabNoCallParam`, `elabGenericRead`/`ByValue`.
* **Spellings it recognises, by holder kind:**
  * **Param** (15043): each direct call of the enclosing function (`cwFnCalls`). Its argument at
    the same position, **only when that argument is a bare `Ident`**, at key -1.
  * **ArrayLit/ObjLit** (15068–15112):
    * its own type when TyFunc and not all-hole (`elabLitSlotAllHole`);
    * the lets it initialises (`elabLitHolders` 16398: `let x = lit`, or each `let y = f()` where
      `f` returns the literal);
    * an in-place read (climb);
    * a returned literal → each call of its function (`elabRetSlotOn` 16355);
    * an element or field of an outer literal → the outer slot at `[step]+path`.
  * **Ident** (a function named by value) (15115): `elabSlotReadUp` then `elabReadOn`; a replaced
    loop's value carrier.
  * **Capture-rewrite temp** (15134): the cell at `["e"]+path`. A shared cell gets the binding at
    `path[1:]` (15145).
  * **Every binding** (`elabSlotReadDeliveries` 15184, over write-index occurrences):
    * each USE → `elabSlotClimb`;
    * an ASG occurrence `b = a` (a bare Ident rhs, path>0 only) → `a`'s slots;
    * a CALL occurrence by its own name (path==[]) → the call tuple;
    * an un-annotated const/unwritten `let b = a.f[i]` → `a` at the full path (`cwSlotPath`,
      15256);
    * a literal init holding a named binding → that binding at `path[1:]` (15265).
  * `elabCallsReading` (17064): calls whose callee reads slot `cp` of the binding, also through a
    chain of unwritten const aliases (`elabSlotReadKeys` 17096).
  * The holder's own annotated type (15170).
* **`elabSlotClimb` (15361), the steps it climbs from a read:**
  * `x[i]` (e/v); `x.f`; `x?.f`;
  * element methods `pop/get/at/find` (`elabElemMethod` 15537);
  * callback methods `map/filter/forEach/find/findIndex/some/every` (param 0) and `reduce`
    (param 1), which go into the callback's parameter only when the argument is a
    function-value decl (`cwFnValueDeclOf`);
  * same-slot methods `slice/filter/reverse/concat` (15532);
  * rewritten places (`CW_UP_OBJ`, read stamps kept);
  * `optReadPartOf` (`?.get`).
  * At path end it calls `elabReadDeliveries` (15542): stamps plus `elabReadOn`. Otherwise it calls
    `elabSlotAliasOn` with the remaining path.
* **`elabReadOn` (15735), the whole value flowing on (path == [] at this point):**
  * CALLEE → the call tuple.
  * LETINIT → an un-annotated let's reads (an annotated let stops it unless `elabCallRec`).
  * ASG_RHS:
    * to an Ident → that binding;
    * to an Index → ONLY a capture cell's `c[0]=v`;
    * to a Member → ONLY under `elabCallRec`.
  * COAL/ARM → the join's own reads.
  * ELEM/FIELD → `elabLitSlotDeliveries`.
  * RET/TAIL → each call of the function (`elabRetCalls` + `elabValueCalls`), a `.map` callback's
    result list (`elabMapCallOf`), a written function-type result (`elabLamWrittenRetAdd`).
  * ARG:
    * an fva adapter → its stamps;
    * else the callee parameters' reads, entering the call's instances;
    * `xs.push(v)` → the `e` reads of `xs` ONLY under `elabCallRec || elabCallSinkOn`.
* **`elabSlotAliasOn` (16229), the value's slots flowing on (path > 0):**
  * LETINIT (un-annotated);
  * ASG_RHS to an Ident, or into `xs[i]`/`o.f` of a named non-cell binding (step `v` when the
    receiver is a map);
  * ARG:
    * `push` → the receiver at `e` (ONLY under `elabCallRec`/`elabCallSinkOn`);
    * `m.set(k, v)` on an UN-annotated map → `v` (D16121);
    * the callee's parameters;
  * ELEM/FIELD of a literal; COAL/ARM;
  * SPREAD into a list literal (path[0]=="e");
  * ITER: `for x of xs` → `fiDecl1` at `rest`; `for (k, v) of m` with step `v` → `fiDecl2`
    (`elabLoopVarDeliveries` 16329);
  * RET/TAIL → `elabRetSlotOn`.

### 2.2 Spellings missing from the delivery walk (none of these has a probe in this survey; each is a reading of the code)
* **Argument to a Param holder that is not a bare Ident** (15052–15056): `f([g])`, `f(r.fs)`,
  `f(xs.slice())`, `f(cond ? a : b)`, `f(...xs)`, named arguments. These arguments are skipped,
  even though `elabReadOn` handles the forward direction for the same calls.
* **Calls through a function value.** A Param holder only sees `cwFnCalls(fd)` (direct calls), so
  the parameter of a lambda stored in a slot and called as `fs[0](x)` is missed here. It is
  answered separately by `elabLamParamTy`.
* **Plain mode, whole-value writes not followed by `elabReadOn`:**
  * `xs.push(v)`, `xs.unshift(v)` (only followed under call search);
  * `m.set(k, v)` at path==[] (`elabSetRecvDecl` is used only in `elabSlotAliasOn`, path>0);
  * `xs[i] = v` into a non-cell list;
  * `o.f = v` (only followed under call search);
  * SPREAD of a whole function list in `elabReadOn` (it is handled only in `elabSlotAliasOn`);
  * spread into call arguments, which neither walker handles.
* **Missing methods:**
  * `shift`, `values()`, `entries()`, `keys()`, `flatMap`, `sort`, `splice`;
  * `concat`'s ARGUMENT lists (only the receiver is followed);
  * `reduce`'s accumulator (param 0) receiving the initial value or the previous result;
  * `elabSlotReadUp` lacks `?.`, the callback methods and the same-slot methods that
    `elabSlotClimb` has (the two are near-duplicate climbs).
* **Annotated holders.** `set` on an annotated map is excluded (D16121). Through an annotated
  `let`, LETINIT stops the walk except in call search (15747).
* **Loops.** A `ForRange` binder; a loop variable that is reassigned. ITER needs `path.length>0`.
* **`elabSlotReadDeliveries`' ASG branch** follows only a whole-binding rhs that is an `Ident`
  (15218). `b = a.f` and `b = cond ? a : c` are not followed.

### 2.3 `elabSlotHeldFns` / `elabSlotFlowFns` → `elabSlotHeldIn` (17463): which functions a slot can hold
* Sources:
  * set members on the decl's checked type (and on `declOrigOf`'s);
  * `elabNodeTy(o, k)` for each instance of the enclosing function — every `k`, guess keys
    included (17474);
  * path>0: `cwPathFnTargets` (functions the write index stores at the path), or for a
    call-initialised let `holeSlotCallRets` + `cwPathFnTargetsFrom`;
  * spread peers (`cwSpreadPeers`; `flow` → `elabSpreadSources` only), path[0]=="e".
* **Missing:**
  * path==[] gets set members only, with no write-index targets;
  * a param holder reads only its own type's set;
  * spreads below a field step (`["f.fs","e"]`), because the spread test is `path[0]=="e"`;
  * values handed in through arguments, returns and aliases, unless the checker's set already
    joined them.

### 2.4 `elabWrittenSlotsNote`/`elabWrittenSlotWalk` (17277/17298): lambda literal → (holder, steps)
* Recognised: element of an ArrayLit, field of an ObjLit, LETINIT, `=` assignment (`cwSlotPath`
  lhs), `x.push(lam)` (arg 0 only), `m.set(k, lam)` (arg 1).
* **Missing:** `unshift`; push with ≥2 arguments (args after the first); a returned lambda (holder
  = function result); an argument to a user function (holder = param); spread; `??`/if-arm joins;
  a named function `f` written by name (only `FuncDecl` nodes are walked, never an `Ident`
  reading one).
* It is run once at the start of `elabRun` (10182), before any instance exists.

---------------------------------------------------------------------------------------------------
## 3. The DECISION: how the closed type is chosen

### 3.1 The let rule cascade (`elabSlotFacts` 13588 / `elabSlotInstFacts` 13652)
1. **`elabBindingWholeTy(d, t, k)` (13780).** Every non-null value written WHOLE
   (`cwBindingWrittenValues`) gives the same `elabWrittenValueTy` (13907), and the constructor
   matches `t`. `elabWrittenValueTy` is itself a 3-way cascade:
   * if the value reads another holder's slot (`slotOfRead`), that holder's FACT;
   * else `elabWrittenBuiltTy` (13926), a bundle-built type through Ident/ObjLit/ArrayLit/Member/
     Index/Call;
   * else a call returning function-list literals (`elabCallRetFnListTy` → `elabRetFnListLitTy`,
     which DECIDES FROM DELIVERIES, 13995).
2. **`elabSlotCloseWhole` (14086)** for an `elabSlotWholeFn` holder. It requires:
   * an own direct-call tuple (`fnSlotCallArgsOf`), or exactly one closed annotated parameter it
     is handed to (`fnSlotAnnTyOf`);
   * every held member hole-param-only (`elabHoleParamsAll`).
   It then calls `elabHeldClosedTyAt` over the held set (joins) or the values, and checks against
   the annotation.
3. **`elabSlotClose` (14151)** otherwise:
   * TyArray: element writes `cwSlotWrittenValues(d,["[]"])` → `elabSlotCloseElems` →
     `elabHeldClosedTyAt(elem, ev, path ["e"])`. If the writes cannot be followed: program →
     `elabSlotFromSources` (14183: the facts of the source holders read, spreads, copies); an
     instance gets nothing.
   * TyMap (not a set): written values → `elabHeldClosedTyAt(mVal, path ["v"])`; an
     infer-hole key → `string`.
   * other (record, ...): `elabHeldClosedTyAt(t, [init])`.
4. Instance only: if 1–3 decline or stay open → `elabNodeTy(init, k)` (13656).
5. Program only, after the tag rounds: `elabSlotBundleFacts` (13445) retries step 1, then
   `elabSlotFromDeliveries` (13460). That one walks the type and closes each fn leaf at the ONE
   closed signature `elabSlotDeliveries` gives it, provided every set member already has an
   instance at that signature whose result agrees (`elabKeyAtPins`, so it demands nothing).

### 3.2 The structural recursion (`elabHeldClosedTyAt` 13213)
* If all values read bindings that already have agreeing facts → that fact (`elabHeldBoundTy`
  13367).
* TyFunc leaf:
  * `ds` = the set members ∪ the functions the stored values name (`elabHeldValFns`);
  * closed value types must agree (`elabHeldClosedAgree`);
  * the signature is `elabHeldFnTy` (program) or `elabHeldFnTyIn` (instance).
* TyArray requires every value to be an ArrayLit. TyObj requires every value to be an ObjLit.
  TyMap requires **no** values and uses `elabHoleMapClosed`. So at a nested level a stored NAME or
  CALL declines (-1); only the top level reads other holders.
* **`elabHeldFnTy` (12926)**, the leaf cascade (program):
  1. handed to an open param → decline;
  2. the slot's own call tuple → `elabHeldAtArgsOr` (DEMANDS instances through
     `elabResultAtParams` → `elabDemandFrom`, 18185);
  3. the members' non-guess instances agree (at the own tuple when there is one);
     `elabHeldNamedGen` for generic-holding instances;
  4. bare members are demanded at the agreed parameters, or for a lambda read through
     `elabEnclosingKeys`;
  5. uncalled → `elabHeldDeliveredFnTy` (the one delivery signature) or the D9100 `i32` default
     `elabHoleFnClosed`;
  6. called through a value at one tuple (`fnSetCallArgsOf`) → demand each member there.
* **`elabHeldFnTyIn` (13672)**, the instance version: only instances already enumerated under `k`
  (`elabKidsAt`), filtered by `k`'s own call tuple.

### 3.3 Other closed-type producers for the same slot (per spelling rather than one rule)
* **Result slot:** lists only, via `elabSlotCloseElems` (13608). Records and maps returned get no
  fact.
* **Record-of-members field:** `elabSlotRecordNote` writes `elabSlotRecFieldTy` (7336).
* **Value side, `elabHeldValTy` (17918)**, what mono reads for a literal or call value. Its own
  cascade:
  1. identity type closed;
  2. return-slot fact at the return path;
  3. the callee's result fact;
  4. `elabRetDstTy` (callers' destination, or the slot fact of the let a call initialises);
  5. `elabHeldClosedTyAt` at `k`, then at -1;
  6. `elabHeldIdTy`;
  7. then `elabHeldKeepSets`.
* **Uncalled slot:** `elabUncalledSlotTy` (17422): the one closed member type, else
  `elabHeldFnTy`, else D9100.
* **Lambda written into a slot:** `elabWrittenSlotTy` (17345) reads the holder's fact and walks
  `[]`/name steps.
* **Record-list literals per instance:** `elabHeldListFacts` (11414) writes `elabNodeReps`, not
  `elabSlotTys`.
* **Literal slot callees:** `elabLitSlotCallees` (16898; run from `elabPrepare` and again from
  `emitProgramRun`) records the call type of an open literal slot.
* **Mono decides for itself:** `monoStoredSlotFnTy` (emit_mono.vl:15935) and `monoSlotDeliveryTy`
  (emit_mono.vl:14429) pick the slot's type from `elabSlotDeliveries`/`…Omitting`/
  `elabSlotPerInstance`, with `emitFailAt` when there is none. That is a second, delivery-based
  decision made in mono, against the value-based decision in `elabSlotFacts`.

Two incompatible principles therefore coexist:
* values decide (`elabHeldClosedTyAt`, `elabBindingWholeTy`);
* deliveries decide (`elabSlotFromDeliveries`, `elabRetFnListLitTy`, `elabHeldDeliveredFnTy`,
  `monoSlotDeliveryTy`).
Which one applies depends on the spelling and the phase.

### 3.4 Storage (closure vs tag id vs singleton): a SEPARATE decision, per SET, not per slot
* A function type's set id is `elabFnSetTy[t]` (check_fn_tag_facts.vl:7). A set is tagged when
  `fnTagged[s]`. A value of type `t` is an `i32` id iff `fnTagTyIsTagged(t)` (check_fn_tag_facts.vl:13).
* The decision is `fnTagDecide`/`ftTry` (check_fn_tag.vl:342/568). It covers the whole program and
  is per set:
  * sets of two or more first, then one-member sets that follow a bigger set's join (pass 0/1);
  * escapes to closed function types become a closure (`fnCloCoerceNote`) unless the set has one
    member, a generic member or an un-annotated member (365–475).
  * It is re-run after each elaboration round (`fnTagRedecide` 541, `elabPrepare` loop,
    emit_sections.vl:7826–7841, at most `ELAB_TAG_ROUNDS`=16). Each round re-runs `elabRun`, and so
    `elabSlotFacts`.
* The per-node storage stamp is `fnTagHeldRep` (check_elab_cap.vl:3728, written by
  `fnTagHeldNote` 3734 from `fnTagRepTyOf`: a tagged leaf list becomes an `i32` list). It is
  stamped on held list literals and lets, twice per `ftTry` (check_fn_tag.vl:603–606).
* The elaboration's closed slot type is built by `mkFuncTy` (`elabHeldAtArgsOr` 13138,
  `elabHeldFnTy` 13001). It carries **no set**, so the tag information is lost. Only
  `elabHeldKeepSets` (18025; called from `elabHeldValTy` and `elabHeldListFacts`) re-attaches the
  identity type's set (D15296). `elabRetTaggedJoinTy` (17964) re-joins tagged leaves for returns.
  `elabSlotFacts` facts are NOT passed through KeepSets.
* Answer to question 3: storage is NOT a function of the slot fact. It is
  `fnTagTyIsTagged(type that still carries the set)` combined with the node stamp
  `fnTagHeldRepOf`. These are two producers (fnTag*, per set; elabSlot*, per holder) joined at
  read time by each consumer.

---------------------------------------------------------------------------------------------------
## 4. ORDER and FIXPOINT

* **Sequence inside `elabRun` (10173):**
  1. `elabWrittenSlotsNote` (10182, before any instance);
  2. reset;
  3. seed rows;
  4. many `elabSettle` rounds (10433–10558; the worklist runs `ekDone`/`elabOne` from key `k0`,
     14594);
  5. `elabHeldListFacts` (10581, may demand → settle 11452);
  6. **`elabSlotFacts` (10582)**;
  7. `elabRunKeyEnd = ekDecl.length` (10619).
* **Inside `elabSlotFacts`:**
  1. ONE pass in node-index order over every node (13575). Program-level facts are computed in
     this pass and may DEMAND instances (`elabHeldFnTy` → `elabResultAtParams`).
  2. `if ekDecl.length > n0 { elabSettle(0) }` (13621).
  3. `elabSlotInstFacts` (13622), which "demands nothing" (13628) and reads only non-guess keys.
* **Later, in `elabPrepare`** (emit_sections.vl:7811):
  1. the tag rounds (each one re-runs `elabRun`);
  2. `elabMintFacts` → … → `elabResultMembersNote` → `elabSlotRecordNote` (writes 7337, after
     `elabRun`);
  3. `elabReachRows`;
  4. **`elabSlotBundleFacts`** (7846, second chance for unfacted program holders);
  5. `elabLitSlotCallees` (7847).
* **No fixpoint over the holder/path graph:**
  * The only iterations are the global worklist settle and the tag-round loop.
  * `elabHeldBoundTy`, `elabWrittenValueTy` and `elabSlotFromSources` read `elabSlotTys` as it
    stands at that moment of the node-order pass. A holder whose source holder has a higher node
    index sees no fact. This is order-dependent; it is a mechanism read from the code, and no
    witness was run.
  * `elabSlotBundleFacts` is a single retry, and only for program holders.
  * The delivery walk is demand-driven DFS with `seen` sets and hard caps (depth 8, 32 seen, path
    8, literal depth 4). A cap truncates silently.
* **Facts that demand nothing**, i.e. that read only enumerated instances and so can only decline:
  * `elabHeldFnTyIn` (13670 comment), `elabSlotInstFacts`;
  * `elabSlotFromDeliveries` (13495, `elabKeyAtPins`, "the check mints none");
  * `elabSlotDeliveries` and its whole walk (reads `elabNodeTys`/`elabNodeCtxs`/`elabCallKeys`);
  * `elabSlotHeldFns`, `elabUncalledSlotTy` → `elabHeldFnTy` only in the uncalled branch, but
    `elabHeldFnTy` CAN demand at step 4/6;
  * `elabHeldValTy` → `elabHeldClosedTyAt(k)` → `elabHeldFnTyIn` (no demand), but its -1
    fallback calls `elabHeldFnTy` (can demand). Since it is called from mono, after
    `elabRunKeyEnd`, a demand there mints keys with no slot facts.
  * Demanding producers: `elabHeldFnTy`, `elabHeldAtArgs(Or)`, `elabHeldOwnResult`, `elabSlotClose*`
    (program), `elabHeldListFacts`.

---------------------------------------------------------------------------------------------------
## 5. FAMILIES

Counts include the main non-prefixed helpers. Lines are the sum of top-level function spans (each function runs to the next top-level `function`).

| family | fns | lines | members |
|---|---|---|---|
| A fact table read/store | 8 | 147 | elabSlotKey, elabSlotTyAt, elabSlotTyAtKey, elabTyAtPath, elabHolderSlotTy, elabSlotReadTy, elabHeldBoundTy, elabWrittenSlotTy |
| B fact passes | 5 | 164 | elabSlotFacts, elabSlotInstFacts, elabSlotBundleFacts, elabHeldListFacts, elabFnInstanced |
| C holder close rules | 21 | 697 | elabSlotClose, elabSlotCloseWhole, elabSlotCloseElems, elabSlotFromSources, elabSlotFromDeliveries, elabSlotRetElems, elabSlotOpenFn, elabSlotWholeFn, elabBindingWholeTy, elabWrittenValueTy, elabWrittenBuiltTy, elabCallBundleRetAt, elabCallRetFnListTy, elabRetFnListLitTy, elabHeldClosedTy, elabHeldClosedTyAt, elabHeldValFns, elabHeldClosedAgree, elabValsAreFns, elabWholeAtAnn, elabHoleParamsAll |
| D leaf signature (set → closed sig) | 14 | 322 | elabHeldFnTy, elabHeldFnTyIn, elabHeldDeliveredFnTy, elabHeldNamedGen, elabHeldShut, elabHeldAtArgs, elabHeldAtArgsOr, elabHeldDemands, elabHeldOwnResult, elabTopFn, elabModuleLam, elabGenAtParamCalls, elabEnclosingKeys, elabHoleFnClosed |
| E value-side close (read by mono) | 9 | 249 | elabHeldValTy, elabHeldIdTy, elabHeldKeepSets, elabRetTaggedJoinTy, elabTaggedLeavesInto, elabRetTaggedJoinAt, elabRetDstTy, elabHeldFnTyOf, elabHeldSetOf |
| F delivery walk | 30 | 1276 | elabSlotDeliveries(+At,+Into,+Omitting), elabSlotAnnRets, elabSlotPerInstance, elabSlotReadDeliveries, elabSlotClimb, elabSlotReadUp, elabSlotAliasOn, elabReadOn, elabReadDeliveries, elabReadStamps, elabReadStampsAt, elabLoopVarDeliveries, elabRetSlotOn, elabLitSlotDeliveries, elabLitSlotValues, elabLitHolders, elabLitReturnedBy, elabLitSlotAllHole, elabSlotTyOf, elabWrittenDest, elabCallDeliveryAdd, elabCallsReading, elabSlotReadKey(s), elabRetsAdd, elabTyFnFree, elabCellLitBinding |
| G call reach (one call / agreed tuple) | 18 | 560 | elabValueOnlyCall, elabSlotOnlyCall, elabValueAgreedCallTys, elabValueCallTysOpenFns, elabSlotCallTysOpenFns, elabLitSlotCallTys, elabLitSlotCallTy, elabLitSlotCallRet, elabLitSlotCallees(+At), elabLitCallResultTy, elabValueCalls, elabValueReturnsFrom, elabSlotSetCalls, elabLamParamTy(+At), elabLamInstParamTy, elabLamDeliveredParams |
| H held function sets | 8 | 172 | elabSlotHeldFns, elabSlotFlowFns, elabSlotHeldIn, elabSlotSrcFns, elabValueFnSet, elabBindingFnSet, elabSpreadSources, elabValueFnTargets (check_elab_cap:2657) |
| I uncalled | 9 | 125 | elabSlotUncalled, elabSlotUncalledOmitting, elabValueSlotNote/Copy/Reset/OmitSet/Uncalled, elabUncalledSlotTy, elabCallNamesOne |
| J written lambda / written param | 10 | 267 | elabWrittenSlotsNote, elabWrittenSlotWalk, elabWrittenLet, elabWrittenParamAlias, elabWrittenParamSources, elabWrittenAliasReadsOk, elabWrittenAliasSeed, elabWrittenRep, elabSlotValuesOk, elabSlotReadsOk |
| K record-of-members slots | 14 | 460 | elabSlotRecordNote (200 lines), elabSlotHolderOf, elabSlotValueCall, elabSlotStoreMemberNote, elabSlotHolderHolds, elabSlotNulHolderOk, elabSlotHolderOk, elabSlotHolderCalls, elabSlotRecCount, elabSlotRecDeclAt, elabSlotRecordListSigs, elabSlotFieldRecord, elabSlotRecFieldTy, elabSlotRoot |
| L value → instance keys | 20 | 387 | elabValueKeyNote(+Once), elabValueKeyAt, elabValueInstKey/Sig/From/ViaNote/Push/Up/Hand/Call/Join/Root/FieldRead/Reach, elabValueRowsAtParams, elabValueRowNote (check_elab_cap), elabLitInstTys, elabValuesResultOf, elabLitFwdTargets |
| M checker-side slot joins (check_elab_cap.vl) | 7 | 216 | elabSlotJoinTy (1603), elabSlotRecJoinTy, elabSlotRecLitGrow, elabSlotSetHolds, elabSlotRecSetHolds, elabSlotFieldClosed, elabSlotWriteList |
| N name collisions (not slot facts) | 2 | 69 | elabSlotNote/elabSlotKeys (3121: an emitted *wasm function slot* → key), elabLitBaseTy |

### Duplicates and near-duplicates (same fact, different spelling or phase)
1. **The "a value reads another holder → its fact" rule** is written three times:
   `elabHeldBoundTy` (13367), `elabWrittenValueTy`'s `slotOfRead` branch (13909) and
   `elabSlotFromSources`' loop (14244).
2. **Fact lookup with nodeSrc/own/program fallback** is written three times: `elabSlotTyAtKey`
   (13403), `elabHolderSlotTy` (17576) and the inline copy at 17588. A raw `elabSlotTys[...|-1]`
   read is also inlined at 13374 and 18129, bypassing per-instance keys.
3. **Type-structural closers over list/record/map** (each its own recursion with a different leaf
   source):
   * `elabHeldClosedTyAt` (values);
   * `elabSlotFromDeliveries` (deliveries);
   * `elabWrittenBuiltTy` (bundles);
   * `elabHeldIdTy` (identity types);
   * `elabHeldKeepSets` / `elabTaggedLeavesInto` (sets re-attached);
   * the TyArray/TyMap branches of `elabSlotClose` (14153–14177) duplicate `elabHeldClosedTyAt`'s.
4. `elabBindingWholeTy` and `elabSlotCloseWhole` both fold `cwBindingWrittenValues` for the
   whole-binding fact, with different leaf rules.
5. `elabHeldFnTy` and `elabHeldFnTyIn` are the program and instance variants of one leaf rule,
   with different evidence (the instance one never demands and has no D9100 or delivery step).
6. `elabSlotReadUp` (15302) duplicates a subset of `elabSlotClimb` (15361).
7. `elabReadOn` (path==[]) and `elabSlotAliasOn` (path>0) both dispatch on `cwIxUpKind` and differ
   in which spellings they follow (§2.2): push and set are asymmetric, and ASG into Index/Member is
   asymmetric.
8. **The one-call / one-tuple family:** `elabValueOnlyCall` vs `elabSlotOnlyCall`;
   `elabValueAgreedCallTys` / `elabValueCallTysOpenFns` / `elabSlotCallTysOpenFns` /
   `elabLitSlotCallTys`. The checker's `fnSlotCallArgsOf/At` (check_elab_cap.vl:3006) is a third
   table of the same "call tuples through slot (holder, path)" fact, keyed `holder|path/`.
9. **Returned list literals** are closed by both `elabSlotRetElems` + `elabSlotCloseElems`
   (values) and `elabRetFnListLitTy` (deliveries).
10. `elabSlotUncalled` vs `elabSlotUncalledOmitting` (17228/17247) are near-copies;
    `elabSlotHeldFns` vs `elabSlotFlowFns` differ by a boolean mode.
11. **The slot type is decided twice:** `elabSlotFacts` (values) vs mono's
    `monoStoredSlotFnTy`/`monoSlotDeliveryTy` (deliveries, emit_mono.vl:15935/14429).
12. There are at least six path walkers and three path encodings (§1.3).

---------------------------------------------------------------------------------------------------
## 6. What `slotStore(holder, path, inst)` needs that the tables lack

1. **A holder node set covering every kind:**
   * LetDecl (annotated too, since storage varies even when the type is closed);
   * Param (including lambda parameters);
   * a loop binder (ForIn e/v, plus ForRange);
   * a function result (`r`), per instance;
   * ArrayLit/ObjLit as anonymous holders;
   * capture cells and temps;
   * loop/labelled-block value carriers (`lvExitLoops`);
   * map values.
   Today only LetDecl and the FuncDecl list result have facts; Params, results and literals are
   only walked.
2. **One canonical holder id.** Collapse `nodeSrc`, `declOrigOf`, `cboxCellLits`, `cboxWriteCells`
   and `mintDeclAnchorOf` into one map. Today each reader normalises differently (§1.2), and the
   `-1` key uses the clone while the `k` key uses the source.
3. **One path encoding** (e/v/f.x/r) and one walker. Drop `[]`/name. `e` vs `v` must be decided by
   the holder's type and not tolerated as equal.
4. **Edges, as data and not as walks.** Today they are recomputed per query with caps and global
   mode flags:
   * write: init, `=`, `xs[i]=`, `o.f=`, push/unshift (all arguments), `set`, spread, writes
     through callee parameters (`cwSlotParamWrites`);
   * alias: const/unwritten `let b = a.p`, `b = a`, a joined `??`/if;
   * argument → param: every argument shape, named/spread arguments, and indirect calls through a
     function value;
   * return → call result: every return shape, records and maps too, per instance;
   * loop iter → binder;
   * callback list methods → callback param, and the result → list element;
   * same-slot copies (slice/filter/reverse/concat, both receiver and arguments);
   * capture cell `e`.
   The write side lives in check_write_scan (`cwSlotWrittenValues` and friends) and the read side
   in elab (`elabSlotDeliveries` and friends): the same graph is traversed in two directions by two
   codebases.
5. **Per-instance keys for every holder.** A program-level holder inside an instanced function
   needs a key per instance. So do results of hole-param functions (today `-1`, §1.1), params per
   instance (from `ekNames`/`ekTys`), and the mono-era keys after `elabRunKeyEnd` (today they fall
   back silently). Guess keys should be an explicit attribute, not a filter repeated at each
   reader.
6. **A fixpoint over the graph's SCCs.** It should replace the node-order single pass, the
   `elabSlotBundleFacts` retry, and the depth/seen caps that truncate silently. It must state which
   phase may DEMAND an instance (before the settle) and which only reads (after). Today
   `elabHeldValTy` can demand from mono.
7. **One decision rule with a stated precedence** between values and deliveries. Today there are
   about 8 cascades (§3.1–3.3), plus mono's own.
8. **An output that carries storage.** The answer should be {closure at sig S | tag id of set s |
   singleton member m}, plus the instance key each delivered value is built at. That means folding
   in, or reading from one place:
   * `fnTagTyIsTagged` (per set);
   * `fnTagHeldRep` (per node);
   * `elabHeldKeepSets` (set re-attach);
   * `elabValueInstKey`/`elabValueKeyAt` (value → instance);
   * `elabWrittenSlotTy` (lambda → slot).
   The table today holds a set-less `mkFuncTy`. Note also that the tag decision runs in rounds
   *around* the slot facts (emit_sections.vl:7826), so a single producer has to sit inside that
   loop or be part of it.
9. **A fact for function-valued holders whose type is already closed** but whose set may be tagged.
   Today such holders are skipped (`tyHasTyVar` gate in `elabSlotOpenFn`/`elabSlotWholeFn`).

Minor doc defects seen:
* The comment for `elabSlotInstFacts` sits above `elabFnInstanced` (13627–13630).
* "outermost last" vs "outermost first" (13389 vs 13414).
* `elabSlotNote`/`elabSlotKeys` reuse "slot" for wasm function slots.
