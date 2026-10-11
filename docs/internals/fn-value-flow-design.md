# Function-value flow — one table instead of per-position pins

Status: **design for review, no code.** Lane SC, 2026-10-11, measured on master `20fa382fe`.

## The problem in one paragraph

A generic function or a hole (un-annotated) lambda used as a VALUE needs an instance at
the signature it is eventually called at. Today that decision is made late, in emit, by
whichever `monoWalk` arm meets the value, and each arm handles a different position: let,
const, alias, list element, map value, record field, capture cell, if-expr, return,
argument. Each review of #3498–#3517 found the same defect in a position no arm covered,
and the fix added one more arm. This doc proposes one analysis, built once, keyed by
resolved binding identity, which the emitter only reads. A position with no table entry
refuses loudly.

## (a) Inventory of what exists, measured

The function set is the transitive callees of `monoWalk`'s function-value arms, the
post-walk passes in `monomorphize`, and the function-value helpers instancing calls. Generic
arena and string utilities are excluded. The census was derived by call graph and is
reproducible from `compiler/emit_mono.vl`.

| group | functions | lines | can fail loudly |
| --- | ---: | ---: | ---: |
| A. walk side: coercion, delivery, alias, cell | 94 | 1,947 | 8 |
| B. post-walk passes: peer pins, sig conflict, prune, cell retype | 52 | 1,374 | 2 (+1 driver `emitFail`) |
| C. instancing side: callbacks, lambdas inside instances, name lists | 47 | ~1,538 | 0 |
| **total** | **193** | **~4,860** (33% of `emit_mono.vl`) | **10 functions + 2 indirect paths** |

What the census says, as facts and not impressions:

- **181 of 193 decline silently.** On a shape they don't recognise, they return -1, "",
  false or 0, and the caller goes on with the hole's default signature. One example is
  `monoCoerceFnValueName`, the central coercion (18 callers). It returns 0 for a value that
  is a Member read, a Call result, an inline lambda literal, a map value, or any Index that
  is not a cell read `x[0]`. It has no `match` arm.
- **About 20 functions key a binding by bare name,** across frames:
  - `monoNameIsAssigned`, a whole-arena scan, whose own comment says a homonym in another
    frame answers true;
  - the write table `monoLetWrites`, keyed `"n:"+name` / `"c:"+name`;
  - `monoNamesUsedAsValue` (whole arena), `monoFnBindsParam`, `monoListOnlyCalled`,
    `monoLamCallByName`, `monoNameWrittenLive`, and the per-instance name lists
    (`monoInstLamNames`, `monoCollectLamDecls`, `monoInstGenAliasNames`);
  - `monoCellReadName`, which recognises `ident[0]` purely by syntax.

  About 25 more resolve a name through `monoLetFrameOf` (`identLetOfAt` +
  `sidOfNode`). The rest key by node or slot.
- **Three hop caps that disagree.** `monoLetFrameOf`, `monoCapturedLamFe`,
  `monoRespellLamAlias`, `monoNoteBindSig` and `monoWriteNamesLam` stop at 8 frames or
  hops. `MONO_ALIAS_CHAIN_MAX` is 64 for `monoAliasChainLamFe`, `monoGenFnAliasChainFe`
  and `monoAliasChainWritten`. A chain of 9 to 64 links resolves in some helpers and falls
  through in others.
- **There is no analysis phase.** `monomorphize` indexes `=` writes by name, walks, and
  then runs seven fix-up passes. Instancing is decided at call and delivery sites during
  the walk:
  1. peer-pin rounds (up to `nDecl`);
  2. checked-type pins for unpinned lambdas;
  3. unused-value prune;
  4. `monoBindingSigConflict` (6 fail sites);
  5. `monoRetypeLamCells`, run twice;
  6. `monoLamStoredAsElement`;
  7. the dead and stub loop.
- **Shared state** is 20 globals:
  - name-keyed: `monoLetWrites` and the `monoCgc*` name lists;
  - node-keyed: `monoBindCallSigs`, `monoCellCoercedSig`, `monoHoleLamSlots` and others;
  - `monoLastInstFe`, a side channel read immediately after a mint.

**What each becomes.** Group A's coercion and delivery helpers become READS of the table
(`fnFlowSigAt(node, inst)`) and are deleted with their positions. Group B's peer pins,
`monoBindingSigConflict`, `monoAssignedPeerFe`, `monoInitPeerFe` and the
`monoLetWrites` table are retired: the table's class merge is exactly what they
approximate. `monoRetypeLamCells` and `monoLamStoredAsElement` read the class signature.
Group C mostly stays. Callback baking, lambda cloning inside an instance and template
ledgers are instancing MECHANICS, not flow decisions. Their name lists
(`monoLamCallByName`, `monoInstLamNames`) switch to binding ids. Names of the retired set
are listed per step in (f), so the review can check each step deletes what it claims.

