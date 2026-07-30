# Identifier interning — design, rulings, and the phase plan

`docs/internals/perf-program.md` §3 item 2 is the largest compiler-side perf item on the
list: **19.10% of a self-compile is `__str_eq__`/`__str_hash__` under SYMBOL/IDENTIFIER
consumers** — scope slots, capture tables, module rename tables, field names, and the
string-keyed name→index maps. This file is that item's design: where the one intern table
would live, what its ID space is, which consumers convert in which phase, and the invariant
that makes "same string ⇒ same id" unbreakable across the module merge.

It is written in the ruling-plus-alternatives form, and it opens with a verdict that the
re-baseline forced and that the filed scope did not anticipate.

---

## 0. Verdict

**The table is DEFERRED and the arc is RE-ORDERED. The re-baseline this design was required to
take first found that the symbol layer's four largest measurable costs are not identity
representation at all** — they are one avoidable recomputation, one un-hoisted scan, one
whole-arena rescan, and one double map probe. Removing those four — plus a fifth, the token
layer's 19-way keyword chain — is worth **−11.1% of a self-compile** and requires no intern
table, no ID space, and no new invariant. They shipped (§6).

What remains after them is the real interning arc, and it is **DIFFUSE**: 18.95% of the
post-§6 profile spread over ~40 consumers whose largest single member is 3.2%. Every one of the top five is a
whole-program **name → index** lookup, and converting any of them needs the same missing
piece: **a place to keep an identifier's id so it is computed once rather than per lookup.**
That carrier is designed here (§3.3) and is the content of phase 2 — but it must be shaped
against the consumers that will use it, and the consumer set the item was filed with
(scope slots + capture tables + `keywordKind`) is, after §6, worth **3.0%** of which
`keywordKind`'s 0.92% is not an identity problem at all (§4.1). Shipping the carrier now,
shaped by a consumer set that no longer justifies it, would buy a **counted 0.5%** and
install a name-writer invariant across eight sites for the next edit to break silently.

So: the measurement is banked, the design is written, the four avoidance fixes shipped, and
the table waits for phase 2's consumer set to be measured against the profile that now exists
rather than the one that did not survive contact with it.

---

## 1. The re-baseline

Recipe per `perf-program.md` §2 (`VL_PROFILE_GUEST`, wasmtime, `$mNN` stripped, warm sidecar).
**Master `1517c7f6`, 12 warm runs, 20,985 samples.**

| % self | % incl | fn | class |
| ---: | ---: | --- | --- |
| 27.71 | 27.71 | `__str_eq__` | — |
| 5.62 | 5.62 | `__str_hash__` | — |
| 5.54 | 5.54 | `fnStmtsPosOf` | (not strings) |
| 3.04 | 8.60 | `tokenize` | |
| 2.78 | 11.93 | `__map_probe__` | — |
| 2.64 | 2.74 | `nameNamesFunction` | SYMBOL (whole-arena scan) |
| 2.38 | 2.38 | `tyTopIndexOf` | |
| 2.32 | 2.32 | `modSrcLoad` | |
| 1.20 | 1.20 | `daSnapshot` | |
| 1.15 | 2.86 | `modRenamed` | SYMBOL |
| 0.97 | 5.10 | `capScan` | SYMBOL |
| 0.91 | 0.91 | `__str_concat__` | — |
| 0.72 | 2.16 | `capIsBound` | SYMBOL |
| 0.55 | 2.20 | `declaredSlotOf` | SYMBOL |

