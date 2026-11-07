# Value returns, the uncalled-slot gates, and the `monoFlow*` read rewrite (B1, B2)

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

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
instance one taken as a value: [D4120](../inventory/D4120.md)), an
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

**B2a: the planner's binding roots are the elaboration's** (2026-11-07). `monoFlowDeclVals` reads
`mfrLitsOf`, and the let, parameter and return walkers are gone. A set holding anything but a
container is unknown, and **function roots are admitted only when the declaration's own walk reached
them through a map read** (`mfrLitsDirectFn`): that is the value the walkers' map read gave, and
dropping it lost six named programs, while a per-node mark admitted an alias of a stored function. A `.slice()` copy mono rewrote holds its minted spread literal. Over the 7,538 sweep
programs against master's fixpoint: 0 runs lost, 0 outputs moved, 16 of 16 named programs run, and
three move bytes with the same output. `hole-fn-record-relayed-to-param-field-call` (parameter `a`)
and `generic-list-sliced-called-at-two-types` (`fs`) are class-3 container widenings, and
`generic-fn-param-in-un-annotated-container` names its map-read generic by another node. The
expression walker `monoFlowValsOf`, the map and alias planners, `monoFlowElemsGen` and loop-variable
rows (D9981, which the elaboration does not derive) are B2b.

**B2b, part 1: expressions, loops and map reads** (2026-11-07). A `for … in` element variable has
literal roots: a literal iterable's elements, or every value a `let`-bound list's element slot is
written (`cwSlotWrittenValues`), pushes included. `monoFlowValsOf` reads a candidate's or loop
variable's `monoFlowDeclVals` and otherwise the elaboration's roots, with the same function rule;
`monoFlowLoopVarVals` is gone. A map read's values are the elaboration's stored roots
(`mfrLitsMapStored`). Each step graded alone on the 7,538 sweep programs against master's fixpoint:
0 moved, three times. `monoFlowMapVals` stays while it records an alias's writes (D9651), and
`monoFlowElemsGen` while its walk ties a spread to the pushed list it copies (D9482).

**B2b, part 2a: list writes and map values** (2026-11-07). What a list's owner pushes or writes into
it after its literal is `cwSlotWrittenAfter` (the writes `cwSlotWriteCount` counts, so a literal
holding a spread still answers), and a value is a push when its parent is a `.push` call; that
replaces `monoFlowPushed`, `monoFlowElemWrites` and `monoFlowOwnerReads`. `monoFlowMapVals` takes
each stored expression from `cwSlotWrittenValues`: a literal or a read naming a generic as written,
since the inert walk marks the site that writes the generic, and anything else as its elaboration
roots, which deletes `monoFlowReadElem`. The alias-write walk (D9651, D9440) stays in mono as
syntax. Each step graded alone against master's fixpoint: 0 moved, after the two fixes the first
cut needed (a push blamed on its value, not its call; a map's inert site lost to its root).

**B2b, part 2b, and what stays in mono** (2026-11-07). `monoFlowLetLeaf` and `monoFlowLetMapLeaf`
read a `let`'s initialiser and writes from `cwBindingWrittenValues` (0 moved each). That ends B2's
value derivations. What stays is class (c), and why:
- `mfrPlannedRoots` (was `mfrVals`) is planner state: `monoFlowDeclVals` fills it from the
  elaboration, and the root sweep and tie bookkeeping read only planned bindings, so it is not a cache
  of every binding's roots.
- `monoFlowAliasReadVals`, `monoFlowRetLocalLists` and `monoFlowRetUse` classify a use by syntax over
  elaboration values; `monoFlowElemsGen` reads elements and the write index and keeps the spread
  ties (D9482).
- `mfrCand` and `mfrGen` are decided by syntax, plus one elaboration fact (`fnTagListTy`, a tagged
  set's id list is no candidate); no member is added on mono's own type judgement.
- The inert walk's as-written map site stays only as long as the inert walk, which leaves with the
  inertness change to `elabSlotUncalled`.

**Inertness is the elaboration's, per slot** (2026-11-07). A slot `monoFlowReads` repointed is asked
`elabSlotUncalledOmitting(at, path, mfrRepointed)`: each read `monoFlowReadSet` rewrote and each call
through one is left out, a left-out read delivers nothing (`elabReadDeliveries`), and a slot is
called only when a read or call through it that was not left out reaches a call or an escape. A
held function's escape elsewhere (`fnEscapes`, a fact about the function) does not count: in
`closures/hole-fn-generic-map-stored-through-parameter.vl`, `id` stored into the annotated map `e`
must not make map `a`'s record slot called. Plain `elabSlotUncalled` is unchanged. This replaces
`monoValsInert` at the pushed list (D9441), the nested list (D9711) and the stored slot, and with it
the as-written inert map site no longer decides a slot.

**The reach index's inert answer is asked at query time** (2026-11-07). The five readers ask
`vrValueInert` (or `elabValueSlotUncalled`, below), and its index half is `vrInert(x, "")`
against the "mono" index. That half covers a read the index holds that the monomorphizer took as naming a generic
function when it indexed it (`vrNoteGenericCand`), and a clone copy takes its original's note.
Two facts are read as the index saw them, because a later rewrite changes them in place. A
binding's annotation is read that way: the monomorphizer annotates un-annotated bindings, and
`LetDecl` is followed only while unannotated. A template's type parameters are read that way
too: the monomorphizer strips a nested generic's type parameters, so `monoIsGenericDecl` reads
false afterwards. The monomorphizer's function slots (`monoGen`, `fnIndexOfNode`) are renumbered
once the walk ends, so they cannot be read at query time either. Before this, the answer was a
record taken at index time. Asked at query time without the annotation snapshot, 62 decisions
over 23,456 programs read lost (D10251 is one: `const xs = [id]`). With the snapshot and the
generic note, the query-time answer and the old record differ in 0 decisions.
