# One producer for a function-holding slot's storage: design note, 2026-11-14 (lane S)

Lane S; its ID block is reserved in `inventory/reserved/` and starts at D16280. This is a docs-only note: it changes no compiler code. It was
measured at master `94f5055d4`, against a fixpoint seed (two refreshes byte-identical).

It covers three things:
- an inventory of every decision made today about the storage of a function-holding slot;
- one elaboration-side producer to replace those decisions;
- a staged plan in which each stage deletes one decision family.

The coordinator checks the note before any stage starts.

## 0. The problem, measured

- **The open queue.** `inventory/ls.vl -- --status open` over both inventories lists 76
  `emit_reject` rows. Forty of them hold an un-annotated function in a place: a list element, a
  map value, a record field, a binding, a capture cell, a parameter or a result. They are listed in
  §4. All 40 re-run as filed on this seed (`check-filed-witnesses.vl --strict`: 40 graded, 40 as
  filed, provenance match). #8031 then closed D15333 and D15809, so **38 are open**.
- **Fixes add spellings.** Of the last 45 commits on master, 14 closed a row in this family, and
  every one of them added a case:
  - in `emit_mono.vl`: D16162 +23, D16200 +12, D15943 +50, D15925 +16, D16161 +24, D15941 +15, and
    D16121's containment +89;
  - in the elaboration: D15940 +35, D15920 +29, D16098 +10, D15801 +28, D16160 +27, D15136 +79.
  - Only one, D16121, deleted mono code (−89, which its own containment had added).
- **Mono decides the storage.** 112 top-level `emit_mono.vl` functions, 4,058 lines, decide or
  apply a function-holding slot's storage (§1). 39 of them are `mono*Pin*` functions.
- **The elaboration's producer is spelling-shaped too.** About 138 `elabSlot*`, `elabHeld*`,
  `elabValue*`, `elabWritten*` and `elabLit*` functions (§2) hold roughly eight separate close
  cascades. They cover two holder kinds, run one pass in node order, and use three path
  encodings.

**What the census shows** (lane K's G4 ablation, D15333/D15809). In every row the consumer
re-derives "is this delivery a holder of set *s* / of slot type *t*" from the syntax of the node in
front of it. Examples:
- `ftHoldCtxOk`'s `Call` arm took an `Ident`, a named call or a literal, never an inline `if`;
- `monoPinStoredRecords` takes a record literal, never a stored binding (D16202);
- `monoPinMapSlot` with `fld` has no uncalled arm (D16201).

The fact these consumers need is a property of a *place* and of the *flow between places*. No
table holds it, so each consumer rebuilds it locally and misses a shape.

## 1. Inventory: mono's decisions (emit_mono.vl)

This section is a read-only survey. The full table, with one row per function (line, holder,
delivery, fact, outputs, elaboration fact read, callers, D-ids), is
[`2026-11-14-slot-store-inventory-mono.md`](2026-11-14-slot-store-inventory-mono.md); the
elaboration's is [`2026-11-14-slot-store-inventory-elab.md`](2026-11-14-slot-store-inventory-elab.md).
Both were read from the code at master `498e6419`, not run.

Status vocabulary:
- **FULL**: the elaboration already has the answer, and mono only copies it into syntax.
- **PARTIAL**: mono takes the elaboration's answer and falls back to its own derivation, or
  overrides it.
- **NONE**: mono derives the answer alone.

| family | fact computed | fns | lines | `mono*Pin*` | status |
|---|---|---|---|---|---|
| F1 slot pin resolution | the closed fn type (or pin key) a slot is delivered at, and its spelling | 19 | 349 | 8 | mostly FULL: re-keys `elabSlotDeliveries` / `elabSlotAnnRets`. PARTIAL where mono's flow-rewrite omit set enters (`monoSlotDeliveryTy`, `monoFlowSlotPins`, `monoFlowHeldOneGen`) and in `monoStoredSlotFnTy`, which overrides with the values' own results |
| F2 uncalled slot | the type an uncalled slot holds its fns at; whether to stub | 5 | 145 | 0 | type FULL (`elabUncalledSlotTy`); stub decision NONE |
| F3 container-binding storage | the closed type an un-annotated list / map / record-of-containers binding or field is built at, per value shape | 15 | 1,071 | 11 | PARTIAL. `monoPinMapSlot` (265 lines), `monoPinListElems` (191) and `monoPinStoredRecords` (146) are 602 of the lines |
| F4 elab-built held value | copy the elaboration's closed record/list type onto literals and stored calls | 14 | 419 | 7 | FULL (`elabSlotTyAt`, `elabHeldValTy`, `elabSlotFieldRecord`) |
| F5 function result | the type/instance a returned fn-holding value or join is built at | 6 | 285 | 2 | PARTIAL: `elabRetTaggedJoinTy` / `elabHeldValTy`, then a flow pin, then left to emit's refusal |
| F6 delivery instancing | which instance each delivered value (generic, hole lambda, alias, choice) is | 15 | 532 | 4 | NONE or "consumes", taking F1/F3's type. PARTIAL where the call's own type is the fallback (`monoCallIfBound`, `monoCallWrittenLet`) |
| F7 read retyping | each read of a decided holder (alias, `??`, `for` variable, method and call results) takes its type | 15 | 495 | 0 | NONE: reads mono's own decision |
| F8 capture cells | a captured written `let`'s cell type | 4 | 212 | 0 | PARTIAL / NONE |
| F9 lambda / callback params | the parameter types an un-annotated lambda instance is pinned at | 7 | 311 | 6 | FULL (`elabLamDeliveredParams`) / PARTIAL |
| F10 declared / place readers | the declared type of an annotated slot under instance bindings, and of a place | 5 | 61 | 1 | NONE |
| F11 delivery enumeration | which values a slot receives (`[k]=`, `set`, `push`, re-points, whole writes), with their frames | 7 | 178 | 0 | NONE: mono's own write index |
| **all** | | **112** | **4,058** | **39** | FULL 30 · PARTIAL 29 · NONE 42 · consumes 9 · check 1 · other 1 |

**Mono's fallback sources** (where the elaboration declines, or mono overrides it):
1. the flow-rewrite tables (`mfrSetCalls`, `mfrRepointed`, `mfrSpreadDone`, `mfrSliced`, `mfrGen`);
2. the delivered values' own checker results (`monoValsOwnFnTy`, which overrides the elaboration at
   L13979 and L15981);