`__str_eq__` 25.19 → **27.71**, `__str_hash__` 4.75 → 5.62 since `883dca44`: the pie shrank
(#1312/#1313 removed ~10% of a self-compile at the host boundary) and the string layer is a
bigger share of it. `modSrcPush` 4.56 → **0.00**, replaced by `modSrcLoad` 2.32 — #1312
landing, as recorded.

### 1.1 String-primitive self-time by CONSUMER CLASS

Every `__str_eq__` / `__str_hash__` / `__map_probe__` / `__str_concat__` self-sample walked up
past the string primitives to the first real consumer, then classified. **Nothing is
discarded** — an unmapped consumer lands in UNCLASSIFIED and is printed, which is how the
TOKKIND class below was found at all.

| class | share of all samples | what the compared string IS |
| --- | ---: | --- |
| **SYMBOL / IDENTIFIER** | **19.59%** | a value / function / field / local NAME |
| TYPE | 9.13% | a nominal type spelling, rep tree, union atom, annotation |
| UNCLASSIFIED | 4.62% | the diffuse tail — no member over 0.25% |
| **TOKKIND** | **2.47%** | a lexer token KIND (`"IDENT"`, `"LPAREN"`, …) |
| MODPATH | 1.21% | an import specifier / module key |
| | **37.02%** | |

The 19.10/6.08 split recorded at `883dca44` re-derives to **19.59 / 9.13**. The SYMBOL number
is stable to within its error bars; the TYPE number grew because this pass classifies the rep
tree (`repTreeVKind`, `repTreeListElemName`, `repOfArray`) as TYPE, which the earlier pass left
unattributed. **TOKKIND is new and was inside neither number**: the parser compares
`tok.kind` against string literals everywhere, a CLOSED ~60-element vocabulary that is a
different problem from identifiers (§4.1).

### 1.2 The top symbol consumers, ranked

| % of all samples | consumer | shape |
| ---: | --- | --- |
| 3.07 | `globalIndexOf` | `{[string]: i32}` probe (2.64 of it under `globalLetOf`) |
| 2.11 | `lookup` (checker) | `.has` + `[]` per scope level — TWO probes per level |
| 2.05 | `fnIndexOf` | `{[string]: i32}` probe |
| 1.64 | `parentLetOf` | `.has` + `[]` on the per-block let cache |
| 1.44 | `capIsBound` | linear scan of a `string[]` |
| 1.39 | `modRenamed` | linear scan of `modRenameFrom` |
| 0.86 | `objFieldType` | field-name scan |
| 0.76 | `keywordKind` | 19-way `==` chain (TOKKIND, not SYMBOL) |
| 0.75 | `scopeSlotOf` | linear scan of the scope stack |
| 0.71 | `declaredSlotOf` | linear scan of `localNames` |
| 0.64 | `paramTypeNode` | param-name scan |
| 0.57 | `capHas` | linear scan of a `string[]` |
| 0.56 | `exportSlotOfTarget` | scan |
| 0.54 | `inferRetNameOf` | probe keyed by function NAME |

**There is no hotspot.** The largest member is 3.07% and the top five total 10.31%. That is
the single most important fact for the phase plan: interning is a BROAD migration, and its
value only arrives if the per-lookup cost of *obtaining* an id is ~zero (§3.3).

---

## 2. What "the symbol layer" is, structurally

Four distinct populations wear the same `string` type today, and only the first is what this
design is about:

1. **Identifiers** — an open, program-dependent vocabulary: locals, params, globals, function
   names, struct field names, capture names, module-merge renames. Tens of thousands per
   compile of the compiler. **This is the interning target.**
2. **Type spellings** — an open vocabulary too, but the destringify program (`D-*`) is
   already the vehicle and its verdict stands: `perf-program.md` §3 "explicitly NOT on this
   list — interning TYPE names, 6.08%".
3. **Token kinds** — a CLOSED vocabulary of ~60 spellings fixed by the lexer. Needs no table:
   the ids are statically known (§4.1).
4. **Module keys / import specifiers** — a closed-per-compile set of ~26 paths. 1.21%, and the
   probes are already maps. Not worth a phase of its own.

---

## 3. Rulings

### R1 — the ONE table lives in a NEW LEAF MODULE, `compiler/symbols.vl`

**Ruling.** One table, in a module that imports only `compiler/ast.vl`, exporting exactly:

```
sidOf(text: string) -> i32      // intern: the id of `text`, minting on first sight
sidText(id: i32) -> string      // the inverse: an ARRAY READ, not a probe
sidOfNode(ix: i32) -> i32       // the carrier — see R3
sidNoteNodeName(ix: i32) -> i32 // the invalidation hook — see R4
sidReset() -> i32               // per-compile
```

**Why a new leaf and not an existing home.** The consumers are in `lexer`, `parser`,
`typecheck`, `emit_*`, `driver` and `cli`. `ast.vl` is the only module every one of them
already imports, and it owns `P.nodes` — but it is the AST *shape* module and putting a
mutable global side table with a reset protocol in it makes the arena's own header answer for
a perf cache. A new leaf under `ast` is importable by all of them with no direction problem
(the recurring hazard recorded in `vl-check-import-direction-before-briefing-a-route`:
`emit_base` imports FROM `typecheck`, so several plausible "route it to the home" moves are
illegal DOWN-moves — a fresh leaf has no such edge to get wrong).

**Alternative rejected — per-layer tables** (one in the lexer, one in the checker, one in the
emitter). This is what exists today in effect, and it is the reason the arc is worth taking:
three tables means an id from one layer is meaningless in another, so every layer boundary
re-hashes. It also makes the collision invariant (R4) three invariants.

**Alternative rejected — put it in `emit_state.vl`.** The emitter is the biggest consumer, but
the checker's `lookup` (2.11%) and the driver's `modRenamed` (1.39%) are outside it, and
`emit_state` is downstream of `typecheck`.

### R2 — the ID space is WHOLE-PROGRAM, minted per compile, never per module

**Ruling.** One id space for the whole compile. `sidReset()` runs where `P.nodes = []` runs.
Ids are dense from 0 and are NOT stable across compiles (so nothing may persist one).

**Why not per-module.** The driver MERGES every module into one arena and RENAMES the
colliding top-level names (`modRenameFrom[i] → modRenameTo[i]`, `driver.vl` ~2495). A
per-module id space would have to be remapped at the merge — a remap table per module, applied
to every id in every node — which is the same whole-AST walk the merge already does, plus a
second one. Worse, `modRenamed` is itself the 6th-largest symbol consumer, so the merge is a
place to make CHEAPER, not a place to add a pass.

With a whole-program space the merge needs nothing: a renamed name is a *different string*, so
it gets a *different id* the first time anyone interns it, which is exactly the correct
answer. The merge does not have to know the table exists.

**Consequence to state plainly:** ids therefore depend on INTERN ORDER, which depends on
traversal order. Nothing may depend on an id's numeric VALUE — no `id < K` range tests, no
sorting by id, no serialization. The one place that temptation appears is `keywordKind`
("seed the keywords at ids 0..18 and the test becomes `id < 19`"), and §4.1 rejects it on its
own measurement, which is fortunate because it would also have been the first violation of
this ruling.

### R3 — the CARRIER is an arena-node side table, not a token field and not an AST field

This is the load-bearing ruling and the reason phase 1 as filed does not pay.

**The problem.** Interning is only a win if the id is obtained more cheaply than the string
comparison it replaces. A consumer that receives a `string` and calls `sidOf(name)` has paid
one `__str_hash__` plus one `__str_eq__` — i.e. exactly one map probe — to save a linear scan.
For `capIsBound` (a scan of ~10 names) that is roughly a wash; for `fnIndexOf` (already ONE
probe) it is a strict loss. **Interning at the point of use is not a win. The id has to be
computed once and read many times.**

**Ruling.** The carrier is `sidNode: i32[]`, indexed by ARENA NODE INDEX, holding the
interned id of that node's primary name (`Ident.identName`, `FuncDecl.fnName`,
`LetDecl.letName`, `Param.parName`, `ForRange.frVar`, `ForIn.fiVar`), or -1 for a node with no
name. Filled LAZILY on first read, grown to `P.nodes.length` on demand (append-only, so the
growth is amortized O(1)). `sidOfNode(ix)` is then an i32 array read with a bounds check —
about the cost of one comparison, versus a hash plus a probe.

