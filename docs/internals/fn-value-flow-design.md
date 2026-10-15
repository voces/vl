# Function-value flow — one table instead of per-position pins

Status: **design for review, no code.** Lane SC, 2026-10-11. Measured on master `20fa382fe`
and re-graded on `5d4cd14dc`. Revisions 2 and 3 answer the #3531 review. What changed is listed at
the end.

## The problem in one paragraph

When a generic function or a hole (un-annotated) lambda is used as a VALUE, it needs an
instance at the signature it is eventually called at. Today emit makes that decision late,
in whichever `monoWalk` arm meets the value, and each arm handles a different position.
Each review of #3498–#3517 found the same defect at a position no arm covered, and each fix
added one more arm. This doc proposes one analysis, keyed by resolved binding identity and
built once, which the emitter only reads. It is staged so that no program that runs today
stops running (§(c), the keep-running list), and every step is measured in shadow before it
acts. The one rep decision, the multi-pin *instance record*, is split out as its own
decision step (§(g)).

## (a) Inventory of what exists, measured

The function set is the transitive callees of three things: `monoWalk`'s function-value
arms, the post-walk passes in `monomorphize`, and the function-value helpers that instance
calls. Generic arena and string utilities are excluded. The census comes from the call
graph and can be re-derived from `compiler/emit_mono.vl`.

| group | functions | lines | can fail loudly |
| --- | ---: | ---: | ---: |
| A. walk side: coercion, delivery, alias, cell | 94 | 1,947 | 8 |
| B. post-walk passes: peer pins, sig conflict, prune, cell retype | 52 | 1,374 | 2 (+1 driver `emitFail`) |
| C. instancing side: callbacks, lambdas inside instances, name lists | 47 | ~1,538 | 0 |
| **total** | **193** | **~4,860** (33% of `emit_mono.vl`) | **10 functions + 2 indirect paths** |

The census establishes these facts:

- **181 of the 193 functions decline silently.** On a shape they don't recognise they return
  -1, "", false or 0, and the caller carries on with the hole's default signature. The
  central coercion, `monoCoerceFnValueName`, has 15 call references. It returns 0 for a value
  that is a Member read, a Call result, an inline lambda literal or a map value, and for any
  Index that is not a cell read `x[0]`. It has no `match` arm.
- **About 20 functions key a binding by bare name, across frames:**
  - `monoNameIsAssigned` scans the whole arena, and its own comment says a homonym in
    another frame answers true.
  - The write table `monoLetWrites` is keyed `"n:"+name` / `"c:"+name`.
  - `monoNamesUsedAsValue` (whole arena), `monoFnBindsParam`, `monoListOnlyCalled`,
    `monoLamCallByName`, `monoNameWrittenLive`, and the per-instance name lists
    (`monoInstLamNames`, `monoCollectLamDecls`, `monoInstGenAliasNames`).
  - `monoCellReadName` recognises `ident[0]` by syntax alone.

  About 25 more resolve a name through `monoLetFrameOf` (`identLetOfAt` + `sidOfNode`). The
  rest key by node or by slot.
- **Four hop caps, which disagree with each other:**

  | cap | helpers |
  | --- | --- |
  | 4 | `monoAliasedParam` |
  | 8 | `monoLetFrameOf`, `monoCapturedLamFe`, `monoListLeaf`, `monoNoteBindSig`, `monoRespellLamAlias`, `monoWriteNamesLam` |
  | 16 | `monoNameShadowedAt`, `monoRetReadsHoleParam` |
  | 64 (`MONO_ALIAS_CHAIN_MAX`) | `monoAliasChainLamFe`, `monoAliasCellRead`, `monoCellValueTakeAt`, `monoInstGenAliasNames`, `monoLamValueFe` |

  A chain of 5 to 64 links resolves in some helpers and falls through in others.
- **There is no analysis phase.** `monomorphize` indexes `=` writes by name, walks the
  program, and then runs seven fix-up passes. Instancing is decided at call and delivery
  sites during the walk. The fix-up passes are:
  1. peer-pin rounds (up to `nDecl`);
  2. checked-type pins for unpinned lambdas;
  3. unused-value prune;
  4. `monoBindingSigConflict` (6 fail sites);
  5. `monoRetypeLamCells`, run twice;
  6. `monoLamStoredAsElement`;
  7. the dead and stub loop.
- **Shared state is 20 globals:**
  - name-keyed: `monoLetWrites` and the `monoCgc*` name lists;
  - node-keyed: `monoBindCallSigs`, `monoCellCoercedSig`, `monoHoleLamSlots` and others;
  - `monoLastInstFe`, a side channel read immediately after a mint.

**What each group becomes:**

- **Group A.** The coercion and delivery helpers become READS of the table,
  `fnFlowSigAt(node, inst)`, and are deleted along with their positions.
- **Group B.** Group B is retired in two steps.
  - **Step 3** retires the peer pins (`monoPinLamFromPeer`, `monoAssignedPeerFe`,
    `monoInitPeerFe`, `monoTargetPeerFe`), and step 2 retires the `monoLetWrites` table. The
    table's class merge is exactly what they approximate.
  - **Step 6** retires `monoBindingSigConflict`. Its 6 fail sites become the (c) literal's
    multi-pin form, which is decided by the table's class, not by re-deriving a binding's
    signatures (§(e), "Pins decide instances"). Until step 6 it stays, and it fires only on
    a class the table also calls multi-pin. Shadow mode checks that agreement from step 1
    on.
  - **Step 8** decides whether that refusal becomes the instance record (§(g)).
- **Group C** mostly stays. Callback baking, lambda cloning inside an instance and the
  template ledgers are instancing MECHANICS, not flow decisions. Their name lists switch to
  binding ids.

§(f) names the retired set at each step.

## (b) Binding identity, and how it survives the rewrites

### Identity: a binding is its declaring node index

No resolved identity survives the checker in compile mode today:

- `sid` is an interned NAME.
- The checker resolves by name plus scope depth (`declare` / `lookup`).
- Emit re-resolves by `(sid, atIx)` through `identLetOfAt`, `parentLetReadAt` and
  `bodyLetReadAtSid`, which return LetDecls only, so a parameter resolves to a name.

The LSP already has the right shape. In `check_state.vl`, `symOccDecl` treats a binding as
its declaring node index. It is fed from the five declaration arms (FuncDecl, Param,
LetDecl, ForRange, ForIn) and from the Ident read arm. It is gated on `symEnabled`, which is
0 when compiling, and keyed by token.

Step 0 makes that resolution unconditional and records it in a node column,
`identDeclIx: i32[]`, sized like `nodeTyIx`. The Ident arm writes it, and that arm also
covers write targets. Forward references are settled by the existing `symPend*` /
`symFlushPending`.

### Which write is the answer: the final pass's last write, never an agreement

The checker walks the program several times, and two kinds of walk write the column.

- **Quiet probes** run under `inferQuiet` (11 sites set it) or a probe flag:
  `paramSolveProbe`, `inferReturnsPrePass`, `globalInitPrePass`, and the `cstrProbe*` walk.
  A probe can resolve a name in a partial scope, so its write is not evidence.
  Revision 1 proposed asserting that every pass agrees. **That assertion is dropped.** The
  column is cleared in `initChecker` and holds whatever the last full pass wrote.
- **Full passes:** `checkProgram` runs `checkProgramPass`, then `checkProgramAgain` up to
  `LBI_MAX_PASSES` times, once for each round of:
  - literal-binding pins;
  - record adoptions;
  - `expParamInfer`;
  - and, with #3516, `wsApplyPending`, which rewrites a declared record parameter into a
    type parameter and re-checks.

  `checkProgramAgain` calls `initChecker`, which empties every module table. The column is
  one of those tables, so the last pass to run is the only writer whose answer survives.
  #3516's rewrite adds TypeParam nodes and does not move a declaration, so a binding's id
  is stable across it. Where a re-check changes which declaration an Ident resolves to,
  the last pass's answer is the right one by construction.

### Identity across the eleven pre-mono rewrites

The checker runs before the emitter's pass table. Eleven passes then mutate the arena before
`monomorphize` reads it. A node they create has no column entry. Under revision 1's rule (c),
such a node would be UNKNOWN and refused. **That would turn the five running programs m01–m05
into refusals.** Each one reaches mono only through a node a rewrite minted.

Ident-creating sites per pass (call-graph grep over `emit_rewrite.vl` / `emit_collect.vl`):

| pass | `mkIdent` | `mkLet` | in-place rename | `addNode` | what it mints |
| --- | ---: | ---: | ---: | ---: | --- |
| `loopValueRewrite` | 4 | 1 | 0 | 1 | `$lv<x>` for a loop's value, the loop moved to a fresh node |
| `nulScalarSplit` | 4 | 2 | 0 | 0 | `$np<n>` / `$nv<n>` for a split nullable scalar |
| `foldMemShared` | 0 | 0 | 0 | 0 | none |
| `shadowRespell` | 1 | 1 | 2 | 0 | renames a captured binding to `name$s<n>` in place, adds seed lets |
| `assignValueSpill` | 2 | 1 | 0 | 0 | a spill local for an assignment's value |
| `dispatchRewrite` | 7 | 1 | 0 | 0 | dispatch temporaries, bare blocks to `if true` |
| `captureBoxRewrite` | 6 | 2 | 0 | 0 | `name$cb` cells (`cboxSeedLet`); every boxed read becomes a NEW `Index(Ident(cell), 0)` (`cboxWalk`) |
| `synthRetAnnots`, `synthNulListRetAnns`, `synthDstPinAnns`, `scanArrLitCommit` | 0 | 0 | 0 | 0 | type annotations only |

That is 35 sites in six passes. The grep is the starting list, not the proof. The proof is
the audit below.

**The rule: identity is propagated at the creation site, and the table is still built in
the checker.** Identity changes in exactly three ways after the checker. Each has one entry
point, and nothing else writes the column.