3. mono's own earlier synthesized `letType`, so the outcome depends on walk order;
4. the field types (D15494);
5. per-value-shape arms over the stored values;
6. the call's own type;
7. checker stamps;
8. instance substitution;
9. the template's slot (`nodeSrc`);
10. name searches;
11. leaving the value for emit to refuse.

**Mono's output channels.** This is what emit reads:
- the synthesized annotation `LetDecl.letType = synthTypeRefOfTy(t)`, at 11 write sites;
- the node type column (`nodeTyRecord`, `nodeTyRecordIn`);
- the per-instance read table `monoFieldReadTys`;
- the instance registry and in-place renames (`monoInstanceFor`, `monoRenamedFe`);
- one write-back into the elaboration (`elabValueSlotNote` from `monoUncalledSlotFnTy`);
- refusals.

## 2. Inventory: what the elaboration already has

These are partial producers for the same fact. Line numbers are in `emit_elab.vl` unless another
file is named.

**The table.**
- `elabSlotTys` maps `holder|k` to the closed type of the whole holder, and `elabSlotTyAt(holder,
  path, fnIx)` (13393) reads it.
- Writers:
  - `elabSlotFacts`, for an un-annotated `LetDecl` with an open fn leaf, key −1;
  - `elabSlotInstFacts`, the same holder once per non-guess instance;
  - the result of a non-generic `FuncDecl`, for list results only;
  - `elabSlotBundleFacts`, a retry;
  - `elabSlotRecordNote`, records of members.
- **No fact for** parameters, loop variables, annotated holders, holders whose type is already
  closed but whose set may be tagged, record or map results, or results per instance.

**Deliveries.**
- `elabSlotDeliveries` (14672, 30 functions, 1,276 lines with its walk) walks forward from a holder
  to the call signatures it is delivered at. It runs `elabSlotClimb` → `elabReadOn` /
  `elabSlotAliasOn`, which follow different spellings.
- The write side is a second traversal of the same graph, in `check_write_scan`
  (`cwSlotWrittenValues`).