**Why an arena side table.**
- The arena index is what the emitter and checker already thread everywhere; `capScan(ix, …)`,
  `emitExpr(body, ix, fnIx)`, `checkNode(ix)` all have it in hand.
- The same node is read MANY times per compile (the classifier passes, the rewrite passes,
  the emit passes, and — for a lifted body — once per enclosing frame), so one intern
  amortizes over all of them.
- It costs one i32 per node. The compiler's own arena is ~10^6 nodes, so ~4 MB against a
  511 MB self-compile — 0.8%, and `perf-program.md` §2.1 says allocation is not the lever
  anyway.

**Alternative rejected — an id field on the TOKEN.** The lexer already sees every identifier,
which is why the filing suggested it. But an identifier TOKEN is produced once and read once
or twice; interning there pays a hash per identifier token in the densest loop in the compiler
to serve consumers that mostly do not have a token in hand (the emitter has arena nodes, not
tokens). Measured directly on the one consumer that IS at the token (`keywordKind`, §4.1): the
hash costs more than the compare it would replace.

**Alternative rejected — a companion field on each AST node** (`Ident.identSym`, …). Semantically
the cleanest — the id travels with the name and cannot desynchronize by construction — and it
is what a from-scratch compiler would do. Rejected for THIS codebase for two reasons: it
changes `compiler/ast.vl`'s node shapes, which every `is`-narrowing site, the parser's
constructors, the formatter and the LSP query families read; and every synthesized node in
`emit_mono`/`emit_rewrite`/`parser` recovery would have to set it, which is an unbounded and
unenumerable writer set. The side table's writer set is bounded and enumerable (R4). Filed as
the phase-4 END STATE, once the consumers have proven the id is worth carrying.

**Alternative rejected — hash-consing the STRING objects** so that equal strings are the same
GC reference, plus a `ref.eq` fast path in `__str_eq__`. Attractive because it needs no
consumer change at all. Rejected on measurement: in a linear scan the majority of compares are
MISSES, and `__str_eq__` already early-outs a miss on `array.len` (`emit_sections.vl` ~1295),
so `ref.eq` would only accelerate the HITS — the minority — while every producer of a string
would pay an intern probe. It also cannot help `__str_hash__` at all (5.62%), because WasmGC
exposes no address to hash.