1. **A minted node stands for an existing binding:** `identFrom(new, old)`. It copies
   `identDeclIx[old]`. For a minted DECLARATION it also sets `declOrig[new] = oldDecl`.
2. **A minted node stands for a binding that has no old node to copy from:**
   `identFromDecl(new, declIx)`. `cboxSeedLet` and `cboxStoreBack` are the two sites. Each
   builds a fresh `Ident(name$cb)` or `Ident(name)` from a NAME. `cboxStoreBack(name)` takes
   only the name today, so step 0 adds the declaration index to its signature. The
   declaration is the `for` node that `captureBoxRewrite` is lowering, and
   `cboxContStoreBack` threads it to the `continue` sites.
3. **A node is RENAMED in place, so its name now refers to a different binding:**
   `sidNoteNodeName(ix, declIx)`. Every in-place rename already calls
   `sidNoteNodeName(ix)` (`symbols.vl`, R4), which invalidates the interned-name cache
   (21 call references in six files). Step 0 gives it a second argument, the declaration the
   new name refers to, and makes it the single place a rename updates identity.
   - A caller that cannot name the declaration passes -1, and the audit counts that node as
     unresolved. A rename therefore cannot leave a stale entry: it updates the column or
     the audit fires.
   - A rename that keeps the binding passes the node's own current entry. That is
     `shadowRespell`'s `name$s<n>`.
   - A rename that CHANGES the binding passes the new declaration. `extvRespellIn`'s
     `nm$extv` is one: the read now names the forwarding FuncDecl `<name>$extv`, not the
     extern. It passes that FuncDecl, which becomes the read's class source.

**The creation sites, before and after mono:**

- **Pre-mono rewrites,** from the table above:
  - **In-place renames:** `shadowRespell`'s 2, through `sidNoteNodeName(ix, declIx)`.
  - **`cboxWalk`'s cell read:** the new `Index` and its inner `Ident(cell)` take the
    replaced Ident's entry (`identFrom`). A boxed `let` keeps its own LetDecl, so the cell
    read resolves to it unchanged.
  - **`cboxSeedLet`'s `name$cb`:** the cell of a boxed parameter or loop variable. It gets
    `declOrig = the parameter` (`identFromDecl`), so the cell's reads and writes join the
    parameter's class. This is m02's shape, and x01's parameter alias.
  - **`cboxStoreBack`'s write-back:** `identFromDecl` to the declaration it stores to.
  - **Fresh temporaries with no source binding** (`$lv`, `$np`/`$nv`, spill and dispatch
    locals) are their own declarations. A temporary that carries a function value gets a
    flow edge from the expression it was initialised from, which `identFrom` also records
    (`flowFrom[new] = oldExpr`).
- **Mono itself** mints 11 `mkIdent`, 7 `mkLet` and 5 `mkParam` in `emit_mono.vl`, and renames
  in place in five functions:
  - `monoRenameGenAliasInit`;
  - `monoMakeInstanceGo` and `monoSpecializeConcrete` (`cal.identName = …`);
  - `monoLamCallByName`;
  - `monoRespellToLam` (was `monoRespellLamAlias`).

  The rules:
  - **An instance's Param** gets `declOrig[instParam] = templateParam`.
    - A read on a cloned statement spine resolves to the instance Param.
    - A LEAF Ident is shared between the template body and every instance (§ "Leaf lambdas
      shared across instances"). It keeps the TEMPLATE Param in `identDeclIx`, and it maps
      to the instance Param through `(node, inst)`: the instance's `declOrig` inverse,
      `instParamOf(templateParam, inst)`. So two instances of one generic never share a
      parameter slot, although they share the leaf node.
    - **The audit cannot catch a dropped `(node, inst)` mapping.** The leaf still has an
      entry, the template's, so it counts as resolved. A dropped mapping shows up instead as
      a wrong class at run time. The keep-running list's m-programs (m01–m05, which capture
      and write through instance bodies) are the guard, run at every step.
  - **An instance's LetDecl** (`monoCloneBodyRaw`'s `mkLet`) gets `declOrig[clone] = orig`.
    `recordClonedNodeTy*` is the precedent.
  - **A callee respelled to an instance name** (`cal.identName = instName`) passes the
    instance FuncDecl to `sidNoteNodeName`.
- **Post-mono synthesis** also mints nodes, after the point where revision 2's audit ran:
  - `synthVoidTwins` builds a twin FuncDecl with fresh `mkParam`s and argument
    `mkIdent`s. Each twin Param gets `declOrig = the original's Param`, and each argument
    Ident is `identFromDecl` to its twin Param.
  - `synthExternValues` mints `<name>$extv` and renames reads to it (`extvRespellIn`).

**Why not build the table after the rewrites instead.** That gives up the check-time half:
a refusal the table owes (D4010, D3975, D3923, step 7) has to be a CHECK error, and only
the checker can raise one. It also does not remove the propagation work, because emit reads
the table by node, and the nodes it reads are the rewritten ones.

**The audit is the guard. It counts every Ident, in every position, and it runs after the
LAST arena-mutating pass.**

- **When it runs.** The audit runs after the post-mono synthesis passes (`synthVoidTwins`,
  `synthExternValues`, `synthParamAnnots`, the `synthCapture*` passes), before any emitter
  reads a function body.
- **What it counts.** It walks every Ident reachable from the program's statements and
  counts those with no entry. That includes callees, write targets, captures and operands,
  not only function-value positions. The count is broken down by kind of position and by
  the pass that minted the node (a node id above the checker's arena length names its
  minting pass through an arena watermark recorded per pass).
- **When step 0 lands.** **Step 0 does not land until that count is 0 over tests/cases, the
  distilled corpus, the d3960 matrix and the keep-running list.**
- **The audit has a control that must fire.**
  - Step 0's test suite builds a seed with ONE `identFrom` call removed: `cboxWalk`'s cell
    read.
  - It asserts that the count on m02 and m04 rises above 0, attributed to
    `captureBoxRewrite`.
  - It repeats the check with `sidNoteNodeName`'s new argument forced to -1 at
    `monoMakeInstanceGo`, where the count must rise on i05.

  An audit that reads 0 on a tree where a site was deliberately broken is measuring
  nothing. The control is how the 0 means something.
- **Later rewrites.** A rewrite added later that forgets `identFrom` shows up in the same
  count, so the guard outlives step 0.