- The walk truncates silently at depth 8, 32 seen, path 8 and literal depth 4.

**The decision.**
- About eight cascades, some value-led and some delivery-led:
  - the let cascade (`elabBindingWholeTy` → `elabSlotCloseWhole` → `elabSlotClose` →
    `elabSlotFromSources`);
  - `elabHeldClosedTyAt`, with `elabHeldFnTy` for the program and `elabHeldFnTyIn` for instances;
  - `elabSlotFromDeliveries`;
  - `elabUncalledSlotTy`;
  - `elabWrittenSlotTy`;
  - `elabHeldValTy`;
  - `elabRetFnListLitTy`;
  - and, beside these, mono's `monoStoredSlotFnTy` and `monoSlotDeliveryTy`.

**Storage is a second producer.**
- The tag decision (`fnTagDecide` / `ftTry`, check_fn_tag.vl:342/568) decides per set. It is re-run
  around the elaboration up to `ELAB_TAG_ROUNDS` = 16 (emit_sections.vl:7826).
- It stamps per node (`fnTagHeldRep`).
- The slot fact is a set-less `mkFuncTy`; only `elabHeldKeepSets` re-attaches the set.
- So "closure vs id" is not a function of the slot fact. Each consumer joins the two at read time.

**Order.**
- There is no fixpoint over holders. `elabSlotFacts` is one pass in node-index order, so a holder
  whose source holder has a higher index sees no fact.
- `elabHeldValTy` can demand an instance from mono, after `elabRunKeyEnd`.

**Families** (functions / lines):

| family | fns / lines |
|---|---|
| A table read | 8 / 147 |
| B passes | 5 / 164 |
| C holder close rules | 21 / 697 |
| D leaf signature | 14 / 322 |
| E value-side close | 9 / 249 |
| F delivery walk | 30 / 1,276 |
| G call reach | 18 / 560 |
| H held sets | 8 / 172 |
| I uncalled | 9 / 125 |
| J written lambda / param | 10 / 267 |
| K record-of-members | 14 / 460 |
| L value → instance keys | 20 / 387 |
| M checker-side joins (check_elab_cap.vl) | 7 / 216 |

**Duplicates of one fact.**
- "a value reads another holder's fact" ×3;
- the fact lookup with source / instance / program fallback ×3, plus 2 raw reads that bypass
  instance keys;
- six structural closers over list / record / map;
- the call tuples through a slot ×3, the third being the checker's `fnSlotCallArgsAt`;
- the slot type decided twice, by the elaboration and by mono.

## 3. The producer: `slotStore(place)`

### 3.1 Places

