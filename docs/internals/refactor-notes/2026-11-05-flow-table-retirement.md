# Retiring the flow table, reader by reader

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.3 on 2026-11-07; its `§` references are to that file.

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
elaboration: no call reads its callee from the slot as the slot (`fnSlotThroughCalls`, the
checker's per-slot call index, where a const element read naming one function does not count), no call goes through the set its type carries (`elabSlotSetCalls`), no closed delivery
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
