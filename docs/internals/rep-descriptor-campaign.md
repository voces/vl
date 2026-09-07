# One rep per node — the classifier census, the descriptor, and the conversion order

The emitter answers *"what representation does this value have?"* in **519 places**. This
document is the measured inventory of those places, the definition of the single descriptor
they are to become projections of, the oracle that grades each conversion, and the order the
conversions run in.

Owner-approved 2026-09-06. It is the CONSUMER half of `ROADMAP.md`'s
`repOf(type) → descriptor` unification (item B/3), whose producer half — `emit_rep.vl`'s
`RepDesc`, the recursive `Rep` tree, the `$fnsig` seam and the slot layer — already shipped.
**Nothing in this document proposes building a second descriptor.** `repOfTy` exists, is
already `_`-less exhaustive over the eleven arena variants, and is already `vtKindOfType`'s
first rung. What has never been measured is the population on the other side of that seam,
and that is what starts here.

---

## 1. The measured inventory

`scripts/rep-classifier-census.py` derives the population from the tree. A function is a
REP CLASSIFIER when both halves hold:

* **LADDER** — its body tests one subject against ≥ 2 members of a closed rep vocabulary:
  `is Ty*` over the arena's variants, `is <NodeKind>` over the AST, a `VKind` string literal,
  a `match` over either, or the PREDICATE form (`retNulRefFlag(…)`, `nameIsMap(…)`) in which
  no kind literal appears at all. The floor of two arms is `ladder-census.py`'s, for its
  measured reason (D1370's two-arm hole).
* **REP-ISH** — the ANSWER is a representation: a declared `VKind`, an interned slot or
  heap-type index, a name used as a table key, or a boolean naming a rep family.

One exception to the arm floor, and it is the census's own control: **a function whose
DECLARED return is `VKind` is admitted at any arm count**, because its answer *is* the rep by
its type. `retResultVKind` is why — one `VKind` literal and THREE producers
(`vtKindOfType(fn.fnRet)`, the `fnReturnsClosure` predicate, the `fRetKind` table), which is
the exact shape this census exists to find and which an arm count cannot see.

Quoted verbatim, run on `b7a666856` (the merge-base):

```
$ python3 scripts/rep-classifier-census.py --summary
population        2949 top-level functions in scope
classifiers       519
call sites        2962
vocabularies      VKind 31 members · Ty arena 11 variants

by result class
  VKIND         52 classifiers     367 call sites
  VKIND-LIT    170 classifiers     935 call sites
  SLOT          63 classifiers     285 call sites
  REPNAME       40 classifiers     179 call sites
  REPBOOL      194 classifiers    1196 call sites

by ladder shape
  ARENA-IS      42
  NODE-IS      204
  VKIND-LIT    157
  PREDICATE     86
  MATCH         10

by what it READS (DIRECTLY; a classifier may read several, so the sets are not disjoint)
  ARENA        138 classifiers     903 call sites
  NAME         117 classifiers     635 call sites
  SPELLING      28 classifiers     156 call sites
  TABLE        132 classifiers    1149 call sites
  FRAME        223 classifiers    1739 call sites

the pairs that matter — a rep answered from two different producers
  ARENA + NAME         33
  ARENA + SPELLING     10
  ARENA + TABLE        33
  NAME + TABLE        40
  ARENA + FRAME        46

by file
  compiler/emit_classify.vl     356 classifiers    2397 call sites
  compiler/wasmEmit.vl           59 classifiers     143 call sites
  compiler/emit_collect.vl       31 classifiers      60 call sites
  compiler/emit_rep.vl           22 classifiers     122 call sites
  compiler/emit_base.vl          16 classifiers     117 call sites
  compiler/emit_mono.vl          11 classifiers      33 call sites
  compiler/emit_sections.vl       8 classifiers      10 call sites
  compiler/emit_query.vl          7 classifiers      46 call sites
  compiler/emit_bytes.vl          6 classifiers      31 call sites
  compiler/emit_rewrite.vl        3 classifiers       3 call sites
```

### The `reads` column, and the one instrument result worth keeping negative

The column is DIRECT: what the classifier's own body reads. That understates by construction
— `vtKindOfType`'s first rung is `annRepKindOf`, which reads the arena, so the direct column
calls the canonical arena-vs-name classifier NAME-only. `--deep` closes the column over the
call graph, and **the answer is that it saturates**:

```
$ python3 scripts/rep-classifier-census.py --summary --deep
  ARENA        420 classifiers    2484 call sites
  NAME         346 classifiers    2277 call sites
  SPELLING     339 classifiers    2262 call sites
  TABLE        363 classifiers    2363 call sites
  FRAME        331 classifiers    2233 call sites
```

330-odd of the 519 read all five producers transitively. That is not a finding about the
classifiers, it is a finding about the closure: **the transitive column cannot discriminate
and must not be quoted as evidence.** The DIRECT column is the one that separates a
classifier which decides from a spelling from one that decides from the arena. `--deep`
stays in the script so nobody re-derives that conclusion by hand.

### The families

Grouped by name prefix, one line each, from the same run:

| family | classifiers | call sites |
| --- | --- | --- |
| `expr*` | 48 | 927 |
| `ty*` | 25 | 69 |
| `ret*` | 20 | 94 |
| `letIs*` | 18 | 100 |
| `arr*` | 17 | 75 |
| `rep*` | 16 | 108 |
| `union*` | 16 | 107 |
| `clo*` | 15 | 78 |
| `scalar*` | 12 | 55 |
| (every other prefix) | 332 | 1349 |

`expr*` is **31% of every classifier call site in the emitter** and is one question asked
48 ways: `exprIsF64(e, fn)`, `exprMap(e, fn)`, `exprRefArray(e, fn)`, `exprNullableStruct(e,
fn)` — one predicate per rep, each a `NODE-IS` ladder with its own arm order.

---

## 2. The premise, re-graded

The campaign was proposed on the reading that the last week's defects "are almost all one
family answering differently from another for the same node". **Graded row by row, that is
true of six of twenty-one.** The 24 ids named in the brief are 21 rows — the ids 1791, 1792
and 1793 name nothing, and are skipped rather than deleted — and they fall out as:

| what it actually was | rows |
| --- | --- |
| two rival producers, both named, disagreeing about one node's rep | **6** — D1748, D1750, D1768, D1783, D1784, D1785 |
| the monomorphizer's flat-vs-scoped name resolution: ONE lookup answering the template | **5** — D1781, D1782, D1788, D1795, D1817 |
| two consumers reading ONE find at two different times | 1 — D1786 |
| something never minted, rendered or reserved (single producer, no rival) | 5 — D1763, D1780, D1790, D1794, D1827 |
| capture set resolved against the wrong frame | 1 — D1789 |
| cross-program compiler-state lifetime | 1 — D1820 |
| a formatter span anchor; a missing checker refusal | 2 — D1787, D1819 |

The correction matters, because the second row is the largest single family and it is **not**
a rep-table defect. `fnIndexOfSid` is a flat, first-occurrence-wins name→slot map; a per-pin
clone shares its template's name; every one of those five rows is that map answering the
template where the instance was asked. The fix in all five was the same — resolve through
`fnIndexOfInScopeSid`, which walks `fnParent` and (since #2840) `fnInstOrigin`.

**So the descriptor has two jobs, not one**, and section 3's KEY is where they separate.

---

## 3. The descriptor and its key

### 3.1 What exists

`emit_rep.vl` declares `RepDesc` and `repOfTy`:

```vl
type RepDesc = {
  rdCovered: i32,
  rdKind: VKind,
  rdNul: i32,
  rdSlot: i32,
  rdSigTok: string,
  rdListElem: string,
}
```

`repOfTy(ty)` is tree-primary over `repOfTyFlat(ty)`, and `repOfTyFlat` is a **`_`-less
exhaustive `match` over the eleven `Ty` variants** whose four rep-less arms (`TyVar`,
`TyLit`, `TyErr`, `TyNeg`) fall to `repUncovered()` — a NAMED default with a written contract
("this shape's rep is not derivable; the consumer keeps its legacy path"), not a bare
fall-through. It already satisfies CLAUDE.md's ladder rule; a twelfth arena variant breaks
the self-compile there rather than being answered silently. **No totality work is owed.**

### 3.2 The fields, and the producer each one still has beside the descriptor

| field | what it is | the OTHER producers of the same fact today |
| --- | --- | --- |
| `rdKind` | the `VKind` member | `vtKindOfType` (annotation ladder, 25 rungs), `fRetKind` (return table), `tyKindOf` (i32 code vocabulary — **converted by this PR**), `fbValtype` (31-arm valtype ladder), `declaredKind`, `globalCellKind`, `capturedKindOf`, `cloRetValKind`, `sigKeyRetKind`, `calleeRetKindSid`, and the 48 `expr*` predicates |
| `rdNul` | how `null` is encoded (ref niche / i32 sentinel / boxed tag) | `retNulRefFlag`, `retNulStringFlag`, `retNulListFlag`, `retNulRefArrFlag`, `retNulMapFlag`, `retNulVariantFlag`, and the six `exprNullable*` predicates |
| `rdSlot` | the interned table slot | `repSlotOfTy` (its own home), `structIndexOfExpr`, `structIndexByName`, `rlSlotByName`, `mvSlotOf*`, `exprVariantIndex`, `uVarHeap` |
| `rdSigTok` | the `$fnsig` token | **none** — `repSigTokOfKind` is the single home, and the seam is COMPLETE (ROADMAP item 3) |
| `rdListElem` | the list-element vocabulary | `nodeArrayElemName`, `arrElemIsClosureTy`, `rlElemName`, `fRetRArrElem` |
| `rdCovered` | the strangler's own coverage flag | — |

`rdSigTok` is the campaign's proof of concept: it is the one field with exactly one producer,
and it got there by the same route this document proposes for the rest.

**Two fields the descriptor does not yet carry**, both named here so a later slice does not
invent a second record for them: the **heap type index** (derived per family from `rdSlot`
today) and the **box/tag shape of a union** (its member SEQUENCE, positional tags, in the
`unMem*` tables — and never to be deduped or reordered, per the standing member-set ABI note).

### 3.3 The KEY — and where the pin context enters

**`repOfTy`'s key is an arena type index, and that is enough.** After monomorphization an
instance's body carries the instance's own types: `monoMakeInstance` resolves each pin once
into `pinnedTyIx` ("the pin is resolved once, here at the clone, and never re-resolved from
its spelling"), so a POST-mono arena index already names the instance's rep. The pin context
is NOT part of the descriptor's key.

**The pin context is what turns a NAME or a NODE into a type**, and that is where the
five-row family of §2 lives. Precisely:

* a **frame** is an `fnStmts` position (a "lifted slot"), obtained from an arena `FuncDecl`
  index by `fnStmtsPosOf(fnIx)`. `fnIx` and the frame are two different index spaces and the
  campaign must never conflate them: `fnParent`, `fnInstOrigin`, `fnEnvIdx`, `monoInstFe`,
  `monoGen` are all indexed by the frame, and every classifier takes `fnIx`.
* the **calling frame** (#2815) is that `fnIx`, threaded into a reader that previously took a
  bare sid, so it can resolve through `fnIndexOfInScopeSid(sid, name, fnIx)` instead of the
  flat `fnIndexOfSid(sid)`.
* **`fnInstOrigin`** (#2840) is the frame chain's second link: `export let fnInstOrigin: i32[]`,
  per lifted slot, the origin slot of a monomorphized instance or `-1`. An instance's slot
  declares none of its origin's nested functions, so the scope walk continues there where
  `fnParent` ends. Without it the walk runs off the end and falls through to the flat map —
  an in-band answer with nothing marking it a guess (D1817).

So the campaign's key is **two keys**, and saying so is the design:

```
repOfTy(ty)                 → RepDesc          ty is a post-mono arena index
repOfNode(nodeIx)           → RepDesc          nodeIx is resolved to a ty by the checker
repOfName(name, fnIx)       → RepDesc          fnIx is the PIN CONTEXT: name → frame →
                                               fnIndexOfInScopeSid → declaration → ty
```

The third does not exist yet and is the campaign's real new surface. Its whole content is the
frame walk, and every one of the five monomorphizer rows is a site that should have called it.

**This is where the plan could have been refuted and was not.** A descriptor keyed on the
type alone would be untotal if any classifier's answer genuinely depended on something
outside the type — and the FRAME column of the census (220 classifiers, 1,734 call sites)
looks exactly like that dependency. Measured, it is not: the frame is consumed to find *which
declaration a name means*, never to change the rep of a type once found. 459 of
`emit_classify.vl`'s 1,404 functions take `fnIx`, and **11 across the emitter already mark it
unused** with the underscore convention (`_fnIx`: 4 in `emit_classify.vl`, 4 in `wasmEmit.vl`,
2 in `emit_query.vl`, 1 in `emit_mono.vl`) — the frame rides the signature for uniformity.

---

## 4. The two-producer agreement oracle

### 4.1 What it is

Every converted call site computes BOTH answers — the ladder's and the descriptor's — and
records the PAIR. A family is graded **0 CONTRADICT over the corpus** before its ladder is
deleted.

The implementation is `repABNote` / `repLadderABSweep` in `compiler/emit_classify.vl`. It is
keyed on the pair itself (`family ladder -> descriptor`), so a new family needs no slot
arithmetic and the report names the exact disagreement rather than counting one. The buckets
that matter:

| bucket | meaning |
| --- | --- |
| **AGREE** | the two answered the same thing (or both declined) |
| **CONTRADICT** | both answered a real rep, and they differ — **the only bucket that can be a defect** |
| **LEFT-ONLY** | the ladder answered, the descriptor declined — a coverage gap in the descriptor |
| **RIGHT-ONLY** | the ladder declined, the descriptor answered — a carve-out the conversion must keep, or a widening it may take |

`LEFT-ONLY` and `RIGHT-ONLY` are **not** defects and must not be reported as any. A `-1` from
a ladder means *"I decline; another route owns this"*, and its consumers compare `== <code>`,
so a decline is a "no", not a wrong answer.

### 4.2 How it is armed, and why it cannot poison the seed

It rides the EXISTING `$VL_REP_SHADOW` harness — `setRepShadow`, exported through
`compiler/entry.vl`, called by the host when the variable is set, reported back through
`repShadowAddReason`. There is no new host code and no new environment variable, and the
sweep runs beside `unionRegistryABSweep()` in `emitProgram`, in the one window where the arena
is final.

That answers CLAUDE.md's instrumented-compiler hazard directly. The failure mode there is a
probe whose *behaviour* is unconditional, so `refresh-compiler.sh` bakes it into the next
seed. Here:

* the oracle costs **one boolean test** (`if repShadowOn`) on the unarmed path, which is every
  build the gates and the seed refresh make;
* it emits no bytes into the module under any arming — it writes to a report table the host
  reads back after the compile;
* the seed a normal build produces is therefore the uninstrumented compiler's, and the only
  price is the scaffolding's own size. Measured for this PR: **+2,715 bytes, +0.12%**, against
  a ratchet that reds at +3%.

The tell CLAUDE.md gives for a poisoned seed (`cmp` against a pristine build, not `ls -l`)
still applies and is what the byte-identity A/B in §5 performs.

### 4.3 Running it

```sh
VL_REP_SHADOW=1 vl build <program> -o /dev/null 2>&1 | grep 'repAB'
rep-shadow[…]: unsup repAB/tyKindOf i32 -> i32 x165
```

Over a corpus, the aggregate is what is quoted; the driver is four lines of `xargs` and the
buckets of §4.1.

---

## 5. Conversion order, and the proof obligation each family owes

### 5.0 The conversion bar — restated, because a candidate was refused on it

Two shapes a conversion can take, and only one of them is safe by construction.

* **DOMAIN-KEEPING.** The function's own gate — the test that says *which shapes it speaks
  for* — stays, and only the rep ANSWER moves to a descriptor projection. `tyKindOf` is this
  shape: it kept `is TyPrim` / `is TyArray` and its literal-union carve-outs, and took the
  kind from `repOfTy`. Nothing that used to reach the function reaches it differently.
* **DOMAIN-REMOVING.** Rungs are deleted, so a shape the ladder used to name now falls to its
  default. This is safe only under one of two conditions, and *neither is "no observed
  counterexample"*:
  * **(D1) the domain is provably unreachable** — no input can reach the deleted rung, by
    construction; or
  * **(D2) the default is NAMED** — an `emitFail`, a sentence, or a delegation to the ladder
    that owns the rest, so a shape the ladder no longer names cannot receive a valid-looking
    answer for a different rep.

**Byte identity does not settle a domain-removing conversion**, and §6.3 is the measurement
that proves it. Nine of `vtKindOfType`'s rungs are reached 201,576 times, always agree with
the descriptor, and never appear in the LEFT-ONLY bucket over 10,734 modules. Deleting all
nine is byte-identical in both populations — and takes the oracle from **CONTRADICT 2,963 to
204,539**, because the ladder's domain is *an annotation node the checker recorded no type
on*, where `annRepKindOf` declines by construction. Those rungs are not dead. They are
untested: neither corpus contains an un-typed node of those shapes.

**And the bar is two-sided: DOMAIN-WIDENING is unsafe too.** §6.4 is that instance. A
ladder's decline is not an absence of an answer — it is an answer, routed to a producer that
knows something this one does not. Letting the descriptor answer wherever it covers, which
reads like a strict improvement, cost **eight `tests/cases` modules `rc=0 → rc=1`** at the
field-code family. Byte identity caught it; the oracle could not, because the oracle grades
the ANSWER where both producers speak and this was a disagreement about WHO speaks.

So the bar is: **delete a ladder only under D1 or D2, widen its domain never, and otherwise
keep the domain and move the answer.** A conversion that cannot meet the deletion bar is
still worth doing in the domain-keeping shape — the second producer stops being able to
*disagree*, which is the precondition for ever deleting it.

### 5.1 The proof obligation, stated once

Every conversion owes all five, and the first is the one that decides:

1. **The oracle: 0 CONTRADICT** over `tests/cases` and the distilled corpus, with the ladder
   and the candidate projection compared side by side *before* anything is deleted.
2. **Byte identity** of the emitted module over both populations — both arms built from ONE
   seed, compared on sha256 and exit code, never on file size.
3. `scripts/silent-sweep/distilled/regress.py`: **0 `runs → not-runs`, 0 `→ silent`**.
4. `scripts/rep-fuzz-check.sh` exact — mandatory; the corpus and the fixpoint are both blind
   to REJECT→MISMATCH.
5. `scripts/mono-tyaram-grid.sh` no BAD — for anything that touches the pin context.

A conversion that cannot be byte-identical is not thereby refused; its price must be NAMED,
measured on `regress.py`'s `runs` column, and carried in `named/`.

### 5.2 The order, re-ranked by the bar

Each row says which SHAPE a conversion there takes and what its domain's oracle coverage is
today. "Coverage" is the LEFT-ONLY measurement: how often the ladder answers where the
descriptor declines, which is exactly how much of the domain the descriptor cannot yet take.

| # | family | shape | its DOMAIN | coverage today |
| --- | --- | --- | --- | --- |
| 1 | `tyKindOf` — the i32 code vocabulary | domain-KEEPING | scalars and arrays, arena-gated | ✅ DONE, 0 CONTRADICT, byte-identical |
| 2 | `repOfNameResult` — the name surface | new surface | a NAME plus the calling frame | ✅ DONE, closes D1834 |
| 3 | `vtKindOfType`'s annotation ladder | domain-REMOVING | an annotation node the checker did NOT type | 🟡 15 kinds LEFT-ONLY, **147,945** queries. Deletion REFUSED (§6.3); five missing arms added, CONTRADICT 2,963 → 178 |
| 4 | the field-code ladders — `fieldCodeOfTy` and its spelling siblings | domain-KEEPING | `fieldCodeOfTy` answers `-2` = *"the spelling ladder owns the rest"* — a NAMED decline, so the domain is explicit | ✅ **DONE** (§6.4): 0 CONTRADICT over 58,428 queries, byte-identical, a FOURTH numbering scheme collapsed into one `fieldCodeOfVKind` table. The domain-WIDENING variant was refused at a price of 8 modules |
| 5 | the valtype writers — `fbValtype`, `fbValtypeNullable`, `fbRefNullOfKind`, `fbRefNullForKind` | consumers of a `VKind`, not classifiers | a `VKind` member plus its slot | ✅ **DONE** (§6.5), and it corrected this row: a QUARTET not a trio, `fbHeapIdxForKind` does not exist, and three of the four were already `_`-less `match` tables. The fourth is now one too |
| 6 | the `expr*` family — 48 classifiers, 931 call sites | domain-REMOVING for its node arms; its ANSWERS mostly already projected | an EXPRESSION node, which the arena may not have typed | 🟡 AUDITED and its residue converted (§6.8): **0 magic rep codes, 89% already `VKind`**, and the 14 raw `fRetKind[fe]` reads now go through `repOfFnSlot`. The 2 left are `localLitUnion`, the literal-union carve-out |
| 7 | `repOfName` for BINDINGS | new surface | a name plus the frame it is READ in → the declaration → its type | **BLOCKED, and §5.3 states the blocker and the change it needs**: `declaredSlotOf` takes a bare name; `paramTypeNode` and `globalLetOfSidIn` take `fnIx` only as a *frame-binds-this-name veto*. Callee resolution has been frame-aware since D1781; binding resolution never was |
| 8 | the slot layer — 183 producers over four banks, plus a 13-function consumer rim | **producers: domain-critical, needs the descriptor; rim: consumer** | a nominal table row, whose bank the KIND selects | 🟡 the rim is DONE (§6.6); the producers are the next phase's, blocked on item 7 like item 6 — 54% of them decide a rep from a type or a node, and none is a `match`, because they produce the kind rather than switch on it |

**Item 6 is the largest and it is domain-removing, which is the whole reason item 7 comes
first.** An `expr*` predicate's arms are syntactic — a literal, a call, an index read — and
several of them exist precisely because the arena has no type for that node. Deleting them
would hand every such node the ladder's own default. The domain-keeping half is available
today and is what item 6 should do: keep each predicate's node ladder and replace the arms
that re-derive a rep from a NAME or a TABLE with a descriptor projection, one axis at a time.

**Item 4 was next because it is the only remaining family whose domain is already NAMED.**
`fieldCodeOfTy` returns `-2` meaning "I decline; `nameFieldCode`'s spelling ladder owns the
rest", and `nameFieldCodeTy` already calls it first — the strangler seam was built. Converting
its answer therefore could not remove a domain; §6.4 records that it could still WIDEN one,
which is the half of the bar this family added. **Item 5 is next**, and it moves with what
item 4 left: `fbValtype` and its three siblings translate `VKind` into the valtype/heap
vocabulary, which is now the only rep numbering scheme with no single translation table.

---

### 5.3 The binding surface — the blocker as stated, and its REFUTATION

> **REFUTED 2026-09-07, by witness.** This section was written from the SHAPE of three
> signatures and it was wrong about all three. Binding resolution is already frame-correct;
> there is no missing walk and no surface owed. §6.7 has the evidence — four witnesses, twenty
> printed values, every one right on master. What is below is kept because the *reasoning* it
> records is the trap, not because its conclusion stands: **a signature that does not take a
> frame is not thereby frame-blind.** The pin is
> `tests/cases/scope/binding-resolution-is-frame-correct.vl`.

Item 6 (`expr*`, 48 classifiers, 927 call sites) is the campaign's largest family and its
`Ident` arm is the reason it is blocked. This section states the blocker precisely so the
prerequisite is settled before anyone starts item 6, rather than discovered inside it.

**Callee resolution is frame-aware; binding resolution is not.** That asymmetry is the whole
blocker, and it has been true since D1781 gave callees the scope chain:

| | how a NAME resolves today | frame-aware? |
| --- | --- | --- |
| a called function | `fnIndexOfInScopeSid(sid, name, fnIx)` — walks `fnParent`, then `fnInstOrigin`, then falls back to the flat map | **yes**, since D1781/D1817 |
| a bound value | `declaredSlotOf(name)` → `localDeclIx[slot]` → the `LetDecl`'s type | **no** |

**There is no single function that maps a name plus a frame to a binding's arena type.** Every
classifier that needs one rebuilds the same ladder, and the most complete instance in the tree
is `litAtomMemberTyAt` (`compiler/emit_classify.vl`), whose steps are:

1. `nodeTyIxOf(unwrapParen(ix))` — the checker's own record, tried first. **Blind exactly where
   the pin-context family bites**: a monomorphized clone shares its template's leaf expression
   nodes, so the recorded type is the TEMPLATE's.
2. `declaredSlotOf(name)` — `compiler/emit_classify.vl:8133`. `scopeSlotOf(name)` first, then a
   flat linear scan of `localNames`. **A bare name, no frame argument.**
3. `localLoopIter[slot]` — a `for-in` element has no declaration node; recurse into the iterable.
4. `localDeclIx[slot]` — `compiler/emit_state.vl:409`, the `LetDecl` arena index. Its own header
   already states why the slot is load-bearing: *"a monomorphized instance keeps its only
   concrete type at the declaration, since every leaf expression node stays shared with the
   generic body — the slot is the only route to it."*
5. `d.letType >= 0` → `nodeTyIxOf(d.letType)` (or `annRowOfNode` where canon may have rewritten
   the spelling); otherwise recurse into `d.letInit`.
6. `paramTypeNode(fnIx, name)` — `compiler/emit_query.vl:778`. It TAKES `fnIx` and uses it only
   as a veto: its second line is `if scopeSlotOf(name) >= 0 { return -1 }`.
7. `globalLetOfSidIn(fnIx, sid)` — `compiler/emit_classify.vl:1439`, same veto shape.

Two scoped variants already exist for cases the flat slot scan gets wrong — `frameLetOfLive`
(`:1409`) and `startBlockLetOfSid` (`:26090`) — which is the tell that the flat scan is known
to be insufficient and is being patched per site rather than replaced.

**The change: one scope-chain walk keyed `(name, frame)`**, the binding twin of
`fnIndexOfInScopeSid`, and `repOfName` as its descriptor projection:

```
bindingDeclInScope(sid, name, fnIx) -> the LetDecl arena index, or -1
repOfName(name, fnIx)               -> repOfTy of that declaration's type
```

**The precedent exists and so does its trap.** #2629 already built a `(name, frame)` key for
the covariant-write analysis: `cwDeclare` / `cwDeclSlotOf` / `cwFrameDeclares` /
`cwFrameOfUse`, with an open-addressed `(frame, sid)` membership table and a memo keyed on the
pair (`cwRootNames` beside `cwRootFrames`, so two functions' same-named handles get two rows).
That is the shape to copy. **The trap is that the two halves of the compiler mean different
things by "frame", and both are spelled `i32`:**

* #2629's frame is a `FuncDecl` **arena node index**, with `CW_FR_MOD = -1` for module scope
  and `CW_FR_UNKNOWN = -2` matching everything.
* `fnIndexOfInScopeSid`'s frame is an **`fnStmts` position**, reached from `fnIx` by
  `fnStmtsPosOf`, and it is the vocabulary `fnParent`, `fnInstOrigin`, `fnEnvIdx` and
  `monoInstFe` are all indexed by.

The binding walk must be in the SECOND vocabulary, because the chain it has to follow —
parent frame, then an instance's origin frame — lives only there. Mixing them is a defect the
type system cannot catch, and naming it here is the point of this section.

**What it unblocks, and what it does not.** With `repOfName` built, `repOfExpr`'s `Ident` arm
is a projection and item 6's four axes become domain-keeping conversions. It does **not** make
item 6 a deletion: an `expr*` predicate's other arms are syntactic — a literal, a call, an
index read — and several exist precisely because the arena has no type for that node. By §5.0's
bar those arms stay.

---

## 6. What Part 2 measured — the first conversion, graded

`tyKindOf` was converted with the oracle comparing the surviving ladder against the candidate
projection at every call, over both populations.

**The oracle, ladder vs projection** — measured on `fbfe3ff40`, the tree the conversion was
written against, because the comparison needs the ladder still present and the ladder is now
deleted. The byte-identity below is re-run on the MERGED tree and is the current reading:

```
tests/cases (3,145 modules)
queries                2998252
  AGREE                2998252
  CONTRADICT           0
  LEFT-ONLY            0
  RIGHT-ONLY           0

distilled corpus (7,589 cells)
queries                368695
  AGREE                368695
  CONTRADICT           0
  LEFT-ONLY            0
  RIGHT-ONLY           0
```

**3,366,947 of 3,366,947 queries agree, over 10,734 modules.** The ladder was then deleted.

**Byte identity** on the MERGED tree (`b7a666856` + this change), both arms built from one
seed — `A` from the merge-base's source, `B` from the candidate's — and every emitted module
compared on sha256 and exit code:

```
files A=3148 B=3148
DIFFERING FILES: 0
files A=7589 B=7589
DIFFERING FILES: 0
```

The candidate compiler is 2,289,457 bytes against the merge-base's 2,286,742: **+2,715
(+0.12%)**, all of it the oracle scaffolding, since the conversion itself emits no byte
differently.

### The disagreements master already carries, and why none of them is a row

Before the conversion, the oracle compared the LADDER against `repOfTy`'s raw answer — the
question "do master's two producers of this fact agree?". Over `tests/cases`:

```
queries                2998252
  AGREE                2718657
  CONTRADICT           0
  ladder-only          2448     (descriptor uncovered)
  descriptor-only      177236   (ladder declined)
  neither              99911
```

**CONTRADICT is 0.** No inventory row is owed by this family: the two producers never both
answer and differ. What they do is decline in different places, and both directions are
already-written policy rather than defect:

* `ladder-only`, 2,448 queries in 6 classes, headed by `i32 -> uncovered` × 1,503 in 48
  modules — the **numeric literal-union base collapse**. `type N = 1 | 2` reps as its base
  scalar; `repOfTyFlat`'s `TyUnion` arm deliberately declines it ("the atom-vs-base split is
  alias-ness, checker metadata rather than structure"). The conversion keeps the collapse as
  an explicit leg, and **§10's first ruling is exactly this line**.
* `descriptor-only`, 177,236 queries in 20 kinds — `struct`, `union`, `closure`, `map`,
  `reflist`, every nullable niche. The ladder never spoke for those shapes and its consumers
  compare `== <code>`; answering a code they have no arm for would be a new answer, not the
  same one. The conversion keeps the decline as the function's stated DOMAIN.

Two of those declines are carve-outs written into the converted function and cited to §10,
because a ruling could retire either:

* `void` — the one prim `repOfTy` reps (as the ladder fallthrough `i32`) and this vocabulary
  never has: a void expression has no arithmetic width to report.
* a **string literal-union array element** — the interned i32 atom, which `repOfArray` reps as
  the i32 `list` and this vocabulary has never claimed.

---

### 6.2 The name surface — `repOfNameResult`, and what it did NOT need to be

The five pin-context rows (D1781, D1782, D1788, D1795, D1817) each rebuilt a piece of one
resolution by hand. Converting them onto a single surface answered a question this document
could only guess at in §3.3: **only two of the five wanted a rep at all.**

| row | what its rung actually wants | served by |
| --- | --- | --- |
| D1788, D1781 | the REP of the call's result | **`repOfNameResult`** — new |
| D1782 | the `fnStmts` SLOT a binding's target resolves to | `fnIndexOfInScope`, already one home |
| D1795 | the `$fnsig` KEY of a function value | `fnIndexOfInScope` + `fnSigKeyOf`, already one home |
| D1817 | the walk itself | `fnIndexOfInScopeSid`'s `fnInstOrigin` hop, already one home |

So the surface this campaign owed is narrower than "a rep for a name": it is **the rep of what
calling a name in a frame yields**, and the walk under it was already unified. `repOfName` for
a BINDING is a different and larger surface — `declaredSlotOf` takes a bare name, and
`paramTypeNode` / `globalLetOfSidIn` take `fnIx` only as a frame-binds-this-name veto rather
than as a scope-chain walk. That asymmetry (callee resolution frame-aware since D1781; binding
resolution not) is what `repOfExpr`'s `Ident` arm will have to reconcile, and it is filed here
rather than guessed at.

**What it is.** `repOfNameResult(sid, name, fnIx) -> RepDesc` is the one home for the walk and
for the three return columns that answer after it — `fRetKind` into `rdKind`, `fRetStructIdx`
into `rdSlot`, `fRetRArrElem` into `rdListElem`. The columns are pushed together in
`buildFnMap`'s single loop over `fnStmts`, so an index valid for one is valid for all three;
reading them together is what makes this a descriptor rather than three lookups that can
drift. `rdNul` is `REP_NUL_UNANSWERED` (-1), not 0: these columns carry no null discipline,
and a 0 would read as one.

**Fourteen readers became projections of it**, and the two `#2815` left behind gained the
calling frame in the same move — which is the whole of D1834's fix.

**The oracle at this surface compares the FLAT map against the frame-aware walk**, so a
disagreement is one site where a per-pin clone would have adopted its template's rep:

```
tests/cases (3,150 modules)          distilled corpus (7,589 cells)
  slot differs                3669     slot differs                   0
  … and the KIND differs       814     … and the KIND differs         0
```

Every one of the 814 is in one of eight modules, and all eight are the pin-context fixtures
themselves — `nested-capture-per-pin-container-kinds`, `-return-kinds`, `-clone`,
`nested-lambda-in-generic-body-per-instance`, `pin-argument-recheck-ok`,
`nested-named-fn-names-enclosing-typaram`, `nested-concrete-shadows-generic-homonym`, and one
body-scope shadowing fixture. **No inventory row is owed by the oracle**: the contradictions
are the walk doing its job, not a defect, and no site outside the known family contradicts.

**Byte identity**, both arms from one seed: `3,154 of 3,155` `tests/cases` modules and
`7,589 of 7,589` corpus cells identical. The one differing file is D1834's own fixture, `rc=1`
on the merge-base and `rc=0` here — the conversion itself moves no byte, and the fix is
observable only on the fixture it ships with, because no existing module had the shape.

### 6.3 `vtKindOfType`'s ladder — five missing rungs closed, and a deletion REFUSED by its own oracle

The doc's §5.2 item 2 said the work here is "widening `repOfTy` coverage until the fallback is
unreachable, then deleting it". Measured, that sentence is half right, and the half that is
wrong cost a candidate.

**The measurement.** With the ladder computed beside the descriptor at every call, over
`tests/cases` and the distilled corpus (10,734 modules, 1,082,293 queries):

| | queries | kinds |
| --- | --- | --- |
| AGREE | 931,385 | — |
| LEFT-ONLY (ladder answers, descriptor declines — the ladder is load-bearing) | 147,945 | 15 |
| CONTRADICT (both answer, differently) | 2,963 | 6 |

The LEFT-ONLY column is the descriptor's real coverage gap and is headed by `reflist`
(111,683 queries in 876 modules), `i32` (17,358), `map` (4,437), `union` (3,358) and `str`
(3,233). **Nine kinds appear in AGREE and never in LEFT-ONLY** — `struct` (117,609), `i64`
(42,355), `closure` (15,574), `variant` (8,547), `f32` (5,619), `nulstr` (4,805), `u8list`
(3,176), `nulclosure` (2,804), `f32list` (1,087), **201,576 queries** — which reads exactly
like nine dead rungs.

**The deletion was built, and its own oracle refused it.** Deleting all nine is
byte-identical — `0 of 3,154` `tests/cases` modules and `0 of 7,589` corpus cells — and the
two ordering pairs it touches (`nulclosure` before `closure`, `variant` before `struct`) are
wholly inside the dead set, so no surviving rung changes what it sees. And then the oracle
reads **CONTRADICT 2,963 → 204,539**: with the rungs gone, the ladder answers its `"i32"`
default for all nine shapes, which is a valid-looking answer for a different rep at every one
of them.

**So "the descriptor always answers first" is not the deletion criterion.** The ladder's
domain is *an annotation node the checker recorded no type on*, and for such a node the
descriptor cannot answer by construction — `annRepKindOf` declines exactly there. The nine
rungs are therefore not dead, they are **untested**: neither corpus contains an un-typed node
of those nine shapes. Byte identity proves nothing breaks today and says nothing about the
domain, which is why the deletion criterion has to be *unreachability* or *a named default*,
not *no observed counterexample*. `tyKindOf` was safe to convert because it kept its DOMAIN
and moved only the rep answer; this would have removed the domain.

**What shipped instead is the fix the same measurement names.** Five of the six CONTRADICT
classes are the five nullable scalar-list niches — `string[] | null`, `f64[] | null`,
`i64[] | null`, `f32[] | null`, `u8[] | null` — for which the ladder had **no rung at all**,
so each fell past every nullable arm to the `"i32"` default. `nulScalarListKindOfNode` is the
predicate the local, param and global ladders already ask, and asking it here is what makes
the two producers agree:

```
BEFORE  AGREE  931385  LEFT-ONLY  147945  CONTRADICT   2963  (6 classes)
AFTER   AGREE  934170  LEFT-ONLY  147945  CONTRADICT    178  (1 classes)
```

Byte-identical in `3,154 of 3,154` and `7,589 of 7,589`. **It is hygiene, not a `runs` move**:
no program was found that reaches the ladder at those shapes, and the arm's own control is the
oracle, where it fires 2,785 times.

**The one class left is the literal union, again.** `str -> i32` in two modules
(`narrowed-litunion-param-atom-rep.vl`, `narrowed-litunion-fn-value-arg.vl`) — the ladder
would say `str` because canon softens the member set to `string`, while the descriptor says
the interned atom. It **cannot** be closed from the ladder's own domain: at an un-typed node
the softened spelling is all there is, and the atom-ness is not recoverable from it. That is
`one-literal-union-rep`'s cost measured a second time, at a second site.

---

### 6.4 The field-code ladders — a domain-KEEPING conversion, and a domain-WIDENING one refused

The fourth rep numbering scheme: `fieldCodeOfTy` answers in 0/3/4/5/6/14/16/17/22/23/24/25/
26/27, spelled as fourteen constants at fourteen arms, with `-2` meaning *"the spelling ladder
owns the rest"*. `nameFieldCodeTy` already calls it first, so the strangler seam was built and
the domain was already NAMED — which is why §5.2 ranks it next.

**The oracle first.** Ladder against the candidate projection, over both populations:

```
queries 58428
  AGREE        52955
  CONTRADICT       0
  LADDER-ONLY   5114   (descriptor declines: `reflist`, 182 modules)
  DESC-ONLY      359   (ladder declines: `union` 312 in 91 modules, `i32` 47 in 10)
```

**CONTRADICT 0** — wherever both answer, they answer the same code. So the ANSWER is safe to
project; the two asymmetric columns are about the DOMAIN, and they are what decided the shape.

**The first candidate put the projection FIRST and lost eight modules.** Letting the
descriptor answer wherever it covers — which reads like a strict improvement, since the
ladder's decline only means "ask the spelling" — turns those 359 DESC-ONLY queries into
answers, and `compile(candidate, tests/cases)` goes from `rc=0` to `rc=1` at **eight
modules** — a `runs → not-runs`, which is the corpus gate's own veto:

```
arrays/return-nullable-niche-field-struct-array.vl
generics/union-projection-into-hole-param.vl
literal-unions/quoted-separator-in-litunion-member.vl
maps/map-value-nullable-litunion-field.vl
structs/nested-struct-vs-niche-fieldset-twin-closure-result.vl
structs/nullable-litunion-field.vl
unions/union-variant-nullable-field.vl
unions/variant-nullable-litunion-field.vl
```

**Six of the eight name a NULLABLE field and four name a LITERAL UNION**, which is the same
question a third time: `repOfNullable` reps a nullable scalar as the value-union box, the
spelling ladder codes a nullable literal-union field differently, and the ladder's decline is
what routes the field to the producer that knows which. That is `one-literal-union-rep`'s
price at a third site, and it is the sharpest form of it — here the ruling is worth eight
running programs.

**So the bar is two-sided, and this is its second worked instance.** §6.3 refused a
domain-REMOVING conversion; this one refuses a domain-WIDENING one. A ladder's decline is not
an absence of an answer — it is an answer, routed to a producer that knows something this one
does not. **Keep the domain: neither remove it nor widen it.**

**What shipped** keeps every arm as a DOMAIN gate and replaces only the constant it returns:
`if t is TyPrim { return fieldCodeOfDesc(ty) }`, and the same for the nullable-closure, bare
closure and scalar-element-array arms. The five `return 5` element arms stay constants — two
of them (`TyArray` and `TyMap` elements) are exactly the descriptor's LADDER-ONLY column — and
`void` keeps its decline, since the descriptor reps it as the ladder fallthrough `i32` and a
void field has no storage. The fourteen constants become one `fieldCodeOfVKind` table.

Byte-identical in **3,165 of 3,165** `tests/cases` modules and **7,589 of 7,589** corpus cells.
Seed **+120 bytes (+0.005%)**.

---

### 6.5 The valtype writers — the un-gated member of a QUARTET, and a de-duplication refused

The doc's own §5.2 called this family "the last numbering scheme with no translation table".
**That was wrong, and the correction is the first thing measured here.** `fbValtype` and
`fbValtypeNullable` are already `_`-less `match` tables over `VKind`; `fbHeapIdxForKind`, which
this list and the ROADMAP both named, **does not exist**. What the family actually has is:

* **four writers, not three.** `fbValtype`, `fbValtypeNullable`, `fbRefNullOfKind` and
  `fbRefNullForKind` all take `(kind: VKind, structIdx: i32)` and write bytes for it.
  `fbRefNullForKind`'s own comment calls itself *"the third member of the kind/slot pairing
  trio"* — stale by one, and the miscount is why the fourth was never audited with the others.
* **one of the four is not gated by the language.** Three are `_`-less `match`es; `fbRefNullForKind`
  is an `if`/`else if` chain ending `else { wSLEB(aTypeIdx) }` — the array heap type, handed to
  any `VKind` member with no arm. Its own comment already admitted it: *"the one an
  exhaustiveness check does not cover (an `if`-chain)"*.
* **a dead arm.** The chain tests `kind == "variant"` twice — once at the top paired with
  `nulvariant`, once again 25 arms later with a bounds check of its own. The second is
  unreachable.

**The oracle does not apply to this family, and saying why matters.** These four do not
CLASSIFY — they consume a `VKind` some classifier already produced. There is no
descriptor-versus-ladder comparison to make, so the differential harness has nothing to
measure. The instrument that fits is the LANGUAGE's own exhaustiveness check, and it is
strictly stronger: a `_`-less `match` is verified over the whole 31-member set at compile time,
where the oracle samples two corpora.

**What shipped** is `fbRefNullForKind` as a `_`-less `match`, with the five scalars
(`i32`, `nulbool`, `i64`, `f64`, `f32`) named rather than left to the fall-through — a scalar
cell holds no ref to null, so its operand is a placeholder no consumer reads as a heap type —
and the dead second `variant` arm gone. Byte-identical in **3,165 of 3,165** `tests/cases`
modules and **7,589 of 7,589** corpus cells; the seed **SHRINKS 113 bytes**, and
`kind-ladder-incomplete` falls by one in `emit_bytes.vl`.

**And a de-duplication was built and refused, by three ratchets at once.** All four writers
carry a byte-identical 14-line bounds guard over the same six slot-bearing kinds — the textbook
case for one predicate. Extracting it to `fbSlotUnresolved(kind, structIdx)` compiles, is
byte-identical, and shrinks the seed by 685 bytes. It also:

* takes **`sentinel-index-unguarded` from 0 to 21** in `emit_bytes.vl`. The lint's contract is
  *within one function*, so moving the bound test behind a helper leaves twenty-one table reads
  with no comparison the checker can see — and that lint exists because four compiler TRAPS in
  one day were exactly this shape;
* takes **`kind-ladder-incomplete` from 1 to 2**, because the extracted predicate is itself an
  `if`-chain over `VKind` with a bare `false` default;
* trips **`comment-block-too-long`** three times.

**The duplication was carrying something.** Each copy is the evidence a per-read lint needs at
the read it guards, and folding four copies into one removes the evidence, not the risk. This
is the campaign's bar in a third form: after *do not remove a domain* and *do not widen a
domain*, **do not move a guard out of the reach of the checker that verifies it.** The
candidate is kept in the record rather than shipped, with its price in the three ratchet counts.

---

### 6.6 The slot layer — what it IS, and why only its rim converts

The last family on §5.2's list, surveyed before anything was touched. **It is not one family;
it is a large PRODUCER family with a thin CONSUMER rim, and only the rim is this phase's work.**

**Four banks, and a slot is meaningless without the kind that says which bank it indexes.**
Every table is a set of parallel columns in `compiler/emit_state.vl`:

| bank | key column | the heap-type column | cross-bank pointers into it |
| --- | --- | --- | --- |
| A — structs | `sNames` (`:643`) | `sHeapIdx` (`:670`) | `mvValStructIdx`, `uVarSTwin` |
| B — ref lists | `rlElemName` (`:739`) | `rlWrapIdx` (`:763`) | `mvRlSlot` |
| C — union variants | `uVariants` (`:1028`) | `uVarHeap` (`:1045`) | `mvValVariantIdx` |
| D — map values | `mvValName` (`:804`) + `mvKeyI32` (`:808`) | `mvMapTypeIdx` (`:825`) | — |

That cross-bank column is the whole reason a per-`VKind` "which table" dispatch exists at all,
and it is why the kind and the slot are one fact rather than two.

**The asymmetry that makes this a producer family.** Each bank has **one to five WRITERS** (all
heap indices are assigned in a single pass, `mAssignTypeIndices`) and **100–174 read references**.
And the resolvers are many: **183 producer declarations** — 57 struct, 36 variant, 39 ref-list,
51 map-value — split by what they take:

| input | count | share |
| --- | --- | --- |
| an AST node (`exprIx` / `letIx` / `objIx` / `tyIx`) | 77 | **42%** |
| a rendered NAME | 36 | 20% |
| an already-resolved slot | 34 | 19% |
| an arena type (`ty: i32`) | 22 | 12% |

**54% decide a rep from raw input** — which is what a descriptor could answer instead.

**Why the `_`-less `match` is not the instrument here, and neither is deletion.** Not one
producer is a `match` at all, and that is correct: **they have no kind to switch on — they
PRODUCE the kind.** Their bodies are if-chains ending in `-1` and table scans, and that `-1`
tail is load-bearing everywhere ("the caller keeps its name path", "the rendered rung runs
instead"). By §5.0's bar every one of them is a domain-critical conversion of the kind item 6
is: it needs the descriptor, not an exhaustiveness check, and the descriptor needs the binding
surface §5.3 specifies. **Converting them is the next phase's work, not this one's.**

Two hazards the survey names for that phase, both already flagged in the code's own comments:

* **Four producers clamp a miss to `0` instead of declining** — `letAnnRefListSlot`,
  `tyAnnRefListSlot`, and the clamps in `refListSlotOfExpr` and `globalRefListSlot`. The file
  says why it matters: *"0 is a wrong answer, not a missing one — two such globals would
  otherwise share slot 0's wrapper wrongly. D1040."* That is the in-band-sentinel shape, and
  `rdCovered == 0` is what replaces it.
* **The kind and the slot are derived by two separate ladders that must agree.**
  `annValtypeSlotOf` is documented as *"the one home for which interned table slot this
  annotation's `fbValtype` selects"* — and its kind-side counterpart is a different if-chain
  (`tyAnnRefListKind` / `globalCellKind` / `declaredKind`). D244, D1737, D1040 and D1106 are
  all that pairing failing. One descriptor returning `(kind, slot)` as one value removes the
  class.

**What converts here is the rim.** Thirteen consumers take a `VKind` and a slot together;
three were already `_`-less `match`es and a fourth became one in §6.5. The fifth and last is
`armDestHeapOf` (`compiler/wasmEmit.vl`, 13 call sites), an if-chain naming four of the
thirty-one members with a bare `-1` for the other twenty-seven — and its callers hand it a
`VKind` out of a table column (`fRetKind[fnPos]`, `localIsRef[slot]`) beside a slot out of
another (`fRetStructIdx[fnPos]`, `localStructIdx[slot]`), which is the pairing hazard above at
its own call sites. It is now a `_`-less `match` with the twenty-seven declining members named.

**Its risk was materially lower than §6.5's and the doc should say so rather than claim a
scalp.** `fbRefNullForKind`'s bare default wrote `aTypeIdx` — a well-formed heap type for a rep
that is not an array. `armDestHeapOf`'s is `-1`, an out-of-band decline its callers already
test. The conversion buys the compile-time gate, not a bug fix: a 32nd `VKind` member is now an
error here instead of a silent decline.

Byte-identical in **3,172 of 3,172** `tests/cases` modules and **7,589 of 7,589** corpus cells;
seed **+14 bytes**.

**One cost of the instrument, worth naming**: `vl fmt` has no wrap for a long or-pattern, so a
`_`-less `match` naming twenty-seven declining members is one 250-column line. That is the
formatter's canonical form (`fmt --check` is clean), and it is the price of using the language
gate over a 31-member set — the same question `fmt-fill-style-scalar-lists` was ruled on for
list literals, one construct over.

---

### 6.7 The binding surface — REFUTED by witness, and what that leaves

§5.3 specified a surface `expr*` was said to be blocked on: one `(name, frame)` scope-chain
walk, because `declaredSlotOf` "takes a bare name with no frame" and `paramTypeNode` /
`globalLetOfSidIn` "take `fnIx` only as a veto". **Phase 2 opened by testing that with
programs instead of building on it, and all three claims are false.**

**Four witnesses on master, twenty printed values, every one correct.**

| witness | what it stresses | result |
| --- | --- | --- |
| three frames binding `v` at four reps, two of them monomorphized instances | `declaredSlotOf` | `9 · 2 · z · 1.5` |
| a parameter read from a per-pin clone, which shares its template's leaf nodes | `paramTypeNode` | `9 · 2 · z · 1.5` |
| a module `let` read, shadowed, captured, and mutated between reads | `globalLetOfSidIn` | `7 · local · 7 · 11 · 11 · local` |
| two same-named locals at different reps in ONE frame (sibling blocks); a global shadowed only inside a nested BLOCK | `dupSlotBias`, `frameLetOfLive` | `3 · 4 · 100 · 7 · 12` |

**The mechanism, per route:**

* **`declaredSlotOf(name)` is frame-scoped by its AMBIENT table.** `localNames` is *"rebuilt
  per function"* (`compiler/emit_state.vl:335`), so the table it scans belongs to exactly one
  frame. The frame is the table, not a parameter.
* **`paramTypeNode(fnIx, name)` is frame-EXPLICIT.** It reads `P.nodes[fnIx]`'s own parameter
  list. Its `if scopeSlotOf(name) >= 0 { return -1 }` opener is not a missing walk — it is the
  correct answer that a local shadows the parameter.
* **`globalLetOfSidIn(fnIx, sid)` is frame-aware** through `identBoundInFrame(fnIx, name)`,
  itself a three-rung walk: `localIndexOf`, then `capturedKindOf`, then `frameLetOfLive` off
  the arena for the passes where `localNames` is empty.

**Why the analogy to the callee case failed, which is the transferable part.** A CALLEE needs
an outward walk because two lifted functions can share a name and `fnIndexBySid` is a flat,
first-occurrence-wins map — the walk exists to beat that map. **A binding has no flat map.**
`localNames` is per function, `globalLetOfSid` is module scope, and the enclosing-frame case
is a CAPTURE, which `capturedKindOf` already owns. The two are not duals, and §5.3 reasoned
from the shape of three signatures rather than from what they resolve against.

**The rule this earns**: *a signature that does not take a frame is not thereby frame-blind* —
the frame can be ambient in the table it reads. Checking costs one program per claim, and here
it cost four programs to avoid building a surface nothing needed.

**What is actually owed, and it is smaller.** Three readers each wrote out the same two-rung
walk — `declaredSlotOf(name)` then `localDeclIx[slot]`, with their own bounds guards. That is
duplication, not a defect, and it is now `bindingDeclInScope(name)`. **Its signature carries
the finding: it takes no frame argument**, and its header says why. Byte-identical in
**3,173 of 3,173** `tests/cases` modules and **7,589 of 7,589** corpus cells; seed
**−41 bytes**.

**And this de-duplication is safe where §6.5's was refused — the distinction is sharp enough
to state as a rule.** `sentinel-index-unguarded` reads **373, unchanged**, because the table
READ moved into the helper together with the guard that bounds it. §6.5's candidate moved the
guard and left twenty-one reads behind. So form three of the bar refines to: **de-duplicate a
guard only by moving the READ with it; moving the guard alone removes the lint's evidence and
not the risk.**

**What the surface does NOT unblock — the question §6.6 left open.** None of the four
clamped-to-`0` slot producers is reached by it. `letAnnRefListSlot`, `tyAnnRefListSlot`,
`refListSlotOfExpr` and `globalRefListSlot` clamp a **ref-list TABLE miss** (`rlSlotByName`
finding no row), not a name-resolution miss — a different question with a different producer.
Their fix is `rdCovered == 0` reaching the ref-list slot layer, which is the descriptor's job
and still blocked on nothing but the work itself. That is a correction to §6.6's own
"named next step", made here rather than left to mislead.

---

### 6.8 The `expr*` family — the count and the suitability point in OPPOSITE directions

§5.2 ranks this family first among what is left: **48 classifiers, 931 call sites, 31% of every
classifier call site in the emitter.** Phase 2 started it, and the first thing to measure was
which member to convert.

**By the census's own criterion — most disagreeing producers — the answer is
`exprIsLitAtom`: three producers (ARENA + FRAME + TABLE), eight arms, and 71 call sites, the
most-called `expr*` classifier in the tree.** It is also, measured, the WORST target in the
family. Every one of its rungs is *specifically about* the atom-versus-string rep, and its own
comment states the reason: *"a literal union's type does not carry its rep"*. Its answer is the
one the descriptor **cannot** give until `one-literal-union-rep` is ruled on. Converting it
would be almost entirely carve-outs. **A ranking by producer count does not rank by
convertibility, and this is the instance that shows it.**

**So the family was audited instead of picked over.** Every rep-ish site in all 48 classifiers,
classified by where its ANSWER comes from:

| | before | after | |
| --- | --- | --- | --- |
| **PROJECTED** — a producer this campaign converted (`tyKindOf`, `repOfTy`, `repOfNameResult`) | 10 (8.0%) | 10 (9.0%) | |
| **VKIND** — a comparison against a `VKind` member, already the one vocabulary | 99 (79.2%) | 99 (89.2%) | |
| **TABLE** — a raw read of a rep column | **16 (12.8%)** | **2 (1.8%)** | ← this PR |
| **MAGIC** — a bare integer rep code | **0** | **0** | |
| total sites | 125 | 111 | |

**The headline is the zero.** The `expr*` family carries **no magic-number rep codes at all**,
and 79% of its rep-ish sites were already `VKind` comparisons *before* this PR — because the
producers it reads from were converted in the first phase (`tyKindOf` in the census landing,
`repOfNameResult` with D1834, the field and valtype vocabularies after). **The family is not 48
unconverted ladders**; it is 48 node ladders whose answers mostly already come from converted
producers. §5.2's "largest family" is a call-site count, not a conversion backlog, and reading
it as the latter would have bought a large diff for nothing.

**What was genuinely left was 16 raw table reads, and 14 of them are one shape:**
`fRetKind[<fe>] == "<kind>"` — a lifted function's stored return kind, read straight out of the
column at fourteen sites across eleven classifiers, beside the descriptor that already owns
that column for a NAME. `repOfNameResult`'s tail is exactly that read, so it factors out:

```
repOfFnSlot(fe)                    the fe-keyed primitive — the three columns, one home
repOfNameResult(sid, name, fnIx)   = repOfFnSlot(fnIndexOfInScopeSid(sid, name, fnIx))
```

Every arm stays a gate on the node kind; only the ANSWER moves. **The two remaining TABLE reads
are `localLitUnion[slot]`**, the literal-union flag, and they stay for `exprIsLitAtom`'s reason
above — named here rather than converted, because the descriptor cannot answer them.

**Twelve of the fourteen sites read the column with no bounds test**; `repOfFnSlot` guards, so
an out-of-range slot now returns an uncovered descriptor where it would have trapped. Byte
identity says no program reaches that path, and `sentinel-index-unguarded` reads **373,
unchanged** — the read moved into the helper *with* a guard, which is §6.7's rule satisfied
rather than §6.5's violated.

**Oracle**, both populations, `repOfNameResult`'s flat-versus-scoped bucket after the refactor:
`tests/cases` CONTRADICT **918 queries in nine modules**, and **all nine are pin-context or
name-shadowing fixtures** — the modules where the two lookups MUST differ; the corpus reports
**0**. No new module contradicts, so **no row is owed**.

Byte-identical in **3,177 of 3,177** `tests/cases` modules and **7,589 of 7,589** corpus cells;
seed **−327 bytes**.

---

## 7. What the campaign's first phase measured

Six landings. This section is the phase's own scoreboard, and it is written so the next
reader can grade it rather than trust it — every number names the instrument that produced it
and the population it ran over.

### 7.1 Families converted

| family | shape | oracle | byte identity | seed |
| --- | --- | --- | --- | --- |
| `tyKindOf` — the i32 code vocabulary | domain-KEEPING | **3,366,947 / 3,366,947 AGREE**, CONTRADICT 0 | 3,148 + 7,589, all identical | +2,715 |
| `repOfNameResult` — the callee name surface | new surface | slot differs 3,669, KIND differs 814, all in the pin-context fixtures | 3,154 of 3,155 + 7,589 | +324 |
| `vtKindOfType`'s annotation ladder | domain-REMOVING; five arms ADDED, deletion refused | **CONTRADICT 2,963 → 178** over 1,082,293 queries | 3,154 + 7,589, all identical | +1,013 |
| the field-code ladders | domain-KEEPING | **CONTRADICT 0** over 58,428 queries | 3,165 + 7,589, all identical | +120 |
| the valtype writers | consumer family; `_`-less `match` | not applicable — no second producer | 3,167 + 7,589, all identical | **−113** |
| the slot layer's consumer rim | consumer; `_`-less `match` | not applicable — the producers have no kind to switch on | 3,172 + 7,589, all identical | +14 |
| the binding surface | REFUTED by witness; a de-duplication shipped instead | not applicable — four witnesses, twenty values, all correct on master | 3,173 + 7,589, all identical | **−41** |

**Net seed cost of the phase: +4,032 bytes (+0.18%)**, of which +2,715 is the census and
oracle scaffolding and the rest is four conversions. Every landing is byte-identical on both
populations except D1834's own fixture, which master cannot build.

### 7.2 Contradictions found, and what each was

The oracle's only actionable bucket is CONTRADICT — both producers answer, and differ. Over
the phase it fired twice and both were closed:

* **D1834**, the one real defect. `fnRetF32ArraySid` and `fnRetAnnF32ArraySid` were the two of
  sixteen return-kind readers still on the flat name map, so a per-pin clone returning `f32[]`
  adopted the struct pin's kind: `emitProgram: index access but array type not collected` on a
  `vl check`-clean program, with the f64 twin as the oracle. Fixed by the conversion itself.
* **The five nullable scalar-list rungs `vtKindOfType` never had.** `string[] | null`,
  `f64[] | null`, `i64[] | null`, `f32[] | null` and `u8[] | null` fell past every nullable arm
  to the `"i32"` default. 2,785 of the ladder's 2,963 contradictions, closed by one rung.
  Hygiene, not a `runs` move: no program reaches the ladder there today, and the arm's control
  is the oracle, where it fires 2,785 times.

`tyKindOf` and the field codes each graded **CONTRADICT 0** before conversion — the two
producers never both answered and differed, which is what made those conversions safe.

### 7.3 The bar, in the three forms the phase found it

Every one was found by building the candidate and being refused by an instrument, not by
argument:

| form | what was built | what refused it, and at what price |
| --- | --- | --- |
| **do not REMOVE a domain** | delete `vtKindOfType`'s nine rungs the descriptor always answers first (201,576 queries, never LEFT-ONLY) | the oracle: **CONTRADICT 2,963 → 204,539**. The ladder's domain is a node the checker did not type, where the descriptor declines by construction — the rungs are not dead, they are untested |
| **do not WIDEN a domain** | let the descriptor answer wherever it covers, at `fieldCodeOfTy` | byte identity: **8 modules `rc=0 → rc=1`**. A ladder's decline is an answer, routed to a producer that knows more |
| **do not move a GUARD out of reach of its lint** | fold the valtype quartet's four identical bounds guards into one predicate (byte-identical, −685 bytes) | three ratchets, headed by **`sentinel-index-unguarded` 0 → 21**. That lint's contract is *within one function*, and it exists because four compiler traps in one day were this shape |

**And a fourth thing the phase learned about its own instruments.** Byte identity and the
oracle are not interchangeable: the oracle grades the ANSWER where both producers speak, so it
was blind to the domain-widening candidate; byte identity measures only what the two corpora
reach, so it was blind to the domain-removing one. A conversion needs both, and where the
input is already a `VKind` it needs neither — the language's `_`-less `match` is stronger than
either, being checked over the whole member set at compile time.

### 7.4 The two rulings, with their measured cost

Both are in `docs/internals/open-rulings.md` §D with options, peers and a recommendation.

* **`one-literal-union-rep`** — a literal union's rep is decided by ALIAS-NESS, not by its type.
  Cost measured at **three sites and growing**: 1,503 queries in 48 modules at `tyKindOf`; the
  **only surviving contradiction** in `vtKindOfType`'s whole ladder, unclosable in its domain;
  and **eight running programs** at the field-code family. The third is the first denominated
  in programs rather than queries. Every family converted after this one inherits the carve-out.
* **`nullable-rep-rule-stated-once`** — `rdNul` has four disciplines and `VKind` eleven nullable
  members, picked between arm by arm. Recommendation: gate it now with a `_`-less `match`,
  state it once when the valtype layer is revisited.

### 7.5 The next phase, and its stated prerequisite

The largest family is untouched and deliberately so: **`expr*`, 48 classifiers over 927 call
sites, 31% of every classifier call site in the emitter.** It is domain-REMOVING by §5.0's bar.

**It is NOT blocked on a binding surface** — §5.3 said it was and §6.7 refutes that by witness:
binding resolution is already frame-correct by three separate routes, and the surface §5.3
specified is not owed. What `expr*` needs is the descriptor reaching an expression node, and
what stands in the way is only the work itself: each of its four axes is a domain-keeping
conversion of arms that decide a rep, beside syntactic arms that must stay because the arena
has no type for their nodes. **The next family can start; it just cannot start by deleting.**

---

### 7.6 The clamped-to-`0` ref-list slot — STEP 1 MEASURED, and it narrows four producers to one

§6.6 named four producers that turn `rlSlotByName`'s honest `-1` into slot `0` — a real row
with a real wrapper heap type, which is what D1040, D1106 and D1500 each cost. §6.7 corrected
who unblocks them. **Step 1 is now measured rather than reasoned, and it removes three of the
four from the hazard.**

**Which clamps actually fire.** A probe in each clamp path, armed by `$VL_REP_SHADOW` and
reported through the campaign's own bucket channel, over `tests/cases` (3,177 modules) and the
distilled corpus (7,589 cells):

| producer | calls | CLAMPED | modules |
| --- | --- | --- | --- |
| `tyAnnRefListSlot` | 166,759 | 106,256 — **every one `notRefList`** | 7,015 |
| `refListSlotOfExpr` | 187,095 | **197** | **29** |
| `globalRefListSlot` | 3,602 | **0** | 0 |
| `letAnnRefListSlot` (its own non-`LetDecl` tail) | — | **0** | 0 |

**Three of the four are not the hazard, and each for a different reason:**

* **`tyAnnRefListSlot` clamps constantly and correctly.** Its 106,256 fires split
  `CLAMPED-isRefList` **0** / `CLAMPED-notRefList` **106,256**: the annotation is not a ref
  list at all, so `0` is this function's honest "no row of mine", not a wrong slot. The
  ref-list case — the one that would be D1040's shape — **never clamps** across 10,766
  modules. Its comment reads as though it were the hazard; it is not.
* **`globalRefListSlot`'s clamp is DEAD.** `if s < 0 { return 0 }` fires zero times.
* **`letAnnRefListSlot`'s bare-`0` tail is DEAD** on the same evidence.

**So the live clamp is exactly one: `refListSlotOfExpr`, 197 fires across 29 modules** — seven
in `tests/cases` (`list-concat-every-rep`, `list-eq-every-rep`,
`eq-concat-type-param-under-constructor-runs`, `place-narrowed-array-element-emit`,
`place-narrowed-nullable-array-element`, `array-needle-nullable-niche`,
`array-struct-list-needle`) and 22 corpus cells. **Every one of them RUNS today**, so the
hazard is latent rather than live — which is why it needs a measurement rather than a bisect.

**Those 29 modules ARE the control**, and they are a better one than a synthetic program: they
already make the walk miss, they are re-graded by the corpus gate on every PR, and the probe
attributes each miss to its producer. A hand-written candidate is not free to get right — a
plain `P[] == P[]` plus `P[] + P[]` calls `refListSlotOfExpr` 37 times and clamps **zero** of
them, so the miss needs a narrowed element or a nullable niche, which is exactly what five of
the seven `tests/cases` modules already spell.

**And its 74 call sites, classified** (`scripts/refslot-consumer-census.py`, which reads the
tree so the split is re-derivable):

```
call sites: 74 {'GUARDED': 35, 'BLIND': 31, 'DIRECT': 8}
```

* **35 GUARDED — and every one of those guards is DEAD.** They compare a value the clamp
  guarantees is never negative. This is the in-band-sentinel shape exactly: a helper answering
  `0` for "cannot answer" makes every caller-side guard unreachable, so the code *looks*
  defended and is not. Narrowing the clamp is what turns these 35 back into live guards, and
  it is the strongest single argument for doing it.
* **31 BLIND** — the value flows into an index, a writer or a record with no test. **These are
  the clause-1 risk and they move FIRST.** Narrowing the clamp before they can take a decline
  converts a silent wrong slot into a trap, which is §6.4's mistake in the other direction.
* **8 DIRECT** — returned straight out; the caller's caller owns the question.

**What step 2 looked like from here — and §7.7 is what happened when it was built.** It read
as 31 call sites, one at a time, each made to take a decline before the clamp narrows — not a rewrite of the four producers, three of
which are now known not to need one. **Step 3 (widening `repOfTy`'s `rdSlot` to bank B) is not
needed for step 2 either**: the consumers here take an `i32` slot, so the decline they must
learn is an explicit `-1` test, and only a consumer that is already a descriptor reader would
want `rdCovered == 0`. Saying which is which per site is step 2's own first move.

**The probe stays in the tree**, armed-only and costing one boolean test unarmed, because
"which clamps fire" is a standing question and this measurement is the only thing that
separates the one live clamp from the three that are not.


---

### 7.7 Step 2 was VETOED, and the veto named the NAME — right that far, wrong about why

§7.6 set the order: convert the 31 BLIND consumers so they can take a decline, then narrow
`refListSlotOfExpr`'s clamp. Step 2 was built in a scratch tree to find out which consumers
step 1 owes. **The answer inverts the plan.**

**Narrowing the clamp costs exactly one module of 10,767.**

```
tests/cases   files A=3178 B=3178   DIFFERING FILES: 1
distilled     files A=7589 B=7589   DIFFERING FILES: 0
```

The one is `tests/cases/std/array-needle-nullable-niche.vl`, **`rc=0 → rc=70`**:
`the emitted module failed to validate inside `indexOf$m1$4`: type mismatch: expected i32,
found (ref null $type)`. Six of the seven `tests/cases` control modules and all 22 corpus
cells survive the narrowing unchanged, printing what they printed. **Nothing traps** anywhere
in either population, so no consumer indexes a table with `-1` — which is the reassuring half
of the result and says the 31 BLIND sites are not reached with a miss by any program we have.

**And the failure is not a consumer that cannot take a decline.** A probe on the name the walk
looks up says so directly: in that module `refListSlotOfExpr` clamps **28 times, and the name
is the EMPTY STRING every time.** So `rlSlotByName("")` misses, and the miss is not *"no row
exists"* but *"the name that would have found it was never rendered"*. The clamp then hands
back slot **0**, which is the right row here — so the program compiles and prints correctly.
**The clamp is load-bearing, and load-bearing by luck.**

**The cause this section then inferred is wrong, and §7.8 is the measurement that refutes it.**
It read the empty name as a type variable rendering as `""` — D1794's shape at a new position —
and named the fix as the pin (`pinnedHoleTyOf` / `pinResolvedFnTy`). A probe at the clamp
reports the opposite: the monomorphizer has already rewritten the instance's annotations to
concrete spellings, and the pin is not merely unread but **POISONED**, because `holePinTys` is
keyed on the type-variable NAME alone and every generic in `std:array` calls its variable `T`.
The name is empty for two ordinary reasons in the walk itself, neither of them a `TyVar`.

That is the D1040/D1106/D1500 shape seen from the other side: an in-band sentinel silently
*saving* a program instead of silently breaking one, and equally invisible either way.

**Why step 1 cannot rescue it.** With the clamp narrowed, an explicit `-1` test at the
consumer turns this module from check-clean invalid wasm into a loud refusal — still
`runs → not-runs`, still the veto. **The blocker is the NAME**, and its fix is D1794's:
a generic body's element resolved through the pin the instance banked
(`pinnedHoleTyOf` / `pinResolvedFnTy`), consulted only where the direct render declined.

**And the other 30 BLIND sites cannot be converted honestly yet.** No program in either
population reaches them with a miss, so a decline added there is dead code no test exercises —
and the campaign's bar grades a conversion by measurement, not by intention. They convert when
the narrowing can validate them, which is after the name is fixed.

**So the order §7.6 set is right and its first step is different from what it named:**

1. **Resolve the element name in a monomorphized generic body.** Until then the clamp cannot
   narrow. (§7.8 does this; the mechanism is not the one this list originally named.)
2. Then narrow, which is the only thing that makes the 31 declines testable and turns
   §7.6's **35 dead guards** back into live ones.
3. `repOfTy`'s `rdSlot` reaching bank B remains step 3 and is needed by neither.

**One thing this section does NOT do, deliberately: file the row.** Three minimisations of the
238-line fixture were written and run, and **none reproduces** — a nullable-struct element, a
nullable i32-list element and a nullable-closure element each run identically on both
compilers, so the shape needs more of the fixture's six-rep combination than has been
isolated. A row whose `Repro` does not reproduce is worse than no row (D957 is that mistake),
and the `filed witnesses` gate would run it and grade it wrong. **Minimising this witness is
the first task of the next lane**, and the row follows the program, not the other way round.


---

### 7.8 Step 2 LANDS — the empty name was two declining rungs, not a type variable

§7.7's veto was correct and its diagnosis was not. Probing the clamp instead of reading the
code around it gives the input directly, and it says the pin is the wrong place to look.

| what the probe reads at each of the 14 clamps in the minimised witness | value |
| --- | --- |
| `self`'s rewritten param annotation | `(i32[][]\|null)[]` — **concrete** |
| `needle`'s rewritten param annotation | `(i32[][]\|null)` — **concrete** |
| `pinnedHoleTyOf` of the node's own type | **POISONED (-2)** |
| `paramRefArrayName(fnIx, "self")` | `i32[][]\|null` — **resolves** |

**The pin is poisoned rather than missing, and that is structural, not incidental.**
`holePinTys` is a `{[string]: i32}` keyed on the type-variable NAME across the whole program;
`notePinnedHole` poisons a row to `-2` the moment two calls disagree. Every generic in
`std:array` names its variable `T`, so `T` is poisoned in any program using two of them. This
is the alias-set defect (#2629) one layer down — a table keyed on a NAME where the question is
`(name, frame)` — and it means the pin route §7.7 named could not have worked here.

**The two real rungs, both in `refListElemNameOfExpr`, both about a NULLABLE ref list:**

* The `Index` arm asks `nameIsArray(outer)`. `outer` resolves correctly to `i32[][]|null`,
  whose last two characters are `ll`, so the nested-array rung declines. The kind-18 nullable
  rung above it is gated on `narrowVariantFor`, and `indexOf` compares `self[i] == needle`
  with no null narrow.
* The `Ident` arm reaches `paramNulRefArray`, which asks the ARENA and answers **true**, then
  hands the SPELLING to `nullablePartOf`, which splits on a **depth-0** bar. The
  monomorphizer's grouped `(i32[][]|null)` hides the bar at depth 1, so it answers `""`.

The second is the campaign's own subject: **the arena and the name disagree about one type**,
one saying "nullable ref array" and the other refusing to decompose it. Both fixes are local —
peel the group before `nullablePartOf`, and give the `Index` arm the nullable-element rung its
narrowed sibling already has. `nullablePartOf` itself is untouched: it has 76 callers, and the
bar forbids widening a domain to fix one site.

**Measured, on the two populations §6.5 used:**

```
fix vs fix+narrowing   tests/cases 3182/3182   distilled 7589/7589   DIFFERING FILES: 0
master vs fix+narrowing tests/cases 3182/3182  distilled 7589/7589   DIFFERING FILES: 0
```

**Zero differing modules against master over 10,771 programs** — neither population contains a
program that reaches these rungs, which is why the gap was never filed and why §7.7's one
differing module was the only signal anywhere. With the names resolving, the narrowing is a
**no-op**: step 2 lands, and §7.6's 35 guards are live.

**And the gap is a real clause-1 defect, not only a blocker.** The clamp returns slot 0, which
is correct exactly while row 0 is this list's. Interning one unrelated ref list first displaces
it, and master then emits a **check-clean invalid module** (`vl check` rc 0, `vl run` rc 70).
That is [D1835](inventory/D1835.md), now closed, with the displacer in its fixture. Its
un-annotated face refuses earlier, in the monomorphizer, and is [D1836](inventory/D1836.md) —
open, and a reminder that the `redundant type annotation` hint is the checker agreeing about
the TYPE while three producers disagree about the REP.

**One consequence worth recording.** With the clamp gone, `refListSlotOfExprStrict` and
`refListSlotOfExpr` are the same answer — the clamp was the only thing that separated them —
so the strict one is now an alias. That is one classifier pair collapsed by removing a
sentinel rather than by building a descriptor, which is the cheaper half of this campaign.

---

### 7.9 The poisoned pin table — the owner goes on the ROW, and the defect is real but LATENT

§7.8 found `holePinTys` keyed on the type-variable NAME across the whole program, so two
generics that both call their variable `T` poison each other's row to `-2`. This is #2629's
alias-set defect one layer down — a table keyed on a NAME where the question is
`(name, owner)`.

**Threading the owner was measured and refused.** Neither banking site has the callee:
`substHoleTy` and `substHoleTyReal` take `(tyIx, bNames, bTys)`, and the checker's only ambient
is `curFnEscName`, which at a call is the CALLER. Threading one in reaches **210 functions**,
and the boundary is at 25:

| level | n | what it is |
| --- | --- | --- |
| 0 | 2 | `substHoleTy`, `substHoleTyReal` |
| 1 | 3 | `substTyDeep`, `holeMemberDeadAt`, `bankCoalHoles` |
| 2 | 20 | the `validate*Cstrs` family, `argPinRecheck`, `ufcsCallTy` |
| 3 | 7 | **`assignableGo`, `checkNodeReal`** and four call-check nodes |
| 4+ | 178 | everything, because level 3 reaches `assignable` and `checkNode` |

Eighteen of the 210 already carry one (`binCstrsHold` and `bankCoalHoles` take `calleeFn`, the
`monoInfer*` family takes `declIx`), so a partial route exists along the CONSTRAINT path and
stops dead on the `substTyDeep`/`assignable` path — the one the pin actually travels. A callee
argument on `assignable` is not a change this campaign should make.

**So the owner goes on the ROW**, where both sides already have what they need: `tyVarOwner`
is filled at the four `mkTyVar` sites, and `pinnedHoleTyOf(tyIx)` reads it off the row it is
already holding. The key is `holePinKey(owner, tvName)`, shaped exactly like `holeWriteKey`'s
`"!w!" + fnName + "!" + tvName`, whose own comment states this defect verbatim for the
array-write demand table — **the compiler solved this once already and the pin table never got
the treatment.** So does `paramHoleName`: an un-annotated parameter's hole is named
`"?" + fnName + "." + i`, owner-qualified by construction, which is why only the DECLARED type
parameter was ever exposed.

**Keying on `tyIx` alone is refuted, so nobody re-proposes it.** `addTy` does not intern, so
each `mkTyVar("T")` mints a distinct row — which looks like a free fix. It is not:
`tpEnvTys.push(mkTyVar(typarams[i]))` is pushed and popped per ANNOTATION RESOLUTION, so one
function's `T` holds several rows and a `tyIx` key would fragment a true conflict into rows
that never see each other, losing a real poisoning.

**The census, instrumented and graded against two controls** (one function's `T` pinned twice
must read TRUE; two functions' `T` must read FALSE) — the controls were run first, and the
first instrument put every event in `unknown`, because `curFnEscName` is empty at the mint:

| population | false BEFORE | false AFTER | files with a false poisoning |
| --- | --- | --- | --- |
| `tests/cases` | 9,192 events | **0** | 102 -> **0** |
| distilled corpus | 11,994 events | **0** | 76 -> **0** |

**21,186 false poisonings over 178 files, and after the re-key there are none.** The TRUE
count is not comparable across the two runs and should not be read as a regression: the
counter records an event per pin on an already-poisoned row, and per-owner rows change which
rows poison at all, so the number rises while the behaviour does not.

**And the defect is LATENT — that is the honest headline.** `compile(master, candidate)` is
byte-identical in **3,186 of 3,186** `tests/cases` modules and **7,589 of 7,589** corpus cells.
Removing 21,186 false poisonings changes not one emitted byte, so **no reader trusts a false
poisoning in a way that changes output today**. That is the same test D1835 applied and passed:
its probe read POISONED at all 14 clamps and its fix needed the pin at none of them. **A
witness was attempted in each reader's own shape and neither moves** — a literal union reaching
`pinnedHoleTyOf` through a hole parameter (D1412) and one reaching it through the ELEMENT pin of
a container built in a generic body (D1725), each poisoned by a second generic also naming its
variable `T`; both print the same thing on both compilers. The reason is structural: a false
poisoning makes the pin answer "no answer", which every reader already handles by falling back,
so it can cost a resolution but cannot produce a wrong one. The row is
worth closing because it is a standing clause-1 risk in a table three emitter classifiers read,
not because a program is wrong today.

**One consequence to record: nothing gates this.** A change re-keying the table back onto the
bare name would be byte-identical too, so `pin-owner-per-function.vl` pins that the spellings
RUN and cannot detect the key regressing. The census script is the instrument, and it is not
a gate row.

**D1836 is untouched by this.** The un-annotated face of D1835 refuses in the monomorphizer's
argument reader, before any pin is consulted, so the re-key does not reach it.

---

## 8. What the campaign's second phase measured

Phase 1 (§7) converted five families and stated the bar. Phase 2 converted two more, REFUTED
one prerequisite, audited the largest family without converting it, and closed the clamp §7.6
opened — the last of those taking three PRs and two wrong diagnoses to get right.

### 8.1 Families converted or measured

| family | what happened | where |
| --- | --- | --- |
| the binding surface | **REFUTED.** §5.3 named it `expr*`'s blocker; four witnesses show binding resolution is already frame-correct by three separate routes, and the surface is not owed | §6.7 |
| `expr*` | **AUDITED, not converted.** 48 classifiers over 931 call sites, **zero magic rep codes**, 79% of rep-ish sites already `VKind` comparisons; the 16 raw table reads go to 2 | §6.8 |
| the valtype quartet | `fbRefNullForKind` converted; all four members are now `_`-less `match`es over the 31-member set | §6.5 |
| the slot layer | **SURVEYED.** Only its RIM converts; `armDestHeapOf` became a `_`-less `match` with 27 declining members named | §6.6 |
| the clamped ref-list slot | **NARROWED, as a no-op.** Four producers to one, then the clamp removed once the element name resolved | §7.6–§7.8 |
| the hole-pin table | **RE-KEYED per owner.** 21,186 false poisonings to zero, byte-identical, LATENT | §7.9 |

**The clamp is the phase's cautionary result.** §7.7 vetoed the narrowing and named the blocker
as a type variable rendering as `""`; §7.8 probed the clamp instead of reading around it and
found the annotations already concrete and the pin **POISONED**, with the empty name coming from
two ordinary rungs where the arena and the spelling disagree about one type. The veto was right
and its diagnosis was wrong, and only a probe separated them.

### 8.2 The bar, in its four forms and two new rules

§7.3 found the bar in three forms. Phase 2 added a fourth:

1. Do not REMOVE a domain.
2. Do not WIDEN a domain.
3. Do not move a GUARD out of reach of the lint that verifies it.
4. **Byte identity and the oracle are not interchangeable.** A conversion can be byte-identical
   while changing what a classifier ANSWERS, and it can move bytes while answering the same
   thing. Both readings are required and each names a different failure.

And two rules the phase earned by getting them wrong first:

* **A signature that does not take a frame is not thereby frame-blind.** §5.3 read
  `declaredSlotOf(name)` and `paramTypeNode(fnIx, name)` as frame-blind from their parameter
  lists and built a prerequisite on it; four witnesses refuted it, because the resolution runs
  through the ambient scope stack rather than the argument. **Test a claim about reach with a
  program, not with a signature.**
* **De-duplicate a guard only by moving the READ with it.** §6.5's guard-fold left the read
  behind, and `sentinel-index-unguarded` went 0 → 21 — correctly, because the guard and the
  read had been separated. This is form 3 seen from the other side.

### 8.3 The two rulings, re-denominated

* **`one-literal-union-rep` is now denominated in the SITES that carry a carve-out**, because
  every converted family inherits one and a query count in one place understates it. Four
  stand: `tyKindOfDesc`'s numeric-literal-union base collapse (1,503 queries in 48 modules) and
  its string-literal-union array element; `vtKindOfType`'s only surviving contradiction,
  unclosable within its domain; and the field-code family's **eight running programs**. The cost
  grows with the campaign, not with the corpus.
* **`nullable-rep-rule-stated-once`: option (b) is delivered and measured.** All four valtype
  writers — `fbValtype`, `fbValtypeNullable`, `fbRefNullOfKind`, `fbRefNullForKind` — are
  `_`-less `match`es over the 31-member set, so a twelfth nullable shape breaks the self-compile
  instead of falling through. Measured price: **+120 bytes, zero CPU, byte-identical output.**
  That is the safety (b) promised, bought. Option (a) — deriving `rdNul` from the inner
  descriptor — is untouched and remains the better end state.

### 8.4 Seed, and the landings that were not priced

Two phase-2 landings were priced at the fixpoint: D1835's close **+58 bytes** and the pin
re-key **+3,898 bytes**, so **+3,956 bytes across the two that were measured**. Against the
committed baseline the tree reads **2,333,335 B, +0.17%**, well under the +3% trip.

**Three of the phase's five compiler landings were not separately priced, and that is recorded
rather than hidden.** The seed ratchet exists because +8.8% across four landings was noticed
only when a peer asked; a campaign that prices two of five has the same exposure at a smaller
scale. Phase 1 summed six landings to **+4,073 bytes** and phase 2 cannot honestly match that
sentence. **Phase 3 prices every landing at the fixpoint.**

### 8.5 What phase 3 would be, and its one prerequisite

The conversions with real leverage are the domain-REMOVING ones, and every one is blocked on the
same thing: **the descriptor's coverage gap — the LEFT-ONLY column, 147,945 queries over 15
kinds**, headed by `reflist` (111,683 queries in 876 modules), `i32` (17,358), `map` (4,437),
`union` (3,358) and `str` (3,233).

While a kind is in that column the ladder is load-bearing exactly where the descriptor declines,
so the ladder cannot be deleted. §6.3 is the worked proof: deleting nine rungs that never appear
in LEFT-ONLY is byte-identical on both populations, and the oracle still refused it, reading
CONTRADICT 2,963 → 204,539.

So phase 3 is **close the LEFT-ONLY column kind by kind, largest first, then delete** — `reflist`
alone is 76% of the gap. Each kind covered makes one family deletable; none is deletable before
its kind is covered. That ordering, not the classifier count, is what decides how much of the
ladder ever goes away.

---

## 9. Phase 3 — closing the descriptor's coverage gap, `reflist` first

§8.5 named the LEFT-ONLY column as the one prerequisite. This is its first landing.

### 9.1 Why the descriptor declined, measured before anything was built

The oracle names WHERE the ladder answers and `repOfNode` declines; it does not say WHY. A
classifier hung off the same site reports the reason, as a `_`-less match over all eleven `Ty`
variants so no reason can fall through silently. It accounts for **every** `reflist` LEFT-ONLY
event in both populations — 13,415 of 13,415 and 99,116 of 99,116, no residue.

| why `repOfArray` declines | events | modules |
| --- | --- | --- |
| **MAP element** (`{[string]: V}[]`) | **96,659** | **669** |
| NESTED ARRAY element (`S[][]`) | 8,133 | 106 |
| NULLABLE element (`(S \| null)[]`) | 4,273 | 42 |
| VALUE-UNION-BOX element | 3,167 | 82 |
| no recorded type on the node | 166 | 1 |
| other union element | 133 | 6 |

**The two populations disagree about the leader, and only one of them is right.** In
`tests/cases` the nested array leads (5,209 of 13,415, 38.8%) and the map is fourth (1,279); in
the corpus the map is **96.2%** (95,380 of 99,116). The corpus is generated over fixed axes, so
its event count reports axis repetition as much as programs — which is why the reasons were
re-counted by MODULE. The map leads on both denominators (669 modules of 886 with any gap), and
that is what settles it. **An event count alone would have picked the wrong reason to build
first**, and the reason it would have picked is the one a reading of `repOfArray`'s
"legacy owns" tail also suggests.

### 9.2 The change, and why it is domain-KEEPING

A map is a reference exactly as a struct and a closure are, so a list of maps is a ref list —
the answer the annotation ladder already gives. `repOfArray` gains that arm, and both tree
projections (`rtListVKind`, `repTreeListElemName`) gain theirs, so the flat and tree producers
cannot disagree about a shape only one of them covers. Three lines. **No ladder rung is
removed here**; the descriptor gains coverage and the ladder keeps every arm it had.

### 9.3 The oracle, before and after

| | `tests/cases` | | distilled corpus | |
| --- | --- | --- | --- | --- |
| | before | after | before | after |
| AGREE | 389,621 | **390,900** | 109,142 | **204,522** |
| LEFT-ONLY (all kinds) | 53,539 | **52,260** | 101,274 | **5,894** |
| LEFT-ONLY (`reflist`) | 13,415 | **12,136** | 99,116 | **3,736** |
| CONTRADICT | 0 | **0** | 0 | **0** |

**`reflist` LEFT-ONLY falls 112,531 → 15,872 across both populations, −96,659 (86%).** Every
query that left LEFT-ONLY arrived in AGREE; none became a contradiction.

**The fall equals the census exactly.** 96,659 events were classified `MAP element` and 96,659
left the column — so the coverage gained is precisely the reason closed and nothing else moved,
which is the check that separates "the number went down" from "the number went down for the
reason I think".

**And `CONTRADICT` is 0, not the 178 this campaign has been quoting.** That figure is from
§6.3, before #2857 closed `vtKindOfType`'s five missing nullable-scalar-list rungs; on today's
tree both populations read zero. The bar is unchanged — a rise is a row — but the number to
hold it against is 0.

### 9.4 The price, which is the whole claim

Coverage means the descriptor now ANSWERS where it declined, and `vtKindOfType` prefers the
descriptor's answer. That is §5.0's second form — a domain WIDENING — so byte identity is not
a formality here, it is the claim:

```
master vs candidate   tests/cases 3207/3207   distilled 7589/7589   DIFFERING FILES: 0
```

`rep-fuzz-check.sh` exact, `regress.py` no cell changed class, `mono-tyaram-grid` 161 OK /
100 REJECT / **0 BAD**.

### 9.5 What is left in the column

**15,872 `reflist` queries over ~217 modules**, in the order a next landing should take them:
the NESTED ARRAY element (8,133 / 106 modules), the NULLABLE element (4,273 / 42), the
VALUE-UNION-BOX element (3,167 / 82). The nested-array arm is the natural next one — the rep
tree already recurses into it (`rtGo`'s list arm builds a child), so the work is the flat arm
and the two projections again rather than new machinery. **No rung is deletable yet**: deletion
needs the column empty for the kind, and `reflist` still has three reasons in it.

---

## 10. Two design simplifications the campaign should be ruled on

Both are filed in `docs/internals/open-rulings.md` §D with options, peers and a
recommendation. Neither is decided here.

* **`one-literal-union-rep` — a literal union's TYPE should carry its REP.** Today it does
  not: the atom-vs-string split is decided by *alias-ness*, so `repOfTyFlat` covers a declared
  `K` and declines an inline `("a"|"b")`, and the numeric literal union declines in both
  spellings. This is the single largest source of the descriptor's LEFT-ONLY residue —
  1,503 of 2,448 queries at the very first converted site — and every family after step 2 of
  §5.2 pays it again.
* **`nullable-rep-rule-stated-once` — niche vs box, decided by one rule.** `rdNul` has four
  disciplines and `VKind` carries **eleven** distinct nullable members. The rule that picks
  between them is real and correct but written per member; the ruling asked for is whether it
  can be stated once (as a function of the inner rep's reference-ness and the member count)
  so a twelfth nullable shape gets its arm by construction rather than by remembering.

---

## 11. Where the numbers come from

| number | instrument |
| --- | --- |
| 519 classifiers / 2,962 call sites / the reads columns | `scripts/rep-classifier-census.py`, on `b7a666856` |
| the per-family table | the same, `--json`, grouped by name prefix |
| every AGREE / CONTRADICT count | `VL_REP_SHADOW=1 vl build`, aggregated over the two populations |
| byte identity | two candidate compilers from ONE seed, sha256 per emitted module |
| the 21-row re-grade | each row read in `docs/internals/inventory/D<id>.md` |

Re-run the census before quoting it. A citation is a measurement with a date on it, and this
document's own §1 will go stale the first time a family converts.