A **place** is `(holder, path, k)`:
- **holder**: the canonical declaration node of one of
  - a `let`, `const` or global binding (annotated or not);
  - a parameter (of a function or a lambda);
  - a loop binder (`for … of`, `for … in`, a map's key and value);
  - a function's or lambda's result (`r`);
  - a capture cell;
  - an anonymous holder: an array, record or map literal, or the join node of a value
    `if` / `match` / `??`.

  `slotHolderOf(node)` is the one normaliser. It replaces `nodeSrc`, `declOrigOf`,
  `cboxCellLits`, `cboxWriteCells` and `mintDeclAnchorOf` as readers of holder identity.
- **path**: one encoding, outermost first. `e` is a list element, `v` a map value, `f.<name>` a
  record field, `r` the result of a function-valued place. `e` and `v` are decided by the holder's
  type and never treated as equal.
- **k**: the elaboration instance key (`ekDecl` index), −1 for program scope. A holder declared
  inside an instanced function has a place per instance, so no program-level fact is ever read
  inside an instance.

Every expression node of instance `k` has one place, `placeOf(node, k)`, defined by one exhaustive
`match` over the expression kinds, with no `_` arm:
- a read of a binding is the binding's place;
- `o.f` is `placeOf(o)` + `f.f`;
- `xs[i]` is `placeOf(xs)` + `e`, or `v` for a map;
- a call is the callee instance's `r` place;
- a literal is its own holder.

### 3.2 Edges: one graph, built from the elaborated program

Edges are data. Each is computed once per instance from that instance's elaborated nodes and call
targets (`callTarget(k, call)`), not re-walked per question.

| edge | from → to | delivery spellings it covers |
|---|---|---|
| **store** | value place → destination place | initialiser, `=`, index store `xs[i] =`, field store `o.f =`, `push` / `unshift` (every argument), `m.set` / `m[k] =`, a literal's element and field |
| **spread** | `src.e` → `dst.e` | `[...a]`, a spread argument into a rest parameter |
| **copy** | `recv.e` → `result.e` | `slice`, `filter`, `concat` (receiver and arguments), `reverse`, `sort` |
| **argument** | argument place → `(param, k')` where `k' = callTarget(k, call)` | every argument shape, named and spread, direct calls and calls through a function value (the value's members' instances) |
| **return** | returned value → `(fn, r, k)`, and `(fn, r, k')` → the call node's place in the caller | every return shape and the expression-bodied tail |
| **loop** | `recv.e` / `recv.v` → binder | `for … of`, `for … in`, the map entry binders |
| **callback** | `recv.e` → the callback's parameter; the callback's `r` → `result.e` | `map`, `filter`, `forEach`, `reduce` (accumulator both ways), `flatMap`, `find` |
| **join** | each arm's value → the join node | value `if`, `match`, `??`, a labelled block's value |
| **capture** | binding → cell `e` | the capture-cell rewrite |

A **call through a place** records its argument tuple at that place: `calls(place) += argTys`. A
call through a field of a parameter is a call at `(param, f.x, k)`. This is D15431's missing
fact: `fnTagCalls` and the mint rows record no such call today.

Edges into an **annotated** place are boundaries. They record a coercion (step 5's coercion
records). They do not join storage (§3.3).

### 3.3 Storage classes: one rule

A value and the place it is stored in must agree on storage only where the place is **shared**.
- A container is a reference, so a list stored into two holders is one object, and its element
  storage is one fact.
- A function value is copied. A copy may convert (an id can become a closure), but the members
  flow through it.

So there are two kinds of edge, decided by the type at the edge's path, not by syntax:
1. **Container edges** (list, map, record, at any path): the two places are **unified**,
   recursively at every path below. This is union-find, so it is order-independent and
   near-linear.
2. **Function-leaf edges**: the source class's **members flow** into the destination class
   (members(dst) ⊇ members(src)), with a coercion record where the two decided storages differ.

Each class then holds:
- `members`: the function identities that reach it;
- `calls`: the call tuples through any place of the class;
- `bound`: the closed function type of an annotated boundary it meets, if any.

**The one decision per class**, in stated precedence: deliveries decide signatures, values decide
membership.
1. If the class has an annotated `bound`, its storage is that type's rep. Every member is
   instanced at the bound's signature (a coercion record per member).
2. Otherwise, each member `m` is instanced at each call tuple in `calls`. These are demands on the
   instance worklist, so the producer owns the instances (`callTarget` of the coercion).
3. The storage is:
   - a **singleton** when the class has one member and every escape is a direct call;
   - a **closure** of signature `S` when every call tuple agrees on `S` and the tag decision does
     not tag the class's set;
   - otherwise a **tagged set id**, with per-call dispatch to `member@tuple`. This is D3975's
     per-call-type instance record. A set id always coerces to a closure at an annotated escape,
     so no spelling here needs a refusal: the design forbids none of them.
4. A class with members and no calls takes the **uncalled rule**: each member at its default
   instance, the one `elabUncalledSlotTy` / D9100 apply today. It is stated once, not per holder
   kind.

**The output, per place:** `slotStore(place) = { ty, rep, members, instOf(member) }`.
- `ty` is the closed type, keeping its function set (so `elabHeldKeepSets` has nothing to
  re-attach).
- `rep` is `repOf(ty)` plus the tag bit.
- `instOf(member)` is the instance a delivered member is built at.

For a node, `ty(k, node) = slotStore(placeOf(node, k)).ty`. That is every read, write, element,
loop variable and result, so read retyping (F7) is nothing: a read *is* its place.

### 3.4 Order: a fixpoint inside the rounds that exist

```
elabPrepare round (the existing loop, ≤ ELAB_TAG_ROUNDS):
  elabRun → settle the worklist
  repeat:                                   -- the slot fixpoint
    add the edges of every instance settled since the last pass
    union container edges; propagate members along leaf edges (monotone, ≤ L per class)
    decide each changed class (§3.3); demand member@tuple instances not yet keyed
    settle the demanded keys (new instances add edges)
  until no class changed and no key was demanded
  fnTagRedecide reads the classes (stage 6) → another round only if a set's tag changed
```

**Termination.**
- Members only grow, and are bounded by *L*, the number of lambdas and declarations.
- Classes only merge.
- Instances are bounded by the worklist's own type-size cut (§2.3).

**When demands happen.** Every demand happens inside the fixpoint, before `elabRunKeyEnd`.
Nothing after the elaboration demands, so `elabHeldValTy`'s demand from mono goes away.

**Cost.** One edge pass per settled instance, union-find over the edges, and a member
propagation of O(edges × L) worst case (§2.3). In practice it is singletons, which converge in
one pass. This replaces:
- the 30-function delivery walk, which is re-run per query;
- the node-order single pass and its retry;
- mono's per-binding re-derivations.

It is graded by guest fuel (`plumb-shape-cost.vl`, `self-compile-time.sh`) at stage 2.

### 3.5 What "a new spelling needs no new code" means here

A new delivery spelling is either:
- an expression kind that `placeOf` maps (one arm of an exhaustive `match`, which the kind-ladder
  lint forces when a kind is added); or
- a method that moves elements, which is one row of the copy / callback table.

No holder kind, container shape, nesting depth or delivery is special-cased by the decision. The
census rows show the evidence:
- D16201: a map in a field is the place `(o, f.m.v.f.f)`, decided like `(m, v.f.f)`;
- D16202: a stored binding is a store edge like a stored literal;
- D16200: a loop variable is a loop edge;
- G4: an inline `if` argument is a join node with an argument edge.

## 4. The rows, by mechanism

These are the 38 open rows of §0, grouped by the **Mechanism paragraph each row files**. Lane S
has not ablated them. Lane B's G1–G9 numbering, which was not received in time for this note, is
to be reconciled onto this table. Group G3 (lane M, #8030) and G4 (lane K, #8031) are already
closed on master.

| group | mechanism (as filed) | rows | closes at stage |
|---|---|---|---|
| **P1** no place for the holder kind or path | the slot fact exists for a `let` but not for a field, map in a field, stored binding, cell, or a list written whole | D16201, D16202, D14401, D3851, D12230, D15392, D15357, D14437, D14782 | 2 (the decision), confirmed at 3 |
| **P2** the argument → parameter delivery is not an edge | the value handed to an un-annotated or hole parameter is instanced from the callee's own pins, not from the calls through the parameter per caller instance | D15334, D15900, D15776, D15777, D14888, D15014, D3956, D12218, D12233, D16143, D14433 | 4 |
| **P3** the result → call-site delivery is not an edge | a returned value's slot is not delivered back to the caller's reads; a returned container is built at another storage | D16077, D16079, D16130, D16131, D15753, D15755, D16136, D15923, D12454 | 5 |
| **P4** the storage is decided by node shape or per node, not per class | the tag scan and the per-node stamp see the node in front of them, not the class it is in | D15274, D15302, D15303, D15308, D16137, D16144, D15431, D16230, D16133 | 6 |

These are 9 + 11 + 9 + 9 = 38 rows. "Closes at stage" is a prediction, graded by re-running each
row's witness when its stage lands. A row that does not move is re-filed under the mechanism its
ablation then shows. It is not counted as closed.

## 5. Stages

Each stage is one PR. Each one:
- deletes more than it adds;
- lowers `scripts/pin-helper-budget-baseline.json` in the same PR;
- keeps 0 `runs → not-runs` and 0 `SILENT` on every acceptance matrix, both faces.

Deltas are estimates from the inventories' line counts, less what the new code adds. Each PR
reports the measured numbers.

The **core matrix set** runs at every stage, `--before` master's fixpoint seed and `--after` the
stage's. It has one template per holder kind and delivery:

| holder kind and delivery | template |
|---|---|
| binding and list element | `fn-list-alias` |
| index store | `fn-value-generic-list-index-written-open` |
| push | `fn-value-generic-list-pushed-same-operand-calls-at-two-types-open` |
| map value and set | `fn-map-written-two-results` |
| record field | `fn-record-field-list-written` |
| nested field | `fn-nested-record-field-list-written` |
| map in a field | `map-value-nested-record-of-hole-fn-uncalled` |
| loop variable | `hole-fn-list-loop-const-open` |
| parameter | `fn-list-written-through-param` |
| result | `hole-fn-list-returned-at-two-instances` |
| spread | `fn-value-generic-spread-copy-written` |
| capture | `captured-alias-of-hole-fn-map` |
| generic face | `fn-value-generic-map-stored-field-read-handed-open` |
| result through a hole parameter | `generic-returned-by-maker-through-hole-param` |

The baseline is in §6. The per-template readings at master `94f5055d4` (runs of graded):

| template | runs |
|---|---|
| `fn-list-alias` | 46 / 46 |
| `fn-value-generic-list-index-written-open` | 45 / 46 (the 46th is D16280's trap, filed from this reading) |
| `fn-value-generic-list-pushed-same-operand-calls-at-two-types-open` | 18 / 46 |
| `fn-map-written-two-results` | 15 / 46 |
| `fn-record-field-list-written` | 16 / 46 |
| `fn-nested-record-field-list-written` | 16 / 46 |
| `map-value-nested-record-of-hole-fn-uncalled` | 60 / 64 |
| `hole-fn-list-loop-const-open` | 25 / 64 |
| `fn-list-written-through-param` | 15 / 46 |
| `hole-fn-list-returned-at-two-instances` | 17 / 46 |
| `fn-value-generic-spread-copy-written` | 46 / 46 |
| `captured-alias-of-hole-fn-map` | 42 / 46 |
| `fn-value-generic-map-stored-field-read-handed-open` | 18 / 46 |
| `generic-returned-by-maker-through-hole-param` | 30 / 63 |

Each stage adds the templates in its rows' grading lists. Stages 2 and 7,
the two that change who decides, also run all 293 function-holding templates, alone, as a
discovery pass.

| stage | builds | deletes (mono / elab) | Δ emit_mono fns | Δ compiler lines | closes | files (for splitting across lanes) |
|---|---|---|---|---|---|---|
| **1. Places and edges** | `slotHolderOf`, `placeOf`, the edge table (§3.1–3.2) in a new `compiler/elab_place.vl`; `elabSlotDeliveries` and `elabSlotHeldFns` become queries over it | mono F11 (7 / 178); elab F delivery walk (30 / 1,276) and H held sets (8 / 172), less the shared walkers kept | −7 → 901 | about −1,000 (+550 new) | none; this is a refactor stage. Acceptance is 0 runs → not-runs and a byte-identical `regress.vl` | `elab_place.vl` (new), `emit_elab.vl`, `emit_mono.vl` F11, `check_write_scan.vl`'s slot readers |
| **2. Classes and the one decision** | union-find classes, member flow, the §3.3 rule and the fixpoint (§3.4); `elabSlotTyAt` reads `slotStore` | elab C holder close (21 / 697), D leaf signature (14 / 322), E value-side close (9 / 249), I uncalled (9 / 125); mono F1 slot pin (19 / 349) and F2's type half (3 / 90) switch to reading, then go | −22 → 879 | about −1,500 (+450) | P1 (9) | `elab_place.vl`, `emit_elab.vl`, `emit_mono.vl` F1/F2 |
| **3. Containers read the store** | mono writes the place's `ty` where F3/F4 wrote theirs: one copy function, `monoApplyPlaceStore`, until stage 7 | mono F3 container storage (15 / 1,071), F4 elab-built held (14 / 419) | −28 → 851 | about −1,450 (+40) | P1 confirmed; D16201/D16202 by construction | `emit_mono.vl` L13855–16600 |
| **4. Arguments and instances** | argument edges per caller instance; `instOf(member)` is the delivered instance; F9's parameter types are the parameter's place | mono F6 delivery instancing (15 / 532), F8 cells (4 / 212), F9 lambda params (7 / 311); elab L value → instance keys (20 / 387), G call reach (18 / 560) | −26 → 825 | about −1,800 (+200) | P2 (11) | `emit_mono.vl` L3500–5000, L19000–26500; `emit_elab.vl` L/G |
| **5. Results** | `r` places per instance, and return edges both ways | mono F5 results (6 / 285), F7 read retyping (15 / 495), F10 (5 / 61) | −26 → 799 | about −750 (+100) | P3 (9) | `emit_mono.vl` L14300–14450, L16000–16550, L24000–24600 |
| **6. The tag decision reads classes** | `ftHoldCtxOk` / `ftScan`'s shape arms become "the place's class holds set *s*"; `fnTagHeldRep` is keyed by `(place, k)`, not by node; the late round refutes a set by class (D16133's ruling, close (ii)) | `ftHoldCtxOk`'s per-shape arms, `ftInnerLit`, `ftHandedHolder`; elab J written lambda / param (10 / 267), K record-of-members (14 / 460), M checker joins (7 / 216), `elabHeldKeepSets` | about −3 | about −900 (+150) | P4 (9) | `check_fn_tag.vl`, `check_elab_cap.vl`, `emit_elab.vl` J/K |
| **7. Emit reads `ty(k, node)`** | emit's readers of a synthesized `letType` read the node's elaborated type | `monoApplyPlaceStore`, `monoFieldReadTys`, the 11 `synthTypeRefOfTy` write sites | −5 → about 794 | about −200 | none new; the family's output channel to emit is gone | `emit_classify.vl`, `emit_collect.vl`, `emit_rewrite.vl`, `emit_mono.vl` |

**Total, estimated.**
- `emit_mono.vl` loses 112 functions (908 → about 796; the shared helpers that become dead
  afterwards are counted per PR) and about 4,000 lines.
- The 39 `mono*Pin*` functions in the family go (170 → about 131).
- The compiler loses about 7,500 lines net.
- The open rows in this family go from 38 to 0, each graded by its witness.

**Splitting across lanes.**
- Stages 1 and 2 are serial: they build the producer, and it is one design. One lane, lane S,
  takes them.
- Once stage 2 lands, stages 3, 4 and 5 touch disjoint regions of `emit_mono.vl` and disjoint
  elab families. They can run in parallel, one lane each (lanes K, L, M). Each merges master in,
  not rebasing, and the conflicts are hunk-local.
- Stage 6 needs 4's argument edges and 5's return edges.
- Stage 7 needs 3–6.

**Gates, every stage.**
- fixpoint seeds on both sides;
- `scripts/rep-fuzz-check.sh`, since this is the rep layer;
- `regress.vl` (refuse on `runs → not-runs`);
- late demands from a fixpoint seed: stage 2 should *lower* them, because nothing demands after
  the run;
- `plumb-shape-cost.vl` and seed size;
- `deno task test`;
- the `sweep` label;
- `changelog.d`, a refactor note, and the core matrix set.

**Stop rules.**
- If stage 2's fixpoint costs more than +5% guest fuel on `plumb-shape-cost.vl`, the PR stops and
  reports; it does not land behind a flag.
- If a stage's predicted rows do not move, the PR says so with the witnesses' outputs and does not
  claim them.

## 6. The scoreboard

| reading | master `94f5055d4` | target |
|---|---|---|
| `emit_mono.vl` top-level functions (`pin-helper-budget-baseline.json`) | 908 | about 796 |
| `emit_mono.vl` lines | 26,879 | about 22,900 |
| `mono*Pin*` functions | 170 | about 131 |
| compiler lines (`compiler/*.vl`) | 401,987 | about 394,500 |
| open rows in this family (§4 population) | 38 | 0 |
| core matrix set, cells that run (both faces) | 409 of 697 graded, 0 `SILENT`, 1 program trap (D16280) | every cell that runs on master, plus each stage's rows' cells |
| `runs → not-runs` on any matrix or `regress.vl` | 0 | 0 |

## 7. Not claimed

- **The row grouping.** The §4 groups are read from the rows' filed Mechanism paragraphs, which
  are message-adjacent. Lane S ablated none of them. A stage that closes rows grades them by
  witness, and lane B's G numbering supersedes this one where they disagree.
- **The deltas.** Every delta is an estimate from line counts. None was prototyped.
- **The cost.** The fixpoint's cost is argued (§3.4), not measured.
- **The `.letType` readers.** Stage 7's emit readers (90 `.letType` reads in `emit_classify.vl`
  alone) were not classified by whether they read a synthesized annotation or a written one. The
  stage's first task is that census.