## (b) Where the table is built, and binding identity

**Identity: a binding is its declaring node index.** No resolved identity survives the
checker in compile mode today:
- `sid` is an interned NAME;
- the checker resolves by name plus scope depth (`declare` / `lookup`, typecheck.vl);
- emit re-resolves by `(sid, atIx)` through `identLetOfAt`, `parentLetReadAt` and
  `bodyLetReadAtSid`, which return LetDecls only. A parameter resolves to a name.

The LSP already has the right shape: `symOccDecl` in `check_state.vl`, "a binding is its
declaring node index". It is fed from the five declaration arms (FuncDecl, Param, LetDecl,
ForRange, ForIn) and the Ident read arm, but it is gated on `symEnabled`, which is 0 when
compiling, and keyed by token. Step 0 makes that resolution unconditional and records it in
a node column `identDeclIx: i32[]`, sized like `nodeTyIx`:
- It is written in the Ident arm, which also covers write targets, with forward references
  settled by the existing `symPend*` / `symFlushPending`.
- It is written again under `inferQuiet` re-checks, which must write the same value. Step 0
  asserts this.
- Mono's statement-spine clones keep their Ident nodes, so reads stay resolved.
- The LetDecls that `monoCloneBodyRaw` synthesises (`mkLet`) get `declOrig[clone] = orig`.
  `recordClonedNodeTy*` is the precedent.
- A rewrite-synthesised node with no column entry is UNKNOWN and refuses under (c). It
  never falls back to a name.

**Where: the checker, as a post-`checkProgram` pass over the typed arena.**
- **The checker owns the facts the table needs.** It has the resolved bindings above, the
  checked type of every expression, and the per-call type arguments, which
  `checkCallOnFuncTy` holds as locals `bNames`/`bTys` and today discards. Only
  `nodeTyIx[call]` persists, so mono re-derives instances from argument types. The pass
  banks them.
- **Ruling C (2026-10-10) already put the typing half there.** `fsbMark` / `fsbNoteStore`
  / `fsbRefuse` decide in the checker that a generic-seeded `let` stays generic and refuse
  a concrete write. The table is the same fact carried to emit.
- **A refusal the table owes is a CHECK error.** It needs the table at check time; D4010
  and D3975 are that refusal.
- A pre-emit pass in `emit_mono.vl` would have none of these facts without re-deriving
  them, and re-deriving them is today's defect.

**What the table holds.**

*Slots.* A slot is a binding id (let, const, param, capture cell, module global). Derived
slots hang off it: `elem(s)` for a list, `val(s)` for a map, `field(s, name)` for a
record, and `ret(fn)` for a function's return.

*Flow edges* unify slots in a union-find. The edges are:
- an initialiser, `x = e`, a const or let alias, and a capture (same slot, by identity);
- an element store, a list literal element, `.push`, and `.set`;
- a record literal field;
- each arm of an if-expr, `match` or `??`;
- a return or tail value.

Inside one function, union-find makes every alias chain O(α), so the hop caps disappear.