### R4 — the invariant: `sidOfNode` is filled LAZILY and every IN-PLACE NAME WRITE notifies

**The invariant.** *Same string ⇒ same id* is trivially true of `sidOf` (it is the only minter
and it probes before minting). The breakable half is the CARRIER: `sidNode[ix]` must equal
`sidOf(<the node's name RIGHT NOW>)`.

**Ruling.** Two clauses, and both must be pinned at their own sites:

1. **A node arrives fully built.** `ast.addNode(n)` takes a complete `Node` and appends it;
   there is exactly one append in the compiler (`ast.vl` ~881) and nothing removes. So a
   lazily-filled slot is correct for every node that is never rewritten.
2. **Every in-place write to a node's NAME calls `sidNoteNodeName(ix)`**, which clears the
   slot. The writer set is EIGHT, enumerated structurally at `1517c7f6` and re-derivable by
   `grep -n '\.identName = \|\.fnName = \|\.letName = \|\.parName = \|\.frVar = \|\.fiVar = '`:

   | site | what it writes |
   | --- | --- |
   | `driver.vl` 2761 | `n.fnName = modRenamed(n.fnName)` (module merge) |
   | `driver.vl` 2852 | `n.letName = modRenamed(n.letName)` |
   | `driver.vl` 2976 | `n.identName = modRenamed(n.identName)` |
   | `emit_collect.vl` 996 | `n.fnName = "__lambda_" + …` (lambda numbering) |
   | `emit_mono.vl` 1245 | `cal.identName = monoInstName[k]` |
   | `emit_mono.vl` 1561 | `cal2.identName = instName` |
   | `emit_mono.vl` 2048 | `cal.identName = monoInstName[r]` |
   | `emit_mono.vl` 2091 | `cal2.identName = specName` |

   Type-position names (`tyName`, `isVariant`, `asTy`) are also written in place (driver 2731/
   2739/2964/2967/3074/3077, typecheck 10080/10157/10161/10186) and are OUT OF SCOPE — they are
   population 2 (§2), which the carrier does not index.

**Why lazy and not eager.** An eager pass would have to run after the merge (renames) and
before the emitter, and then re-run after every mutating emit pass — i.e. it would need
exactly the same eight notifications, plus a pass. Lazy needs only the notifications, and it
never fills a slot for a node nobody asks about.

**How a violation must show.** A stale carrier slot resolves an identifier to the WRONG symbol
— a silent miscompile, the worst class. It is caught by the fixpoint ladder (the compiler's own
26 files exercise the merge rename and the lambda numbering on every self-compile), and, for
the monomorphization writers, by the generics corpus. §6.4 runs the poison and records which
instrument actually reddened, because "the ladder would catch it" is a claim, not a witness.

### R5 — a CONSUMER converts only when its call sites already hold a node index

**Ruling.** Do not convert a consumer by adding `sidOf(name)` inside it. Convert a consumer by
changing its signature to take an `i32` id and updating its call sites to pass
`sidOfNode(ix)`. If a call site does not have `ix`, the consumer is not ready and belongs to a
later phase.

This is what makes the phase boundaries objective rather than a matter of appetite, and it is
the rule the filed phase-1 set fails: `declaredKind(name)` is exported and called from sites
that hold only a string.

### R6 — a name → INDEX map becomes a SYM-INDEXED ARRAY, not an i32-keyed map

**Ruling.** When `globalNameMap: {[string]: i32}` converts, its replacement is
`globalIndexBySid: i32[]` — a dense array indexed by symbol id — not `{[i32]: i32}`.