- **D3993** (on #3516) belongs to the same hazard class. A rewrite changed a
  node's kids, and a later reader indexed the old shape. That is a reason to audit the
  rewritten tree rather than trust the creation list.

### Leaf lambdas shared across instances

A mono instance shares its leaf expression nodes with the generic body (survey L1;
`emit_classify.vl` says "the checker-recorded type is the generic's"). So a hole lambda
inside a generic body is one node for every instance. Its flow entry is keyed by
`(node, inst)`:

- The pins of the lambda's class may mention the enclosing type parameters. They are
  stored symbolically and substituted per instance, so `fnFlowSigAt(node, inst)` is a pure
  read.
- A leaf Ident inside the lambda that reads an enclosing parameter resolves the same way:
  the column holds the template Param, and `(node, inst)` maps it to the instance's Param
  (§ "The creation sites").
- `inst` is the instance key. Until the survey's L1(b) lands, it is the instance's
  FuncDecl clone index, the `fe` mono already mints. Afterwards it is L1's tuple of type
  ids, and nothing in the table changes except the key's type.

## (c) The refusal rule, and the programs it must not touch

The rule fits in one sentence: **when the emitter must lower a function-valued expression,
it looks the expression up by `(node, enclosing instance)`; no entry, or an entry whose
class is TOP and has an open source, is an `emitFail` naming the position.** It never falls
through to the hole's default signature.

- **One literal, one funnel.** The literal is "function value at <position> has no flow
  entry". The 181 silent declines all funnel into it, so it is one row in
  `scripts/capability-probes/live-sites.json` and the instruments count it.
- **Two classes of refusal.**
  - A TOP class with only CONCRETE sources is not refused, because nothing needs
    instancing.
  - A class whose pins conflict with a source's own typing is the checker's (step 7),
    reported there with both positions named. That one is DESIGN. The emit refusal is
    CAPABILITY by construction (clause 2), must be rare, and is counted at every step.
- **No decline paths.** Every reader is a `_`-less `match` over the slot kinds, so a new
  position is a compile-time hole rather than a silent default.
- **The rule is armed last** (step 6), after shadow mode (step 1) has shown a count of 0
  UNKNOWN over the keep-running list.

**Keep-running list.** Each program runs today on master `5d4cd14dc` and must run, printing
the same output, after every step. Witnesses are in `~/.claude/vl-tools/witnesses/rv3531/`.

| program | what it exercises | prints |
| --- | --- | --- |
| m01 | `let f = id`, captured by `g`, then `f = k` | `K 1` |
| m02 | a parameter cell: `f` written inside `run` after a closure captured it | `C 2` |
| m03 | a hole lambda captured, then the binding rewritten with another lambda | `2 3` |
| m04 | the write inside a closure, the call outside | `I 3 I true` |
| m05 | `shadowRespell`: an inner `const f` shadows the parameter `f` | `I 10` |
| x01 | `fs[0] = inner` inside a callee, through a list parameter | `I true` |
| i05 | an unwritten generic `let` called at two types | `1 s` |
| u01 | an alias of an unwritten generic `const`, each called at a different type | `1 s` |
| u04 | an unwritten hole lambda `const` called at two types | `1 s` |
| f01, f02 | one un-annotated `ap` (a hole lambda; a function) applied to `dbl` and to `up` | `6 s!` |
| f03 | `id` delivered to an annotated `apply` at `i32`, and aliased and called at `string` | `6 4 z` |
| i01, i09 | `==` on function values (concrete, and two bindings of `id`) | `true`; `true 1 s` |
| p05, p07, p10 | record field write, nullable slot, map-index write of a generic | `9`; `4`; `2` |
| c02, c04, c06, c08, c08b, c08c | the concrete controls of p02, p04, p06, p08 | as today |

Two programs that do NOT run today, and that the interim rule keeps as they are:

- **w01:** `let f = id; f = id`, called at two types. It is an emit reject today. It is a
  WRITTEN class with two pins, so it stays refused, and §(g) decides it.
- **w02:** `let f = id; f(1); f = dbl`. It is a check reject under ruling C, which makes it
  DESIGN, and it is unchanged.

The d3960 matrix's 99 `runs` cells are on the list too, along with every `tests/cases`
fixture. `regress.py` covers the corpus.

## (d) Who owns the typing half: the checker, and the gap ruling C left

Revision 1 said that ruling C had already put the typing half in the checker. **That is
true for calls and false for deliveries.**

- Under ruling C (`fsbMark` / `fsbNoteStore` / `fsbRefuse`), a generic-seeded `let` stays
  generic and a concrete write to it is refused.
- #3508 (lane CK, `fsbRecheckCalls`) re-asks each written function's constraints at
  every call through such a binding.
- **A delivery is not covered.** `const h = id; call2(h, h)` is refused by `vl check`,
  with `call2`'s parameters at `(i32) => i32` and `(string) => string`, and so are i08 and
  i08c. The first delivery into a concrete parameter binds the binding's type variables.
  `call2(id, id)` runs, and so does a call through `h` placed before the delivery. Filed as
  **D4017** (#3533), clause 2. It grades the same with #3508 applied.

**Ownership.** D4017 belongs to lane CK, as #3508's follow-up. Its fix is the table's own
notion of a pin, applied in the checker: a delivery into a concretely function-typed slot
adds a pin to the binding's class and does not bind the binding's type variables. If CK
records that pin in the shared store (§(h)) and not in a private table, then step 1 reads
D4017's fix instead of re-deriving it.

## (e) What the table holds

### Slots

A slot is a binding id: a let, const, param, capture cell or module global. Derived slots
hang off it: `elem(s)` for a list, `val(s)` for a map, `field(s, name)` for a record, the
function-typed `arm(s, k)` of a union, and `ret(fn)` for a function's return.

### The complete position list

Each position is an EDGE (it unifies two slots), a PIN (it fixes a signature on a class) or
a READ (it asks for the class's signature at a node). The outcome column is master
`5d4cd14dc`, with each witness run verbatim.

| position | kind | witness | outcome today |
| --- | --- | --- | --- |
| initialiser, `x = e`, const/let alias, capture | edge | m01, m04, D3961 | runs / traps (D3961) |
| element store, list literal element, `.push`, `.set` | edge | x01, D4012 | runs / wrong value |
| spread `[...fs]` | edge, elem to elem | p03 | emit reject |
| `for f in fs` | edge, elem to loop binding | p02 | emit reject |
| map-index write `m[k] = f`, map read | edge, val | p10 | runs |
| record literal field, field write `r.f = g` | edge, field | p05 | runs |
| `?.` member read | edge, field to the nullable result | p09 | emit reject (`?.` has no rep for a closure leaf) |
| nullable slot `F \| null`, `!= null` narrowing | edge, same slot | p07 | runs |
| union slot `F \| i32`, `is` narrowing | edge, `arm(s, k)` | p08, D3944 | traps |
| `as?` / `as!` to a function arm | read at the arm | concrete control | emit reject for ANY function arm (**D4018**, #3533), not this design's |
| if-expr, `match` expression, `??`, labelled-block `break @B v` | edge, each arm to the result | D3941, p12, p04 | traps / emit reject / emit reject |
| return and tail value | edge to `ret(fn)` | i06, p11 | emit reject |
| parameter default `= id` | pin at the parameter's type | p01 | check reject: defaults must be a literal or a module `const` (DESIGN, out of scope) |
| call through a slot | pin | i05 | runs |
| delivery into a concretely typed slot | pin | i08, D4017 | check reject |
| `==` on function values | read of the source identity | i01, i09 | runs |
| argument to a non-generic callee with an un-annotated parameter | interprocedural edge, §(e) below | p06, x02, x03 | emit reject |
| argument to a generic callee | interprocedural, instanced per call | x04 | emit reject |

### Flow edges cross functions, so the table is a fixpoint

Revision 1 used union-find within each function and treated generic boundaries as
per-call summaries. That misses every position where the class crosses a function boundary
with no type annotation to cut it:

- **Higher-order calls through an un-annotated parameter.** In p06, `(f, x) => f(x)` is
  applied to `id`. In p11 the value is returned from a generic `pick`. In i06, a
  non-generic `mk()` returns `id`.
- **Module globals written from another function**, as in D3961's i07 spelling.
- **Writes back through a callee:**
  - through a parameter alias: x01 (runs today), x02 (a record field);
  - through a returned closure: x03 (`mk` returns `{set, call}` over a captured `k`);
  - through a generic parameter: x04 (`w<T>(fs: T[], g: T) { fs[0] = g }`).

  In each of these, the callee's body adds an edge between two of its CALLER's slots.

**The shape.** Each function gets a summary: the edges its body induces among its boundary
slots (parameters and their derived slots, `ret`, and the module globals it touches). The
summary is computed by union-find over the body, with callee summaries applied at each
call. Summaries are iterated to a fixpoint in reverse topological order of the call graph's
strongly connected components:

- **A generic name is a SOURCE, not a slot.** Each read of `id` starts its own class. In
  f03, `apply(id, 4)` and `const g = id` are two classes with one pin each (`i32` and
  `string`). They are not one class with two pins.
- **An annotated function-typed parameter is a PIN on the argument's class, never an
  edge.** It cuts the class at the boundary. In f03, `apply(f: (x: i32) => i32)` pins its
  argument and does not join it with any other caller's argument.
- **Context sensitivity: a callee is summarised once per INSTANCE, never once per
  declaration.** These callees are instanced per call today, and the table keeps that:
  - a generic function;
  - a function whose parameter is un-annotated (f02's `function ap(f, x)`);
  - a hole lambda (f01's `const ap = (f, x) => f(x)`).

  Their summary is instantiated at the call's instance key: the banked type arguments for
  a generic (§(h)), and the argument types at the hole positions for the other two. Their
  parameters are per-instance slots.
  - So f01 and f02, which apply one `ap` to `dbl` at `i32` and to `up` at `string`, are two
    instances with one class each, and both keep running. A context-insensitive summary
    would merge `f`'s class across the two calls into one class with two sources and two
    pins, which the rule below refuses. That is why the insensitive version is wrong.
  - Two calls of `id<T>` likewise never merge their arguments' classes, while x04's
    `fs[0] = g` still joins `elem(fs)` with `g` in the caller.
- **A fully annotated non-generic callee** has one instance, so its summary is applied once
  per call, as edges between the call's argument and result classes. Its function-typed
  parameters are pins, as above.
- **A closure value carries the summary of its lambda.** A call through a class applies the
  summaries of all the class's sources (x03).

Module globals are slots of the module frame, so a write from any function is an edge on
the same slot.

**Cost, restated.**

- **Per round.** Union-find over one body is near-linear in its nodes.
- **Rounds.** The fixpoint re-runs a strongly connected component only when a callee's
  summary GROWS, and a summary grows only by a class merge among its boundary slots. So the
  worst case is about **O(N × merges)**: N is the node count of the function-value-bearing
  bodies, and merges is the number of summary-growing merges. A chain of k higher-order
  functions, each forwarding its function parameter to the next, is the shape that
  realises it. One merge at the tail re-runs every link above it.
- **What it replaces.** Today's whole-arena scans per name (`monoNameIsAssigned`,
  `monoNamesUsedAsValue`) are O(N) per name asked.
- **The gate.** The pass is GATED by the gate `monomorphize` already applies ("any generic,
  or `monoHasConcreteHOFParam`"). It also skips a function whose body touches no
  function-typed slot.

**No existing cost row bounds this pass, because none of them runs it.**

- The self-compile has **0** generic functions, so it skips the pass entirely. Its fuel
  ratchet and its 0.33% `mono*` share say nothing about the new code. Revision 2 claimed
  "about 12 generics", which was wrong.
- The two plumb-shape units (`scripts/perf/gen-plumb-shape.vl`) are concrete `i64` code
  with no generics, no hole lambdas and no function values, so they skip it too.

The bound is therefore a NEW `tests/vl_scaling_shape_test.ts` compile pair, `fn-flow`,
graded on the guest-fuel ratio like the rest. Its "many" arm is a chain of 64 higher-order
functions with un-annotated function parameters, each forwarding to the next, plus a
mutually recursive pair (one SCC) that writes the forwarded value into a module global. Its
"one" arm does the same calls and writes from one function. It lands at step 1, when the
pass first runs, with the bar set from that measurement. It has a control that must red: a
fixpoint that re-runs every function on every merge.

### Per class, the table records

- **sources:** each generic FuncDecl and each hole-lambda node written into the class;
- **writes:** whether any member is the target of a write after its initialiser (`=`, an
  element or field store, a write through a callee summary);
- **pins:** the signature of each call through any member, and of each delivery into a
  concretely function-typed slot (a parameter, an annotated binding, a callback, a union arm
  annotated with a function type);
- **TOP:** set when a member reaches a position the pass does not model. Shadow mode lists
  each TOP by position (§(f), step 1).

### Pins decide instances

- **Zero pins:** no instance is needed.
- **One pin:** the slot's rep is today's funcref or closure, and the output is
  byte-identical. This holds for any number of sources: m01 writes `k` over `id` and calls
  once, and it runs.
- **Two or more pins, one source, no writes:** each READ gets the instance at its own pin.
  The class's single source is known at every read, so no value has to carry more than one
  instance. This is what runs today:
  - i05: an unwritten generic `let` called at `i32` and `string`;
  - u01: `const g = f` over `const f = id`, called through each;
  - u04: `const h = (x) => x` called at two types.

  It must keep running. The same rule makes two programs RUN that are emit refusals today,
  and it claims them at step 4:
  - **u02**, `const fs = [id]` called through `fs[0]` at two types ("a list holding a
    generic function is called through its elements at more than one type");
  - **u03**, `const r = { f: id }` called through `r.f` at two types ("a function-value
    call has no interned signature").

  Neither is filed yet.
- **Two or more pins with two or more sources, or a WRITTEN class with two or more pins:**
  this is the multi-pin case, because a value read at a pin may be any of the sources. Its
  rep is a separate decision, §(g). Until §(g) is decided it is refused with the (c)
  literal's multi-pin form, "a function value at <position> is called at <n> signatures
  and may hold <m> functions". i02 is the witness.

## (f) Migration, in landable steps

Every step keeps the keep-running list running. Each step is graded A/B against the
previous seed on:

- the d3960 oracle, then `scripts/capability-probes/generic-let-written-grid.py` (#3532, deleted in #3645;
  567 cells, ruling C);
- `d3909_fnvalue_positions.py` and `d3929_binding_of_generic.py`;
- the rv3484–rv3531 witness corpora;
- gen..gen5;
- `scripts/rep-fuzz-check.sh` and `scripts/mono-tyaram-grid.sh`;
- `regress.py` (0 runs lost);
- the family rows in (j), with `check-filed-witnesses --strict`.

A step lands only with 0 `runs → not-runs` and 0 new silent cells.

**Steps:**

0. **Identity column.**
   - Adds `identDeclIx` and `declOrig` and makes symbol resolution unconditional.
   - Adds `identFrom` / `identFromDecl` at the pre-mono, mono and post-mono creation sites,
     and gives `sidNoteNodeName` its declaration argument at all of its call sites.
   - Adds the audit, which runs after the last arena-mutating pass, counts every Ident, and
     must reach 0. It ships with its must-fire controls (§(b)).
   - Nothing reads the column yet.
   - The seed is byte-identical apart from the column's own code, and fuel is within ±1%.
1. **The table, in shadow mode.** Build it from the shared store (§(h)). Shadow mode logs
   three things, per position kind:
   - **agree / disagree**, at every point where mono decides an instance today;
   - **undecided**: every function-valued node in a flow position that mono passes through
     WITHOUT deciding, so it lowers at the hole's default. These are the 181 silent
     declines, seen from the outside. A shadow that compared only mono's decisions would
     be blind to exactly the positions that fail silently;
   - **TOP and UNKNOWN**, with the position that set them;
   - **multi-pin agreement**: each class the table calls multi-pin against each
     `monoBindingSigConflict` firing, in both directions.

   The `fn-flow` scaling pair (§(e)) lands with this step, because this is the first step
   where the pass runs.

   The histogram is the step's deliverable. Over the d3960 grid and the witness corpora,
   every silent cell must appear as a disagreement or as undecided. A silent cell the
   shadow does not flag is a hole in the table, and it is fixed before step 2.
2. **Identity replaces name** in write detection and in the name lists:
   - `monoNameIsAssigned`, `monoLetWrites` (+`Extend`, `AreLams`), `monoFnBindsParam`,
     `monoNameIsParamOnChain`, `monoNamesUsedAsValue`, `monoCellReadName`,
     `monoLamCallByName`, and `monoInstLamNames` / `monoCollectLamDecls` /
     `monoInstGenAliasNames`.

   This step closes the shadowing rows. It landed with `monoNameIsParamOnChain`,
   `monoNamesUsedAsValue`, `monoCellReadName`, `monoLamCallByName`, the
   `monoInstLamNames` set and `monoLetWrites` still keyed by name, because no witness
   separates them yet; they carry to step 3. D3957 is not a naming defect and moved to
   step 3.
3. **Bindings read the table:** let, const, alias, written let, if/match/`??`/labelled-break
   arms, and return.
   - Retires `monoCoerceWrittenLet`, `monoCoerceLetValues`, the alias-chain set
     (`monoAliasChainLamFe`, `monoGenFnAliasChainFe`, `monoAliasChainWritten`,
     `monoRespellLamAlias`), and the peer pins (`monoPinLamFromPeer`,
     `monoAssignedPeerFe`, `monoInitPeerFe`, `monoTargetPeerFe`).
   - First PR: a write to a function-valued `let` or capture cell is instanced at the
     binding's type as each instance spells it, and an `if` expression whose arms all name
     generics counts as naming generics. It closes D3941, D3953, D3954, D3957, D3958 and
     D4013, turns seven of D3939's `rv3498` refusals (a cell a shared closure writes with a
     generic) into runs, and files D4305–D4308. It retires nothing yet: the coercions it
     adds are the ones the table's let slot will own.
   - Second PR: the retirements, tried by deletion. Each site was replaced with its
     no-answer stub (`-1`, `false`, an empty list) and graded on the outputs of 15,331 files
     (tests/cases, the distilled cells and named). Nothing could be deleted. The table is
     still shadow-only (`ffMode` 0), so no site has a reader to hand its answer to, and
     each one still decides at least one fixture. The stubs moved the files shown below:

     | site | files moved | runs lost | a witness that needs it |
     | --- | --- | --- | --- |
     | `monoPinLamFromPeer` | 5 | 3 | retired by the third PR |
     | `monoAssignedPeerFe` | 3 | 2 | retired by the third PR |
     | `monoInitPeerFe` | 2 | 2 | retired by the third PR |
     | `monoTargetPeerFe` | 3 | 2 | retired by the third PR |
     | `monoCoerceWrittenLet` | 22 | 2 | closures/written-let-of-generics-called-after-another-instance |
     | `monoCoerceWrittenCell` | 36 | 20 | closures/captured-cell-shared-writer-alias |
     | `monoAliasChainLamFe` | 19 | 13 | closures/hole-lambda-alias-mutate-then-read |
     | `monoGenFnAliasChainFe` | 8 | 3 | generics/alias-chain-of-generic-function |
     | `monoAliasChainWritten` | 4 | 0, wrong values | closures/hole-lambda-let-alias-after-write (`aC` for `aE`) |
     | `monoRespellLamAlias` | 4 | 2 | closures/hole-lambda-binding-one-signature |
     | `monoCallWrittenLet` | 5 | 1 | closures/written-let-called-at-string-literal-union-and-string |
     | `monoCapturedLamFe` | 5 | 2 | generics/hole-lambda-calls-per-instance |
     | `monoNameIsParamOnChain` | 3 | 3 | closures/captured-cell-written-parameter-of-t |
     | `monoNamesUsedAsValue` | 704 | 151 | functions/value-flow-mono-module-scope |
     | `monoInstLamNames` + `monoInstGenAliasNames` | 15 | 7 | closures/captured-lambda-alias-call |
     | `monoLamCallByName` | 6 | 0, same values | larger modules: it is a direct-call rename, not a decision |
     | `monoCellTyIsOpen` gate | 2 | 2 | closures/capture-by-reference |

     These sites retire when the let and cell slots become the deciding reader. Until then,
     deleting one costs the fixture in the last column. One name-keyed lookup did move:
     `monoCellFnTyNameAt` finds its cell by `identDeclOf` on the read, not `monoLetFrameOf`
     on the name, and the outputs are byte-identical on all 15,331 files. Its open-type gate
     stays, because capture-by-reference needs it.
   - Third PR: the peer pins are retired. `monomorphize` builds the table whenever a hole
     lambda is generic, armed or not, and `fnFlowLamPin` answers a lambda whose class also
     holds another function: the one pin every call through the class agrees on. A lambda
     with no peer, a class with two pins, or one walked inside a generic gets no answer and
     keeps its old path. `monoPinLamFromPeer`, `monoAssignedPeerFe`, `monoInitPeerFe` and
     `monoTargetPeerFe` are deleted, and the round loop with them: a class already spans the
     chain the rounds walked. Over the same 15,331 files, three moved. One is a fix:
     `closures/hole-lambda-user-list-reassigned` (`d = [c]`, then `d = [e]`) was a loud
     refusal and now prints `aC aE`. Two keep their output and emit smaller modules, because
     a class the table calls multi-pin leaves the lambda at its own instance. The shadow's
     disagreement rows fell from 1,512 to 1,501 and none was added. Without the peer
     condition the table also answered lambdas inside annotated closure results, and six
     fixtures trapped on an indirect call, so the condition stays until the let slot owns
     those.
   - Fourth PR: the let slot answers two alias-chain questions by declaration identity.
     The table records, per declaration, the binding its initializer reads (`ffDeclFrom`)
     and whether an `=` writes it (`ffDeclWr`). `fnFlowReadWritten` replaces
     `monoAliasChainWritten`, and `fnFlowReadGenFn` replaces `monoGenFnAliasChainFe` at all
     four of its callers. Both are deleted. `monomorphize` now builds the table whenever a
     generic exists, and one generic's calls mint at most 64 contexts, so a generic that calls
     itself at a larger type (D2721) still reaches its refusal. Over 15,334 files nothing
     moved. `monoAliasChainLamFe`, `monoRespellLamAlias` and `monoCoerceWrittenLet` stay:
     they name a lambda as the instance frame spells it, and a cloned read resolves to the
     template's declaration, so the slot also needs a frame-copy answer first. The
     annotated-closure-result condition is not touched.
   - Fifth PR: the frame-copy answer, and the three name walks retire. The table records,
     per original declaration, the `LetDecl` it walked, the function declaring it, and the
     `=` writes of the binding and of its capture cell (`d[0] = v`). `fnFlowAliasLam`,
     `fnFlowCellLam` and `fnFlowRespellLam` answer a chain by declaration and return the
     template's declaration; `monoDeclCopyIn` finds the instance's copy of it in the frame
     or an enclosing one (`declOrigOf`). `fnFlowDeclWritten` asks whether that binding,
     not any binding of its name, is written. `monoAliasChainLamFe`, `monoLetAliasLamFe`,
     `monoRespellLamAlias` and `monoCoerceWrittenLet` are deleted, with
     `monoLetWritesAreLams` and `monoValueFnTyConcrete`; the written-let guard moved into
     `monoCoerceLetValues`. The table is built whenever the pass runs. Over 15,100 files
     nothing moved.
   - Sixth PR: the pass's write index is keyed by declaration. `monoLetWrites`, keyed by
     `n:`/`c:` plus a name, becomes `monoDeclWrites` and `monoCellWrites`, keyed by the
     write target's source declaration (`monoDeclCanon` of `identDeclOf`). Every reader asks
     by declaration: `monoCoerceLetValues`, `monoCallWrittenLet`, `monoWrittenGenLetFrame`,
     `monoWritesCoercedFirstCall` and `monoCoerceWrittenCell` take the read and find the
     binding's frame copy (`monoReadLetFrame`), and lose their name parameter.
     `monoLetWrittenAt` becomes `monoLetWrittenIn`, `monoNameWrittenLive` becomes
     `monoLetWrittenLive`, and `monoCapturedLamFe` reads the callee's declaration instead of
     walking frames by name. Over 15,100 files one module moved, with the same output:
     `closures/hole-lambda-binding-one-signature`, whose last function was compiled
     differently because other functions in the file wrote a binding of the same name.
     Renaming that binding gives the old compiler the new module. `monoLetFrameOf` still has
     21 callers, and the annotated-closure-result condition is not touched.
   - Seventh PR: the capture-cell path and the other readers of `monoLetFrameOf` find a
     binding by declaration (`monoReadLetFrame`). `monoRetypeCell` and `monoCellReadsIn`
     take the cell's declaration and match a read `d[0]` by `identDeclOf` rather than by
     its name. `monoCellSeed*`,
     `monoAliasCellRead`, `monoWriteSourceBind`, `monoWriteNamesLam`, `monoNoteBind*` and
     eight more lose their name parameter. `monoBodyDeclCopy` indexes each body once per
     arena stamp, since a per-read body walk made the pass quadratic in reads. The peer
     condition on `fnFlowLamPin` is deleted: `monoPinLamFromFlow` already keeps the
     checker's signature for a concretely typed lambda, and that covers the lambdas inside
     annotated closure results. Over 15,100 files nothing moved. One caller of
     `monoLetFrameOf` stays, `monoRespellToLam`: it asks whether a name, written at the
     call, reads the binding, which is a question about spelling.
   - Eighth PR: the respell stops renaming to the binding's name. `monoRespellLamFe` finds
     the binding by declaration (`fnFlowRespellLam`, `monoDeclFrameIn`). For a lambda that
     captures nothing, it renames the callee to the lifted function's own name, which no
     binding can shadow. A capturing lambda keeps its spelling and is instanced through the
     answer. With no name left to check, `monoLetFrameOf` is deleted. Over 15,100 files five
     modules moved, all with the same output, all in `closures/`:
     `alias-call-in-function-rebinding-lambda-name`, `binding-copied-through-uncalled-chain`,
     `captured-lambda-alias-call`, `hole-lambda-binding-one-signature` and
     `module-alias-call-beside-local-shadow`. Where the old respell declined on a shadowed
     name, the call went through `call_indirect` or `call_ref`. It is now a direct call to
     the instance. In `captured-lambda-alias-call`, the closures no longer capture the
     renamed binding. `monoCoerceLetValues` still picks the pin from the first read rather
     than from the let slot.
   - Ninth PR: `monoCoerceLetValues` is split by job, and its `n:`/`c:` key goes.
     `monoCoerceWrittenLetValues` records the written `let`'s signature and instances the
     generics its initializer and writes name. `monoCoerceWrittenCell` takes and retypes a
     capture cell's seed and writes. `monoLetWriteFrame` is the one walk both use to find the
     live writes. Neither half reads its pin from the let slot yet. In shadow over
     `tests/cases`, a pin read from the class disagreed with the recorded signature in 25
     files, 7 of them running fixtures. The class is an undirected union: the
     lambda copied into a binding and the other bindings it reaches share its class, so a
     call through any of them pins the binding (`closures/delivered-alias-pins-written-lambda`
     calls `e` at `string` directly while `d` is held at `i32`). The let slot can decide the
     pin once its pins are the ones the binding's value flows to, not every pin in the class.
   - Tenth PR: the table records direction, and a written `let` with one directed pin is
     held at it. Beside the class, each slot keeps the slots its value flows to and the pins
     taken at it. A directed site (an initializer, `=`, a return, an argument, a list or
     record element) adds one edge, source to destination; `??`, `if` and `match` flow both
     arms into a fresh slot. `fnFlowLetPinSig` follows the edges from the `let`'s slot and
     returns its one closed pin, "" for none, `FF_PIN_MANY` for two that differ, and
     `FF_PIN_DECLINE` for a binding walked in more than one context.
     `monoCoerceWrittenLetValues` takes the pin when it matches the read's signature, and
     otherwise keeps `monoCellSigRecord`. The 55 files that reach that site (54 in
     `tests/cases`, one named corpus cell) hold 101 records. Against the record, the
     undirected class pin disagreed in 21 files, 14 of them running fixtures. The directed
     pin disagrees in 9 and agrees in every file where it is single. Of the 9, 7 are
     `FF_PIN_MANY`: the four `written-let-…-string-literal-union-and-string` and
     `…-mixed-union` fixtures, whose record is a `monoSigJoin` of two pins, and three error
     fixtures that refuse elsewhere. The other 2 are generics walked in two contexts.
     Each decline was lifted alone over the 55 files and six probes. Refusing at
     `FF_PIN_MANY` lost 4 runs (the join fixtures) and changed 3 refusals, so it stays. A
     union of the contexts' pins for `FF_PIN_DECLINE`, keeping the binding unrecorded for "",
     and refusing a single pin that differs from the read each moved nothing, and nothing
     witnesses them. Over the 55 files the switch moved nothing. The record still decides
     the join: it is order-based, and a join over the directed pins is the next step.
   - Eleventh PR: the join is read from the directed pins, and `monoCellSigRecord` is
     deleted. `fnFlowLetPinSigs` (now `fnFlowDeclPathPinSigs`) returns every distinct closed
     pin the `let`'s value flows to. Each slot also keeps the context that walked it, so a binding walked in two
     contexts answers for the context whose instance the read's frame stands for
     (`monoFrameInstTmpl`, the same fit `fnFlowLamPin` uses), and declines only when no
     context fits. `monoLetPinTake` folds the pins with `monoSigJoin`. The join must be one
     of the pins, pins that differ join only when the delivery returns nothing, and only
     the binding's own call may arrive at a list the join widens. It answers coerce, keep
     or refuse, and the answer does not depend on which delivery comes first. The four
     cell sites that also called the record (`monoCellValueTakeAt`) never joined, so they
     keep an equality check, `monoCellSigOne`. Over 15,110 files four moved. Three are
     refusals that now name the written binding: the reassigned binding refuses at its
     first delivery, so the `APPEND`-rung message and the copy's message no longer fire
     first. The fourth, `written-let-copied-called-at-string-then-mixed-union`, prints the
     same. D4300 moves from a trap to a loud emit reject, because its one pin is not the
     call's widened argument type. No corpus cell moved.
4. **Lists, maps, record fields, unions, spread, for-in, `?.`.**
   - Retires the `monoList*` set, `monoPinGenericList`, `monoNotePushDeliveries`,
     `monoStore*AnnName` and the ObjLit/ArrayLit arms of `monoCoerceFnValueName`.
   - Claims u02 (a list element) and u03 (a record field) under the single-source rule:
     emit refusals today, `runs` after.
   - First PR: u02 and u03 run, and the decision is the table's. `fnFlowDeclKidSrc` reads a
     binding's derived element (`e`) or field (`f.<name>`) slot and returns its one source
     when every walk of the binding agrees and no write reaches the slot. When calls
     through that slot want two signatures, `monoPinGenericList` and `monoPinGenericRecord`
     point each call at its own instance as a direct call (`monoCallsPerRead`) instead of
     refusing. Two sources, a written slot, or an element seeded by a written `let`
     (D4246) keep the refusal. It closes D4242 and turns ten review witnesses from loud
     emit rejects into runs (`rv3505` a02, a03, a14, a26, b04, b07, b20, b27; `rv3531` u02,
     u03). Over the d3909, d3929 and d3960 grids, `rv3568` and the other `rv3484`–`rv3570`
     witnesses nothing else moved. It retires nothing. The walks that find the calls are
     still mono's, and maps, unions, spread, for-in and `?.` are not yet read from the table.
   - Second PR: a read that is not a direct call is rewritten to the generic's name. In an
     un-annotated `const` list or record literal, every use of the binding must be a pure
     read. When a read's slot holds one module-scope generic in the table
     (`fnFlowDeclPathSrc`, which follows a path of `e` and `f.<name>` steps), the read becomes
     a name read of that generic (`monoFlowReads`). So does each read of a `for … in` binding
     over such a list, and each element a `[...xs]` spread copies. A read straight out of a
     literal whose elements or fields are all names, such as `[g][0]` or `{ f: g }.f`, is
     rewritten the same way. The generic must declare type parameters and annotate every
     parameter. A hole parameter would leave the literal's own unpinned occurrence refused. The
     existing alias and direct-call machinery then instances it per call. This closes D4124,
     D4125 and D4126, and their four `error-` fixtures now run. Over the
     `fn-value-generic-list-read` matrix, runs go from 37 to 48 of 66. Over its open twin they
     go from 5 to 10 of 64. Nine `p1`/`p2` hand probes move from emit refusals to runs:
     alias, nested record, for-in, `length`, spread, and the record alias. No cell is lost.
     These stay as they are:
     - maps, which may hold null;
     - a returned union;
     - `?.`, a check reject at the inferred return;
     - a written `let`. D4515 is its clause-1 witness.

     It retires nothing yet.
   - Third PR: the binding may be a written `let`, so long as every write is a whole `=` of
     a literal. Its literal may also come back from a non-generic function whose every
     `return` is a literal. A read may go through `?.`. A binding that aliases another, or
     is written into one, is planned with it. When any binding sharing a literal declines a
     read, none of them is rewritten. A slot's sources may include the checker's adapter
     lambda, `($fp0) => g($fp0)`, which counts as `g`. That closes D4515. Over 67 matrix
     templates, runs go from 3,301 to 3,353, all in the four read templates:
     - `fn-value-generic-list-read`: 48 to 56 of 66; its open twin, 10 to 19 of 64;
     - `fn-value-generic-optional-read` (new): 43 to 60 of 66; its open twin, 5 to 23 of 64.

     No cell is lost and no silent cell is new. These stay as they are:
     - an annotated destination that pins the returned literal (D4575, D4576);
     - a parameter (the argument and early-return positions, D4577);
     - the literal reps behind `{ f: [g] }` and `[[g]]` (D4578);
     - maps (D4579).

     A direct read off a call, such as `pick()[0](2)`, is not rewritten, since that would
     drop the call.

     It retires nothing: each item on this step's list loses runs when ablated alone
     (an early return, or the store site's call emptied), graded on the native-align fixtures.
     - `monoPinGenericList`, which holds `monoCallsPerRead` and `monoFeIsSrc`: 12 fixtures.
       They cover element writes, written-`let` seeds, list aliases, and the refusal of two
       generic sources.
     - `monoPinGenericRecord`: 3 fixtures, covering field writes and calls at two types.
     - `monoNotePushDeliveries`: 5 fixtures, covering hole lambdas pushed or set into a
       typed list or map.
     - The store site's `monoStoreAnnName`: 3 fixtures, covering a generic stored after
       construction, into a nullable slot, and through a parameter.
     - The ObjLit arm of `monoCoerceFnValueName`: 3 fixtures. The ArrayLit arm: 8,
       including D3940's nullable element.

     The flow reads decide only reads of an un-annotated literal of explicitly generic
     functions. These pins also decide writes, pushes, annotated destinations, and functions
     generic only through an un-annotated parameter, which the table does not decide yet.
   - Fourth PR: the reads reach parameters and annotated destinations.
     - An un-annotated parameter of a non-exported, non-method function is a candidate when
       every use of the function is a direct positional call. Its literals are the arguments
       passed there and any whole `=` to it, and passing a candidate on to another candidate
       is a planned use. The flow-shadow table banks parameter slots too. Closes D4577.
     - An annotated binding initialized by a call of a concrete function that returns only
       literals delivers each returned literal at the annotation (`monoFlowAnnLits`). Every
       call of that function must initialize a binding annotated alike. A generic in the
       literal is instanced only where the instance returns the annotation's own type.
       Without that, a widening annotation such as `(x: i32) => i32 | null` would read an
       `i32` result as the nullable. Closes D4575.
     - The record-covariance check reads a direct call as fresh when every value it returns
       is fresh (`rcwCallSlotFresh`). The record is then delivered as the list is, including
       through a nullable record slot. Closes D4576.

     This is a pin at the annotation, not a rewritten read. Rewriting the reads of an annotated
     binding to the generic's name produced check-clean invalid wasm under a widening
     annotation, since the read then has the instance's type and not the slot's.

     Over the eleven fn-value templates, runs go from 497 to 503:
     - `fn-value-generic-list-read`: 56 to 59 of 66;
     - its open twin: 19 to 21 of 64;
     - `fn-value-generic-optional-read`: 60 to 61 of 66.

     No cell is lost and no silent cell is new. D4578 (nested literal reps) and D4579 (maps)
     stay open: both need a representation before any read is planned, which is the
     interner's question rather than the flow table's.

     It retires nothing. Each item was ablated alone again and graded over the 1,535 `@run`
     fixtures that hold a generic or a lambda. Every item loses fixtures that pass with it:
     - `monoPinGenericList`: 10, covering element writes, written-`let` seeds and list aliases.
     - `monoPinGenericRecord`: 3, covering field writes and calls at two types.
     - `monoNotePushDeliveries`: 7, covering pushes and map sets.
     - The store site's `monoStoreAnnName`: 3, covering stores after construction.
     - The ObjLit arm of `monoCoerceFnValueName`: 4. The ArrayLit arm: 8. Both now also
       carry this PR's annotated deliveries.

     What is left for these pins is writes and pushes, so the next retirement waits on the
     table deciding a write.
   - Fifth PR: `monoPinGenericRecord` retires, with `monoRecordFieldUses` and
     `monoMemberOfBinding`. A field of an un-annotated `const` record that holds a generic is
     instanced at the one signature the table pins its `f.<name>` slot at
     (`fnFlowDeclPathPinSigs`, which generalises `fnFlowLetPinSigs` to a path), and so is each
     value a write `d.f = v` stores; the writes come from the mono write index under `f:`.
     A field pinned at two signatures keeps the per-call rewrite of the flow reads, which now
     also reach a generic declared inside a function where the read is in its scope. This
     closes D4700, where the retired walk missed an alias call and emitted invalid wasm.
   - Sixth PR: `monoPinGenericList` retires, with `monoFeIsSrc`, `monoCallsPerRead`,
     `monoPinSigWithRet`, `monoListElemWrites` and `monoListElemCalls`. The element of an
     un-annotated `const` list literal is instanced at the one signature the table pins its
     `e` slot at, and so is each value a write `d[k] = v` stores (`d[0] = v` included); the
     writes come from the mono write index under `e:`. An element pinned at two signatures
     keeps the flow reads' per-call rewrite, which now re-plans a list a spread copied into.
     This closes D4301, where a call through a non-constant index pinned nothing.
   - Seventh PR: `monoStoreAnnName` retires, with `monoLocalAnnName`, `monoInstTyName` and
     `monoFieldAnnName`. A value stored into `p[k]` or `p.f`, pushed onto `p` or `set` into
     map `p` is delivered at the one signature the table pins that slot at in the frame
     (`monoPlacePinName`: the place's root declaration and its `e`/`v`/`f.<name>` path, read
     through `monoDeclPathPins`); a slot pinned at none or two delivers nothing here, as the
     annotation read did for a non-local root. A capture cell's read is no place root, since
     the cell path delivers it. The concrete half of `monoNotePushDeliveries` stays.
   - Eighth PR: the list and record literal arms of `monoCoerceFnValueName` stop reading the
     expected type's spelling (`monoStructFieldTypes`, `monoGenAliasFieldTypes` and
     `monoArrElemHoldsFn` retire). Each element or field value is delivered at the one
     signature the table pins the literal's own `e` / `f.<name>` slot at (`monoSlotPinName`),
     returning the annotation's return when one pins it; a nested literal reads its own slots.
     Three table changes carry it: a literal banks its slot by declaration (a mono remake
     records its origin), a pin keeps the return its annotation gives, and a type parameter the
     checker leaves open takes the closed type of an argument to a bare parameter of that type.
     The concrete half of `monoNotePushDeliveries` still stays: reading only the slot pin there
     loses exactly the five hole-lambda push fixtures its ablation loses.
   - Ninth PR: the concrete half of `monoNotePushDeliveries` retires. A push or `set` reads only
     the table's pin of the element or value slot (`monoDeliverAtPin`), and a hole lambda it
     names takes its per-signature instance there (`monoNoteBindDeliveryAt`). The five fixtures
     did not need a new model. The table had no pin for them because `ffMethod` stored a pushed
     or `set` value with `ffUnion`, so the edges ran both ways. The element slot then reached
     the lambda's slot and, through it, every other slot the lambda went to. In `twoLists`,
     `fs.e` saw the `i32` pin of `gs.e`. In `…-set-into-map-then-called-directly`, `ms.v` saw
     the `string` pin of the direct call `tw("s")`. Each slot had two pins and answered "".
     Every slot had its own single pin; the instancing per delivery was already
     `monoNoteBindDeliveryAt`'s job. A stored value now flows into the slot only (`ffInto`),
     as an element write and a literal element already did. With the probe on the old
     element-type read over 15,399 files (`tests/cases` and the distilled corpus), the pin
     and the element type now agree wherever the element type is concrete, except one
     return. In `literal-unions/const-literal-widening`, the pin reads `() => void` where the
     type reads `() => string`. The value there is a lambda literal, which neither delivery
     path instances. Reverting the edge alone loses exactly the five. The element store
     `p[k] = v` in `monoWalk` keeps its own concrete element-type read, which no ablation
     here touched. Two modules of 10,204 built change bytes, with the same output. In
     `generics/binding-of-generic-function-delivered-as-value` the old code coerced a push
     twice when pin and element type agreed, and the second pass read `k` through the alias's
     global. In `closures/hole-lambda-pushed-into-typed-list` the edge alone moves it: `c` no
     longer shares its pushes' pin, so `fs[0] = c` reads the instance's global directly.
   - Tenth PR: the element store `p[k] = v` in `monoWalk` stops reading the element's concrete
     type (`monoMapValTy` retires). A store delivers at the table's pin of the place's slot only
     (`monoDeliverAtPin`). Removing the old read exposed a defect: `monoPlaceRoot` refused
     every `name[0]` as a capture cell's read, because `monoCellReadName` is purely syntactic,
     so a user store `fs[0] = v` had no place root and its pin was always "". `monoIsCellRead`
     now also requires that the binding is the one the capture rewrite declared. A capture
     cell's own store `cell[0] = v` coerces at the cell declaration's `e` pin. Two cases stay
     with the cell path. The per-signature instance of a hole lambda stays there: a delivery
     there makes a reassigned binding hold calls at two argument types. A value read through
     another cell stays there too: coercing it leaves the written binding's type unsettled.
     Forcing the pin empty loses the same 12 fixtures as removing both old `Index` arms, and
     0 of 3,844 `@run` fixtures move. Four modules of 10,204 change bytes, with the same
     output:
     - In `fn-scope-alias-same-name-two-functions` two instances swap order.
     - In `delivered-alias-function-scope` the instance globals reorder, and one store reads
       the instance's global directly.
     - In `hole-lambda-binding-one-signature` the cell store `d1 = d1`, in a writer that is
       never called, no longer coerces, so two calls through the binding become direct.
     - In `captured-cell-unnamed-writer-two-instances` the uncalled `flip` of the `string`
       frame stores `other`'s `string` instance. The old element-type read stored the `i32`
       instance there.
   - Eleventh PR: the last two concrete reads in `monoWalk` outside the cell path move onto the
     slot pin.
     - A write `k = v` to an un-annotated local delivers at the one signature the table pins
       the binding at in the frame (`monoPlacePinName`). Before, it read the binding's
       concrete type through the instance's pins.
     - A call through a written `let` of generics (`monoCallWrittenLet`) takes the let's
       single pin (`monoSlotPinName`). Before, it read the callee's concrete type. With no
       single pin, it still instances the seed at the call. A probe on the old read fired
       at 0 of the 12 fixtures that reach it, because the callee's type is the seed's open
       generic there. The pin answers at 11 of the 12, and the output is the same.
     - The `@run` fixtures each removal loses are the ones forcing its pin empty loses:
       one (`written-let-seeded-from-parameter-written-with-generic`) for the local write,
       and none for the call. 0 of 3,847 `@run` fixtures move.
     - Nine modules of 10,208 change bytes, with the same output. All nine come from the
       local write; the call adds none.
       - In six hole-lambda alias fixtures, a write `d = e` of a `const` lambda now names
         the pinned instance's closure global. Before, it re-read `e`'s binding (or a
         captured copy of it), and globals were renumbered.
       - In `module-binding-one-call-type`, the uncalled `w1` writes `e`'s `string`
         instance, the type the binding's calls want. Before, it wrote the `i32` instance.
       - In two generic written-let fixtures, functions and globals are only reordered.
     - The local write closes D3944 (a generic written into a function-or-string union slot
       trapped) and D4307 (an `if` of a generic and a lambda was refused at emit).
5. **Capture cells.**
   - Retires `monoCellValueTake*`, `monoCellSeed*`, `monoCoerceWrittenCell`,
     `monoAliasCellRead`, `monoCellCall`, `monoRetypeLamCells` and the cell-fail helpers.
   - First PR: `monoCellCall`'s callee read moves onto the slot pin.
     - A call through a capture cell takes the one signature the table pins the cell's `e`
       slot at in the frame (`monoCellPinName`, which replaces `monoCellFnTyNameAt`). A cell
       seeded with a named generic still instances at the call.
     - A probe on the old read fired in 90 `@run` fixtures, never through an alias. The pin
       gave the same parameters at every one of them.
     - The pin of a zero-parameter function type made `monoCellConcreteTake` refuse
       (`capture-by-reference`), because it read the empty parameter list as no function
       type. It now tests for the arrow.
     - Forcing the pin empty loses 2 fixtures, and the pin keeps both. 0 of 3,849 `@run`
       fixtures move, and 0 of 10,210 modules differ.
     - The two cell cases the tenth part of step 4 left wait on step 6. Each was tried alone.
       Coercing a value read through another cell at the pin forces the source cell's hole
       lambdas to one signature, so `binding-copied-through-uncalled-chain` is refused.
       Delivering a hole lambda at a cell store's pin (`monoDeliverAtPin`) runs D4842, but
       refuses that fixture too, because `monoBindingSigConflict` still holds each reassigned
       binding at one signature.
6. **Refusal.**
   - The remaining fall-throughs in `monoCoerceFnValueName` / `monoInstanceFor` become the
     (c) literal.
   - **`monoBindingSigConflict` is retired.** Its refusal becomes the literal's multi-pin
     form, read from the class.
   - `live-sites.json` gains the literal's row, and the shadow comparison is deleted.
7. **Checker refusal.** The checker re-checks each source at its class's pins and refuses
   an ill-typed delivery with both positions named (D4010, D3975, D3923). This step depends
   only on step 1, so it can move ahead of step 3.
8. **The multi-pin decision** (§(g)): either the instance record or a named refusal.

Steps 2–5 can each be reverted on their own, because the table runs beside the code it
replaces until the step that deletes that code.

## (g) The multi-pin case, as its own decision after the table lands

Ruling C makes `let f = id; f = k; f(1); f("s")` legal (i02). One binding then needs two
instances of whatever it holds. Today `monoBindingSigConflict` refuses it at emit. From step 6 the (c) literal's multi-pin form refuses it. This
section proposes the *instance record* and states what it has to answer. **It is not part
of steps 0–7.** It is decided once step 1's histogram shows how many multi-pin classes the
corpus and the fixtures contain.

**The shape.** The rep of a class with pins `P1…Pn` is a struct `{src, c1…cn}`. Each `ci`
is the source's closure at `Pi`, and all of them are built over one shared environment.
`src` identifies the source function. A write of source `g` builds the struct. A call at pin
`Pi` reads field `i`. This is sound because the program is closed: every pin of a class is
known before emit.

The record has to answer five things:

1. **`==`.** Function equality runs today: i01 and i09 both print `true`. Two records built
   by separate writes of the same `id` are different references. So `==` on a multi-pin
   class compares `src` and the environment reference, never the record reference. A
   one-pin class keeps today's comparison unchanged.
2. **Propagation across a class.** A record crosses into another class only along an edge.
   An edge unifies the two classes, so both classes have the same pin set and the same
   record layout. The interprocedural fixpoint (§(e)) gives every class its final pin set
   before emit, so no record is ever widened after it is built.
3. **Positional union box tags.** The union member-set ABI never dedupes, and its tags are
   positional. A union's function arm holds one rep for every value of that union type.
   - A union arm ANNOTATED with a function type is a concretely typed slot. It is a pin,
     and the value is projected to that field at the write (p08's slot is
     `(x: string) => string`).
   - Only an INFERRED arm can carry a record. Its member is then minted with the record's
     struct type, so a tag stays positional, and two unions that differ only in that arm's
     rep are different unions.
4. **The boundary at a concrete parameter.**
   - A scalar function parameter is a pin. The argument passes field `i`, and the callee
     is unchanged (i03).
   - A CONTAINER parameter, such as `((x: i32) => i32)[]`, is the hard case:
     - r02 passes `[id]`, which was also called at `string`, to a funcref list. The
       checker accepts r02 today, and it is an emit reject (`callee is not a function
       name`).
     - Converting by copying the element is correct only when nothing writes through the
       alias. r01 writes through it, and the checker already refuses r01, because the
       list's element type differs.
   - The proposal: a class that reaches an ALIASED concretely typed container slot is
     pinned to that slot's one signature, and a second pin is a CHECK refusal naming both
     positions. That is the array-aliasing rule the language already applies, extended to a
     class. It would make r02 a design refusal, where today it is an emit refusal. **That
     is an owner-level choice, and the decision step puts it to the owner.**
5. **Pin collapse.** Two pins collapse only when their instance keys are equal, which means
   equal type-id tuples. Pins never collapse because their wasm signatures match. `i32` and
   `boolean` share a rep, but `inner<i32>` prints `7` and `inner<boolean>` prints `true`, so
   they are two instances. This is the matrix's shared-rep axis.

The two-pin witnesses the decision is graded on:

| witness | what it needs | today |
| --- | --- | --- |
| i02 | a written binding called at two types | emit reject, one closure signature per binding |
| i03 | i02, then delivered to a `(boolean) => boolean` parameter: a third pin, projected | emit reject plus a checker refusal at the delivery (D4017's shape) |
| i04 | i02, then put in a list: `elem` joins the class, so it is a list of records | emit reject, callee is not a function name |

**The alternative** keeps the refusal, worded as the (c) literal's multi-pin form. It leaves
ruling C's written multi-type case a standing clause-2 gap. No written `pair` cell of the
d3960 grid runs today; all the unwritten ones do. The record costs:

- a rep change confined to multi-pin classes;
- a full rep-fuzz run;
- one struct allocation per write.

The refusal costs nothing, and it leaves the gap open.

## (h) One checker-side store, shared with #3508, #3516 and the types-and-reps survey

The review's concern is that two parallel identity tables would get built. **The flow table
keys into the same store as the survey's L1 per-call binding column. It mints no identity
of its own.**

The code-quality survey (`types-and-reps`, finding L1) found the following:

- `checkCallOnFuncTy` computes each generic call's exact binding (`bNames`/`bTys`) and then
  throws it away.
- Mono re-derives the binding as pin STRINGS. `monoArgTyName` alone is 525 lines, 81
  returns, and ends in an `"i32"` catch-all.
- Class B of its sample, about 141 rows [84–198], traces to that re-derivation.

L1 proposes three changes:

- (a) a checker column keyed by call node, holding type-parameter ordinal → arena id;
- (b) instances keyed by the tuple of type ids;
- (c) a per-instance node-type column.

**L1 names the function-value flow table as the function-value half of the same store.
This design agrees.**

| store | key | written by | read by |
| --- | --- | --- | --- |
| binding identity | `identDeclIx[node]` → decl node; `declOrig[minted] → decl` | checker Ident arm (step 0); `identFrom` in the rewrites | everything below; replaces fsb's name-and-depth rows |
| per-call binding (L1 a) | call node → type-param ordinal → arena id | `checkCallOnFuncTy`, every resolved generic call | mono's instance key (L1 b); the flow table's pins; #3508's re-check |
| instance key (L1 b) | tuple of type ids | mono | `fnFlowSigAt(node, inst)` |
| flow classes | decl id (+ derived slot) → class | the flow pass (step 1), after the last full check pass | emit, via `fnFlowSigAt` |

**How #3508's tables map onto it.** #3508 (lane CK, merging first) adds these checker
tables:

- `fsbRowDecl`: a marked binding, by declaration node, resolved through
  `fsbName`/`fsbDepth`.
- `fsbOwn*`: the functions written to it, as owners of their deferred constraints.
- `fsbCall*`: each call through it, with what the call bound (`fsbCallNames` /
  `fsbCallTys`).
- `fsbRecheckCalls`: re-asks the owners' constraints at each call.

These are the flow table's sources, its call pins and the per-call binding, restricted to
written generic `let`s and keyed by name and depth. Under the shared store:

- `fsbRowDecl`'s resolution moves onto `identDeclIx`, and `fsbName`/`fsbDepth` retire;
- `fsbCallNames`/`fsbCallTys` become reads of L1(a)'s column;
- `fsbOwn*` stays CK's, as the checker-side record of a class's sources, and the flow
  pass reads it rather than rediscovering sources;
- D4017's fix (§(d)) adds the delivery pin to the same rows.

**How #3516 interacts.** `wsApplyPending` adds a full re-check pass. Every column above is a
module table that `initChecker` empties, so the last pass writes it, and nothing is carried
across passes (§(b)).

**Order of landing:**

1. #3508, the checker half of written generic lets.
2. #3517, its emit half, rebased onto #3508.
3. #3516, the record-width re-check.
4. Step 0, the identity column. It also re-keys fsb's resolution and keeps #3508's
   fixtures byte-identical.
5. Step 0b, L1(a)'s per-call binding column, shadowed against `monoArgTyName` as L1
   proposes, with `fsbCall*` becoming reads of it.
6. Steps 1 onward of this design, with L1(b)'s instance key adopted when it lands.

Steps 0b and 1 can run in parallel, because they write different columns. L1(b) and (c)
are the survey's to schedule. This design depends only on (a), and it uses the existing `fe`
instance until (b) lands.

## (i) Cost

**What the existing rows measure.** The self-compile has 0 generic functions, and the
plumb-shape units have no generics and no function values. Both skip the gated pass, so
neither row can bound it.

- They bound the parts of this design that run on EVERY program: the identity column, the
  unconditional symbol resolution, `identFrom`, and the audit.
- The fixpoint itself is bounded by the `fn-flow` scaling pair (§(e)): its worst case is
  about O(N × merges), and it lands at step 1.
- The self-compile's guest profile (21,509 samples, `guest-profile.sh`) gives
  `checkProgram` 29.6% and `emitProgram` 64.9%. Its 0.33% `mono*` share is the gate's skip
  path, not the machinery at work. It says nothing about what retiring that machinery
  saves on a generic-heavy program.
- **The identity column** is one `i32` per node: 1.0–1.7 MB on the self-compile arena of
  257k–423k nodes. `declOrig` is sparse.
- **The plumb-shape RSS bar** is +10% of 296 MB.

**Budget the steps must hold:**

- self-compile guest fuel within its 1.5× ratchet, and no worse than ±1% at step 0
  (baseline 54,350,416,863);
- plumb-shape fuel within +5% of 8,063,154,591 (tail 5,854,853,494);
- seed size within +3% of 4,773,370.

Replacing ~4,860 lines of `emit_mono.vl` with a pass estimated at under a third of that
should SHRINK the seed. That is a prediction, read at each step with `seed-size.vl
--check`.

`cwFrameWalk` (1.95%) and `crReadHook` (2.78%) are the checker's name-rooted
written-binding walks. With `identDeclIx` they could key by identity too. That is noted,
not claimed, and is out of scope.

## (j) Rows, graded

**Family rows.** The table below lists **56 ids**. On master `20fa382fe`,
`check-filed-witnesses --strict` grades **55 as filed and 1 moved**: D4010 grades
`trap_loads` on master, and it was filed `silent_invalid_wasm` against #3517's tree.

D4010–D4016 reached master with #3517.

The attribution below is a prediction, graded at the step named. A row that does not move
at its step is re-ablated, not re-attributed.

| step | rows | outcome on master |
| --- | --- | --- |
| 2 identity, not name | D2114, D2479, D3910, D3911, D3924, D4011, D4016 | silent 5 (invalid wasm 3, trap 1, wrong value 1); emit reject 3 |
| 3 let / const / alias / written | D3297, D3384, D3858, D3873, D3904, D3906, D3926, D3941, D3942, D3943, D3957, D3961, D3962, D3964, D3965, D3976, D4013, D4014, D4015 | silent 12 (invalid wasm 6, trap 3, wrong value 3); emit reject 6 |
| 4 list / map / field / union | D2484, D3165, D3166, D3934, D3935, D3944, D3947, D3978, D4012 | silent 6 (invalid wasm 1, trap 3, wrong value 2); emit reject 3 |
| 5 capture cells | D3851, D3857, D3868, D3952, D3953, D3954, D3955, D3956, D3958, D3959, D3970, D3971, D3973, D3974 | silent 5 (trap 3, wrong value 1, invalid wasm 1); emit reject 9 |
| 7 checker refusal (DESIGN) | D3923, D3975, D4010 | silent 2 (invalid wasm 1, trap 1); emit reject 1 |
| adjacent, not claimed | D1482 (`.map` producing closures), D2735, D3822, D3933 | emit reject 4 |

**Moved at a step:** D3957 was attributed to step 2 and moved to step 3 when step 2 did not
close it (it traps with the parameter renamed and no capture). Step 3's first PR closed it
together with D3953, D3954 and D3958, which were attributed to step 5: the write that needed
instancing is a capture cell's element store.

**New since revision 1:**

- The review's p08 and i07 witnesses are spellings of D3944 and D3961 (ablated in #3533).
- D4017 (§(d)) is CK's.
- D4018 (`as?` to a function arm) is adjacent, not claimed.

**Duplicates and closes:**

- Two pairs fold in #3532 once #3517 merges: D4013 into D3941 (a written let with an
  if-expr of generics), and D4014 into D3965 (an alias of a written generic let).
- #3517 itself closes D3690 and D3961. D3962 and D3964 close with #3517 too.

**The matrix** is #3532's `generic-let-written-grid.py`: 567 cells, with the oracle updated
for ruling C and an `ann` initialiser axis added. On master `20fa382fe`:

| outcome | cells |
| --- | ---: |
| runs | 99 |
| loud check, ill-typed by ruling C | 386 |
| loud check, legal (clause 2) | 0 |
| loud emit (clause 2) | 14 |
| **silent** (42 trap, 26 invalid wasm) | **68** |

The family that matters is a generic-seeded binding written with another generic (`gen`,
`alias` or `hole` × `generic`, 99 cells). Of those, **18 run, 68 are silent, and 13 refuse
at emit.**

- Every module-scope cell in that family is silent.
- No written `pair` cell runs, and every unwritten `pair` cell does.

## Revision 2: what changed, for the #3531 review

1. Identity across the eleven pre-mono rewrites: the creation-site table, `identFrom`, the
   post-rewrite audit, and why the table is not built after the rewrites (§(b)). The
   keep-running list is in §(c).
2. The premise that ruling C put the typing half in the checker is corrected for
   deliveries. The gap is filed as D4017, and CK owns it (§(d)).
3. Interprocedural edges are a fixpoint over summaries, and the cost is restated (§(e)).
4. The complete position list, with the outcome of each witness (§(e)).
5. The instance record is its own decision step, covering `==`, propagation, union tags,
   the concrete-parameter boundary and pin collapse (§(g)).
6. Step 0 takes the last full pass's write and drops the agreement assert. It handles
   #3516's re-check and keys shared leaf lambdas by instance (§(b)).
7. Shadow mode logs the positions mono never decides (§(f), step 1).
8. Numbers corrected:
   - 56 ids, 55 as filed;
   - D4010–D4016 exist only on #3517's branch;
   - the caps are 4/8/16/64;
   - `monoCoerceFnValueName` has 15 references.
9. One checker-side store shared with #3508, #3516 and the survey's L1, with a landing
   order (§(h)).

## Revision 3: what changed, for the rev-2 review

1. **Identity propagation is complete, and it has one entry point per kind of change**
   (§(b)):
   - `identFrom` for a minted node;
   - `identFromDecl` for `cboxSeedLet` / `cboxStoreBack`, which have no old node;
   - `sidNoteNodeName(ix, declIx)` for every in-place rename, mono's included;
   - mono's 11 `mkIdent`, 7 `mkLet` and 5 `mkParam`, with an instance Param's `declOrig` set
     to its template Param;
   - `synthVoidTwins` / `synthExternValues`.

   The audit now runs after the last arena-mutating pass, counts every Ident in every
   position, and has must-fire controls.
2. **The cost is bounded by a new `fn-flow` scaling pair**, because neither the self-compile
   (0 generics) nor plumb-shape (no function values) runs the pass. The worst case is about
   O(N × merges). Context sensitivity is per instance, so f01 and f02 keep running (§(e)).
3. **The interim rule no longer refuses single-source classes.** A single-source unwritten
   class gets an instance per pin at each read: i05, u01 and u04 keep running, and u02 and
   u03 are claimed at step 4. The refusal applies only to 2+ pins with 2+ sources, or to a
   written class with 2+ pins.
   - The review's wording, "refuse with 2+ sources", is narrowed to 2+ sources AND 2+
     pins. With only one pin, m01 (two sources) runs today.
4. **`monoBindingSigConflict` retires at step 6**, the peer pins at step 3 and
   `monoLetWrites` at step 2. Group B, §(e), §(f) and §(g) now agree.