*Generic boundaries are not unified.* A generic callee's parameter and return slots are
instanced per call (a summary instantiated at the call's banked type arguments), so two
calls of `id<T>` do not merge their arguments' classes. A recursive generic runs its
summary to a fixpoint over the same lattice.

*Per class,* the table records:
- **sources:** each generic FuncDecl and each hole-lambda node written into the class;
- **pins:** the signature of each call through any member, and of each delivery into a
  concretely fn-typed slot (a parameter, an annotated binding, a callback).
  - A pin inside a generic body may mention the enclosing type parameters. It is stored
    symbolically and substituted per enclosing instance, so `fnFlowSigAt(node, inst)` is a
    pure read.
- **TOP:** set when a member reaches a position the pass does not model.

**Pins decide instances; ruling C decides the representation.** Under ruling C a generic
`let` keeps its generic type, so `k(1); k("s")` through one written binding is legal. The
current one-signature-per-binding rule (`monoBindingSigConflict`) refuses it at emit.
- **Zero pins:** no instance is needed.
- **One pin:** the slot's rep is today's funcref or closure, so its output is
  byte-identical.
- **Two or more pins:** the rep is an *instance record* with one closure per pin, in pin
  order. A write of source `g` stores `{g<P1>, …, g<Pn>}`, built over one shared closure
  environment. A call at pin `Pi` reads field `i`.
  - This is sound because the program is closed: every pin of a class is known before
    emit.
  - The rep change is confined to multi-pin classes, which today are emit refusals or
    silent cells. Under the d3960 matrix below, no multi-pin written cell runs on master.

  This is the one open decision for review. The alternative keeps the refusal, which
  leaves ruling C's written multi-type case a standing clause-2 gap.

## (c) The refusal rule

The rule is one sentence: **a function-valued expression the emitter must lower is looked
up in the table by `(node, enclosing instance)`; no entry, or an entry whose class is TOP
and has an open source, is an `emitFail` naming the position.** There is never a fall
through to the hole's default signature.

- **One literal, one funnel.** The literal is "function value at <position> has no flow
  entry". All of today's 181 silent declines funnel into it, so it is a single row in
  `scripts/capability-probes/live-sites.json` and the instruments count it.
- **Two classes of refusal:**
  - A TOP class with only CONCRETE sources is not refused: nothing needs instancing.
  - A class whose pins conflict with a source's own typing is the checker's (D4010 /
    D3975 / D3923), and is reported there with both positions named. That one is DESIGN.
    The emit refusal is CAPABILITY by construction (clause 2) and must be rare. The
    migration measures its count at every step.
- **No decline paths.** Every reader is written as a `_`-less `match` over the slot kinds,
  per the kind-ladder rule, so a new position is a compile-time hole, not a silent default.

## (d) Rows it closes, graded on master `20fa382fe` today

All 57 family rows graded by `check-filed-witnesses --strict` on master: **56 as filed,
1 moved** (D4010 grades `trap_loads` on master; it was filed `silent_invalid_wasm`
against #3517's tree). unfiled: D4010 unfiled: D4011 unfiled: D4012 unfiled: D4013
unfiled: D4014 unfiled: D4015 unfiled: D4016 — these rows are filed on #3517's branch and
reach master with it.

The attribution below is a prediction, graded at the step named. A row that does not move
at its step is re-ablated, not re-attributed.

| step | rows | outcome on master |
| --- | --- | --- |
| 2 identity, not name | D2114, D2479, D3910, D3911, D3924, D3957, D4011, D4016 | silent 5 (invalid wasm 3, trap 1, wrong value 1); emit reject 3 |
| 3 let / const / alias / written | D3297, D3384, D3858, D3873, D3904, D3906, D3926, D3941, D3942, D3943, D3961, D3962, D3964, D3965, D3976, D4013, D4014, D4015 | silent 12 (invalid wasm 6, trap 3, wrong value 3); emit reject 6 |
| 4 list / map / field / union | D2484, D3165, D3166, D3934, D3935, D3944, D3947, D3978, D4012 | silent 6 (invalid wasm 1, trap 3, wrong value 2); emit reject 3 |
| 5 capture cells | D3851, D3857, D3868, D3952, D3953, D3954, D3955, D3956, D3958, D3959, D3970, D3971, D3973, D3974 | silent 5 (trap 3, wrong value 1, invalid wasm 1); emit reject 9 |
| 7 checker refusal (DESIGN) | D3923, D3975, D4010 | silent 2 (invalid wasm 1, trap 1); emit reject 1 |
| adjacent, not claimed | D1482 (`.map` producing closures), D2735, D3822, D3933 | emit reject 4 |

Two pairs are duplicates and should fold:
- D4013 is D3941: a written let with an if-expr of generics.
- D4014 is D3965: an alias of a written generic let.

D3961, D3962 and D3964 close with #3517 itself.

**The matrix baseline** is `d3960_let_of_generic_written.py`, 451 cells, on master:

| outcome | cells |
| --- | ---: |
| runs | 73 |
| loud check (legal by the oracle) | 86 |
| loud check (oracle says ill-typed) | 211 |
| loud emit | 13 |
| **silent** (42 trap, 26 invalid wasm) | **68** |

- The 81 `*_match` "clause-2" check refusals are ruling C's DESIGN refusal; the oracle
  predates the ruling and is to be updated before step 1.
- The family that matters is a generic-seeded binding written with another generic
  (`gen|alias|hole × generic`, 99 cells). Of those, **18 run, 68 are silent and 13 refuse
  at emit.**
  - Every module-scope cell in it is silent.
  - No `pair` cell (two call types through one written binding) runs.
  - The unwritten `pair` cells all run.

## (e) Cost

Measured on a guest profile of the self-compile (21,509 samples, `guest-profile.sh`):

- **Check side vs emit.** `checkProgram` is 29.6% of the run and `emitProgram` 64.9%.
- **Today's mono function-value machinery is 0.33% inclusive** (any `mono*` frame on the
  stack). The compiler source holds about 12 generic functions and few hole lambdas, so the
  self-compile barely exercises this code, and retiring it buys the self-compile nothing
  measurable.
- **The new pass is one walk over the arena** plus near-linear union-find, and it is
  GATED: skipped entirely when the program has no generic FuncDecl read as a value and no
  hole lambda. That is the same gate `monomorphize` already applies ("any generic, or
  `monoHasConcreteHOFParam`").
- **The identity column** is one `i32` per node: 1.0–1.7 MB on the self-compile arena of
  257k–423k nodes. The plumb-shape RSS bar is +10% of 296 MB.

**Budget the steps must hold:**
- self-compile guest fuel within its 1.5× ratchet, and no worse than ±1% at step 0
  (baseline 54,350,416,863);
- plumb-shape fuel within +5% of 8,063,154,591 (tail 5,854,853,494);
- seed size within +3% of 4,773,370.

Retiring ~4,860 lines of emit_mono.vl for a pass estimated at under a third of that
should SHRINK the seed. That is a prediction, read at each step with `seed-size.vl --check`.

`cwFrameWalk` (1.95%) and `crReadHook` (2.78%) are the checker's name-rooted
written-binding walks. With `identDeclIx` they could key by identity too. That is noted,
not claimed, and is out of scope.

## (f) Migration, in landable steps

Every step keeps every running program running. Each step is graded A/B against the
previous seed on:
- the d3960 matrix (oracle updated for ruling C);
- `d3909_fnvalue_positions.py` and `d3929_binding_of_generic.py`;
- the rv3484–rv3517 witness corpora in `~/.claude/vl-tools/witnesses/`;
- gen..gen5;
- `scripts/rep-fuzz-check.sh` and `scripts/mono-tyaram-grid.sh`;
- `regress.py` (0 runs lost);
- the family rows above via `check-filed-witnesses --strict`.

A step lands only with 0 `runs → not-runs` and 0 new silent cells.

0. **Identity column.** `identDeclIx` and `declOrig`, unconditional symbol resolution, and
   an `inferQuiet` agreement assert. Nothing reads them yet. The seed must be
   byte-identical apart from the column's own code, and fuel within ±1%.
1. **The table, in shadow mode.** Build it, and at every point where mono decides an
   instance today, compare that decision with the table's. Disagreements are counted, not
   acted on. The per-position disagreement histogram is the step's deliverable and tells
   steps 2–5 where the existing arms are wrong.
2. **Identity replaces name** in write detection and the name lists:
   - `monoNameIsAssigned`, `monoLetWrites` (+`Extend`, `AreLams`), `monoFnBindsParam`,
     `monoNameIsParamOnChain`, `monoNamesUsedAsValue`, `monoCellReadName`,
     `monoLamCallByName`, `monoInstLamNames` / `monoCollectLamDecls` /
     `monoInstGenAliasNames`.

   Closes the shadowing rows.
3. **Bindings read the table:** let, const, alias, written let, if/match/`??` arms, return,
   and the multi-pin instance record.
   - Retires `monoCoerceWrittenLet`, `monoCoerceLetValues`, the alias-chain set
     (`monoAliasChainLamFe`, `monoGenFnAliasChainFe`, `monoAliasChainWritten`,
     `monoRespellLamAlias`), the peer pins (`monoPinLamFromPeer`, `monoAssignedPeerFe`,
     `monoInitPeerFe`, `monoTargetPeerFe`), `monoBindingSigConflict` and the `monoSig*`
     meet helpers.
   - The instance record is the step's rep change, so it runs rep-fuzz in full.
4. **Lists, maps, record fields, unions.**
   - Retires the `monoList*` set, `monoPinGenericList`, `monoNotePushDeliveries`,
     `monoStore*AnnName` and the ObjLit/ArrayLit arms of `monoCoerceFnValueName`.
5. **Capture cells.**
   - Retires `monoCellValueTake*`, `monoCellSeed*`, `monoCoerceWrittenCell`,
     `monoAliasCellRead`, `monoCellCall`, `monoRetypeLamCells` and the cell-fail helpers.
6. **Refusal.** The remaining fall-throughs in `monoCoerceFnValueName` / `monoInstanceFor`
   become the (c) literal, and `live-sites.json` gains its row. The shadow comparison is
   deleted.
7. **Checker refusal.** The checker re-checks each source at its class's pins and refuses
   an ill-typed delivery with both positions named (D4010, D3975, D3923). This step can
   move ahead of 3 if review prefers: it depends only on step 1.

Steps 2–5 are each independently revertible, because the table runs beside the code it
replaces until the step that deletes it.