**Why.** VL has i32-keyed maps (B6a/B6b, shipped through #1289) and they would work, but a
dense array is a bounds check plus a load where a map is a hash plus a probe, and the id space
is dense from 0 by construction (R2). The array is sized at the map's BUILD point, interning
every key as it goes; a symbol minted afterwards is, by the interning invariant, a
*different string* from every key present, so `sid >= arr.length ⇒ absent` is exact and not an
approximation. That argument is the single clearest payoff of R2's whole-program space and it
should be quoted at the site.

**Caveat to pin at the site:** the array must be rebuilt or extended wherever the map is
WRITTEN, not only where it is built. `fnNameMap` is written by `buildFnMap` and extended by
monomorphization; `globalNameMap` is built once.

### R7 — `__map_probe__` callers convert with their maps, not before

The 2.78% self / 11.93% inclusive of `__map_probe__` is not a thing to optimize; it is the sum
of its callers. The three that matter (`globalIndexOf`, `fnIndexOf`, `parentLetOf`) each
convert under R6. `lookup` (the checker's scope chain) is a map PER SCOPE LEVEL and converts to
an array per level only once the carrier reaches the checker — phase 3.

### R8 — the table must have a COLLISION POISON in the standing test set

**Ruling.** An intern table that returns one id for two different strings is a silent
miscompile generator, and the same is true of every identity table built on the same premise.
The standing gate must contain a test that fails when two distinct names collapse, and it must
be sabotage-verified rather than assumed. §6.4 builds and runs that poison against the
identity table this PR ships (`nameNamesFunction`'s function-name set) and records the
witnesses, so the recipe is proven before phase 2 needs it.

---

## 4. Alternatives measured and rejected

### 4.1 `keywordKind` on interned ids — NO, and the number says so

The filed candidate set named `keywordKind` as self-contained phase-1 material: seed the 19
keywords at ids 0..18 and the classification becomes a range test.

**Rejected, on two independent grounds.**

1. **It would cost more than it saves.** The range test presupposes an id, and the only place
   to get one for a token is to intern EVERY identifier token in the program — one
   `__str_hash__` over the whole text, in the densest loop the compiler has. What it replaces
   is at most 19 `__str_eq__` calls that each early-out on `array.len`. The measured cost of
   the whole chain is **0.76% of a self-compile**; a hash of every identifier token is not
   obviously smaller, and the trade is a certainty of paying against a hope of saving.
2. **It would violate R2.** `id < 19` is a dependency on the numeric value of an id in a space
   whose values are intern-order-dependent. The only fix is to reserve a prefix, i.e. to
   special-case the table for one consumer.

**What the profile actually said to do**, and what shipped (§6): dispatch on the first
CHARACTER. The vocabulary is closed and no first character carries more than three keywords,
so a non-keyword — the answer for the overwhelming majority of identifier tokens — costs one
character read and a run of i32 compares, and a keyword costs at most one `__str_eq__`.

**The generalisation worth keeping: a CLOSED vocabulary does not need an intern table.** It
needs an enumeration. That is also the answer for the whole TOKKIND class (2.47%, §1.1): token
kinds are ~60 fixed spellings and the mechanical conversion to i32 constants needs no runtime
table at all. It is a large, boring diff across the lexer/parser/format/lint and it is filed
separately — it is NOT part of this arc, because it is not about identity, it is about
representation of a constant.

### 4.2 Intern TYPE names — still NO

`perf-program.md` §3 already rules this out at 6.08%; this re-baseline reads 9.13% with the
rep tree attributed, and the ruling is unchanged: the destringify program is the right vehicle
and it is the smaller half.

### 4.3 A single-entry memo in front of `globalLetOf` — NO

2.64% of the profile is `globalIndexOf` reached from `globalLetOf`, and its callers are a run
of sibling predicates (`globalIsMap`, `globalIsNulMap`, `globalIsRefArray`,
`globalIsNulRefArray`, `globalStructIndex`, …) that each ask about the SAME name in sequence.
A one-entry memo would collapse the run. Rejected for now: the memo's key test is itself a
`__str_eq__` on a hit (a full walk, since the strings are equal), so it trades a hash for a
walk; and it needs an invalidation edge to `globalNameMap`'s writers, which is a new invariant
for a fraction of the 2.64%. The RIGHT fix is R6, and this one would have to be unpicked to
get there. **Filed, not taken.**

### 4.4 Make `lookup` a single probe per scope level — NOT YET

`lookup` does `T.scopes[i].has(name)` then `T.scopes[i][name] ?? -1`: two probes per level.
Collapsing to one is exact **only if no scope ever stores -1**, and `declare(name, ty)` is
called from 30+ sites with type-arena indices that are not all provably non-negative
(`elemTy` from a `for…in` over an unresolved element type is the concrete doubt). This is
the same fix that WAS taken for `parentLetOf` (§6.3), where the writer is one function whose
first line proves the value non-negative. **Filed with the reason it is not the same
one-line change**, so nobody "finishes the job" from the diff shape alone.

---

## 5. The phase plan

Each phase states its measured target on the profile that will exist when it starts, not on
this one — **re-baseline before targeting** is the program's law and §0 is what happens when it
is obeyed.

| phase | content | target on the post-§6 profile | gate |
| --- | --- | ---: | --- |
| **2** | `compiler/symbols.vl` (R1) + `sidNode` carrier (R3) + the eight notifications (R4) + the first consumer set that satisfies R5: `capIsBound`/`capHas`/`capScan`'s `bound`/`caps` and the capture cache | ~0.6% — **the carrier is the deliverable, not the number** | collision poison (R8), fixpoint, corpus A/B, fuzz A/B |
| **3** | R6 over `globalIndexOf`, `fnIndexOf`, `parentLetOf` — the three whole-program name→index maps, once phase 2's carrier reaches their call sites | 6.2% | as above + the `fnNameMap` writer census |
| **4** | the checker: `lookup`'s scope chain, `declare`, `objFieldType`, `paramTypeNode` — the carrier has to reach `typecheck.vl` | 4.4% | as above |
| **5** | `modRenamed`: the merge's rename table. Note it must NOT hold ids for the names it is REWRITING (R2's consequence) — only the lookup side converts | 1.6% | fixpoint (the merge is what the ladder exercises hardest) |
| — | AST-carried ids (R3's rejected alternative) as the end state, if phases 2-4 prove the id worth carrying | — | — |

**Phase 2 is explicitly a foundation phase with a sub-floor number, and that is the reason it
did not ship here**: a foundation is worth installing when the phase that consumes it is
next, not four measurements earlier.

---

## 6. What shipped instead — and why the measurement demanded it

Four changes, none of which touch identity representation. Each is a strict
behaviour-preserving rewrite with its equivalence argument at the site.

### 6.1 `retCapturedMapShape`: the conjunction's cheap half, taken first — 4.35%

`emit_classify.vl`. The arm runs for EVERY return expression that is a bare identifier, and it
called `captureNamesOf(fe)`, which RE-WALKS the whole function body computing the capture set
whenever the capture cache is off (every classify pass runs before `capCacheBuild`).
**Measured: `captureNamesOf` is 4.35% of all samples and 100% of it is reached from this one
call site.**

The answer is a conjunction — the name is in the capture set AND its value kind is `"map"` —
and `captureValKind`'s own first line is `parentBindingOf(fe, name)`, returning `"i32"` when
that is -1. So `parentBindingOf(fe, name) < 0` already implies the whole arm is -3. Asking it
FIRST is exactly equivalent, evaluates no function the original did not evaluate on this path,
and is O(1) for a frame with no parent — every top-level function.

**This is the finding that re-ordered the arc:** `capScan`/`capRecord`/`capIsBound`/`capHas`
were 3.7% of the SYMBOL class, and they were not a representation problem. They were a call
that did not need to happen.

### 6.2 `emitReturnValue`: hoist `fnStmtsPosOf` — 4.34% of its 5.54%

`wasmEmit.vl`. Four separate `fnStmtsPosOf(fnIx)` calls in one function, all under
`fn.fnRet < 0`. `fnStmtsPosOf` is the O(functions) scan whose header files the honest fix as
"an index minted at the writers" and warns that a cross-call memo is a silent miscompile the
day a lower position holds a memoized node.

**The hoist is a strictly weaker claim than that memo** and it is the reason it is takeable
here: it needs `fnStmts`/`monoOrigNode` to be stable inside ONE call frame, not across the
emit. Both are written only by `emit_collect`'s collect passes and `emit_mono`'s replacement
writers, all of which complete before `emitCodeSection` begins.

**The filed index is NOT done and stays filed** — the remaining 2.27% is spread over
`retCapturedMapShape`, `emitFuncCode`, `retWidensAtomToStr` and the scope-chain walk, and the
header's argument about the writers is untouched. What this measurement adds to the filing is
that **three quarters of that scan's cost was one un-hoisted call site, not the algorithm.**

### 6.3 `nameNamesFunction`: fold the arena once instead of scanning it per call — 2.64%

`emit_base.vl`. "Is any FuncDecl named `name`?", answered by scanning every node in `P.nodes`,
2.64% self and **100% of it reached from `anonFieldCode`**. Now an incremental fold into a
name set with a high-water mark, which equals the scan given three facts pinned at their own
sites: the arena only grows; `addNode` takes a complete node so a FuncDecl's name is final at
append; and the one in-place `fnName` write that lands after a node is already in the arena
(`emit_collect`'s lambda numbering) calls the new `noteFuncName`.

**That third fact is R4's invariant in miniature, shipped early and on purpose** — it is the
same shape the carrier will need, at one writer instead of eight, and §6.4 poisons it.

`parentLetOf`'s double probe is folded into the same commit: `.has(name)` then
`[name] ?? -1` is two hashes and two key compares for one answer, and `plScanStmt`'s first line
(`if ix < 0 { return 0 }`) proves every stored value is >= 0, so `?? -1` is unambiguous. 1.64%
→ 1.39% of a smaller pie (−22% absolute).

### 6.4 `keywordKind`: dispatch on the first character — 0.76%

§4.1. The keyword set, the spellings and the `"IDENT"` default are unchanged.
`tests/cases/lexer/keyword-lookalike-identifiers.vl` pins the hazard the new shape introduces
— a name that shares a bucket with a keyword (`iff`, `typ`, `trues`, `fo`, 39 of them, at the
boundary lengths 1 and 9, as bindings and as parameter names).

### 6.5 Measured, together

Same input both legs (the branch tree), `.cwasm` warm, 24-core box, load 1.9-2.0, everything
at **interleaved min-of-21**. A = the master-built compiler (`1517c7f6`, 1,113,241 bytes),
B = the branch-built one (1,115,110).

Every one of the five changes is on the EMIT path, so `vl check` and `vl fmt` are not "hopefully
flat" controls — they are structurally flat, and any movement there is the measurement's error
bar rather than an effect:

| task | A | B | |
| --- | ---: | ---: | --- |
| **`vl build compiler/entry.vl`** (self-compile) | 1,544 ms | **1,372 ms** | **−11.1%** |
| `vl check compiler/entry.vl` (26-file graph) | 819 ms | 818 ms | −0.1% (control) |
| `vl check compiler/typecheck.vl` (one 22 K-line file) | 198 ms | 197 ms | −0.5% (control) |
| `vl fmt --check compiler` (whole tree) | 452 ms | 448 ms | −0.9% (control) |
| `vl check` of a one-function file | 4 ms | 4 ms | 0 (the load floor) |

The controls are flat to within 0.9% at N=21 and the headline is 12× that band. (At N=15 on a
noisier box the same controls read −1.5% and −1.6% — the #1313 lesson holds: **run the control
to the same N as the headline**, and an unconverged minimum invents an effect on exactly the
channel that must not move.)

**Guest profile, same input both legs, 12 warm runs each, run as interleaved A/B/A/B batches.**
Absolute samples PER RUN, because a share of a shrinking pie is not a saving:

| fn | A /run | B /run | delta |
| --- | ---: | ---: | ---: |
| `fnStmtsPosOf` | 97.8 | 40.9 | **−58%** |
| `nameNamesFunction` | 39.8 | 0.8 | **−98%** |
| `capScan` + `capIsBound` + `capRecord` | 32.7 | 6.2 | **−81%** |
| `__str_eq__` | 486.2 | 441.1 | −9.3% |
| `__str_hash__` | 102.3 | 93.6 | −8.5% |
| `__map_probe__` | 45.8 | 41.8 | −8.7% |
| SYMBOL consumer class (§1.1) | 341.0 | 293.5 | **−13.9%** |
| TOKKIND consumer class | 40.9 | 31.0 | **−24%** |
| **all samples** | **1,712** | **1,549** | **−9.5%** |

(The sampler is a 1 ms wall-clock timer, so the TOTAL is a time proxy that inherits the box's
load — the wall-clock A/B is the number to quote. The per-function deltas are an order of
magnitude outside that drift.)

**Byte delta:** the compiler is 1,113,241 → **1,115,110 bytes (+1,869)**, almost all of it the
`keywordKind` bucket chain.

### 6.5.1 The DETERMINISTIC counts — one instrument, both sides

Wall clock and a sampling profiler both have error bars; the work removed does not. A
throwaway compiler was built that runs **both** implementations at each converted site and
counts them, then reports through `emitFail` at the end of `emitProgram` (the guest has no
`print` that reaches a `vl build`, so the diagnostic channel is the one that works). One
self-compile of `compiler/entry.vl`, arena = **247,145 nodes**:

| site | BEFORE | AFTER | |
| --- | ---: | ---: | ---: |
| `nameNamesFunction` scan steps | **15,074,198** | **247,118** (one fold) | **61×** |
| — its calls, and the OLD-vs-NEW answer DISAGREEMENTS | 61 calls, **0 diverged** | | the differential oracle |
| `captureNamesOf` calls from `retCapturedMapShape` | **4,176** | **0** | the pre-gate skips **all** of them on this input |
| `fnStmtsPosOf` calls from `emitReturnValue` | **35,908** (4 × 8,977) | **8,977** | 4× |
| `fnStmtsPosOf` calls, whole compile | **46,037** | **19,106** | **−58.5%** |
| `parentLetOf` map probes | **1,590,610** | **795,305** | 2× |

**The counts corroborate the profile independently and closely:** the hoist removes 58.5% of
`fnStmtsPosOf`'s calls and the profile reads −58% of its self-time; the fold removes 98.4% of
its scan steps and the profile reads −98%.

Two numbers worth keeping beyond this PR. **`rcmsWalks` is ZERO** — on the compiler's own
source, not one of the 4,176 reaches into `retCapturedMapShape` needed the capture set at all,
which is the strongest possible statement of what §6.1 removed. And **`fnStmtsPosOf` still
runs 19,106 times for 25,953,420 scan steps (1,358 steps per call)** — that is exactly the
residue the filed index owns, now sized.

---

## 6.6 The sabotages — and the one that nothing caught

Six poisons, each built into a real compiler and run through the whole standing gate. The
column that matters is not "did it redden" but **which instrument reddened**.

| poison | self-compile | own fixpoint | corpus A/B (6 fields × 1,713) | suite |
| --- | --- | --- | --- | --- |
| **P1 COLLISION** — `nameNamesFunction`'s set keyed on `name[0]`, so `q` and `qq` share an entry | **rc 0** | **holds** | **0 diffs** | **0 failed of 3,608** — then **2 failed** once the new case below existed |
| P2 — delete the `noteFuncName` notification | rc 0 | holds | — | **0 failed** |
| P3 — `keywordKind` drops `is` (one bucket arm) | **rc 1** | — | — | **791 failed** |
| P4a — the `retCapturedMapShape` pre-gate as `> 0` instead of `>= 0` | rc 0 | holds | — | 0 failed (compiler bytes DO differ) |
| P4b — the pre-gate always false (the arm never runs) | rc 0 | holds | — | **32 failed**, 11 cases in `closures/`+`maps/` |
| P5 — the hoisted `fnStmtsPosOf` reads a stale position (`+1`) | **rc 1** | — | — | **675 failed** |
| P6 — `parentLetOf`'s miss reads as node 0 instead of -1 | **rc 1** | — | — | **75 failed** |

**P1 is the finding.** An identity table that conflates two distinct identifiers is the exact
failure mode this whole arc has to be safe against, and **every standing instrument was blind
to it**: the poisoned compiler compiles itself, IS A FIXPOINT OF ITSELF (so
`native-fixpoint.sh`'s stage3 == stage4 passes), produces byte-identical output for all 1,713
corpus files on all six channels, and passed all 3,608 tests the suite then had. The only trace it left was that
the compiler it builds from the compiler's own source is 14 bytes different from the good
one — which no gate compares, because on a branch the compiler is *supposed* to change.

The gap is now closed by construction:
`tests/cases/objects/anon-field-value-name-not-a-function.vl` is the minimal witness (`q`, an
i32 binding, beside `qq`, a function, both in one anon-struct literal). Under P1 it fails in
BOTH harnesses and names the defect —
`struct.new[0] expected type (ref 5), found global.get of type i32`. **R8 is not a
recommendation; it is what this table forced.**

**P2 is a stated vacuity.** Deleting the in-place-rename notification reddens nothing, because
the only names it can add are `__lambda_<n>` and nothing ever queries that spelling. The line
stays, and the site says so, so a future green run does not license its deletion.

**P4a is a warning about poison design.** Weakening the pre-gate from `>= 0` to `> 0` looked
like a sabotage and is very nearly a no-op: the only binding it drops is one at arena node 0.
It moved four bytes of the compiler and no test. **Characterise a sabotage before believing its
witness table** — the same lesson #1313 recorded from the other direction. P4b is the honest
version and it is the one that gives §6.1's reorder its coverage number: 32 tests over 11
cases stand behind that arm.

---

## 7. Re-verifying each headline

| headline | probe |
| --- | --- |
| the 12-run baseline and its top-20 | `perf-program.md` §2's `VL_PROFILE_GUEST` recipe, ≥5 warm runs, strip `$mNN` |
| the CONSUMER-CLASS split (19.59 / 9.13 / 2.47 / 1.21) | walk each string-primitive self-sample up past `__map_probe__`/`__str_eq__`/`__str_hash__` to the first non-primitive frame and classify it; keep an UNCLASSIFIED bucket and print it — the TOKKIND class was found there |
| "`captureNamesOf` is 100% reached from `retCapturedMapShape`" | for each sample, find the OUTERMOST occurrence of the target on the stack and attribute its caller (recursion counted once) |
| "`nameNamesFunction` is 100% from `anonFieldCode`" | same probe |
| the −11.1% | interleaved min-of-21 `vl build compiler/entry.vl` on the two compilers, with `vl check`/`vl fmt` as controls run to **the same N** — an unconverged minimum invents a regression on exactly the channel that should be flat (they read −1.5%/−1.6% at N=15 and −0.1%/−0.9% at N=21) |
| the per-function deltas | samples PER RUN, not self-% — the pie shrank by 8.8%, so every share moved |
| the eight name-writer sites (R4) | `grep -n '\.identName = \|\.fnName = \|\.letName = \|\.parName = \|\.frVar = \|\.fiVar = ' compiler/*.vl` |
| behaviour preservation | six-channel corpus A/B (all six fields `same` over 1,714 files), the 3-stage fixpoint ladder, `SELFHOST_NATIVE_ALIGN=1 deno task test`, multi-seed fuzz A/B |
| the collision poison reddens | §6.4 of `perf-program.md` §8 — key `nameNamesFunction`'s set on the first character of the name and run the ladder |
