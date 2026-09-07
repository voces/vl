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
| 6 | the `expr*` family — 48 classifiers, 927 call sites | domain-REMOVING | an EXPRESSION node, which the arena may not have typed (a monomorphized body carries the template's types) | blocked on item 7; convert by AXIS, never alphabetically |
| 7 | `repOfName` for BINDINGS | new surface | a name plus the frame it is READ in → the declaration → its type | **BLOCKED, and the blocker is named**: `declaredSlotOf` takes a bare name with no frame; `paramTypeNode` and `globalLetOfSidIn` take `fnIx` only as a *frame-binds-this-name veto*, not as a scope-chain walk. Callee resolution has been frame-aware since D1781; binding resolution never was |
| 8 | the slot layer — `structIndexOfExpr`, `rlSlot*`, `mvSlot*`, `exprVariantIndex` | domain-KEEPING, per resolver | a nominal table row | last: `rdSlot` is the field the descriptor least owns (`repOfTy` fills it from `repSlotOfTy` for `TyObj` alone) |

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
  an explicit leg, and **§7's first ruling is exactly this line**.
* `descriptor-only`, 177,236 queries in 20 kinds — `struct`, `union`, `closure`, `map`,
  `reflist`, every nullable niche. The ladder never spoke for those shapes and its consumers
  compare `== <code>`; answering a code they have no arm for would be a new answer, not the
  same one. The conversion keeps the decline as the function's stated DOMAIN.

Two of those declines are carve-outs written into the converted function and cited to §7,
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

## 7. Two design simplifications the campaign should be ruled on

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

## 8. Where the numbers come from

| number | instrument |
| --- | --- |
| 519 classifiers / 2,962 call sites / the reads columns | `scripts/rep-classifier-census.py`, on `b7a666856` |
| the per-family table | the same, `--json`, grouped by name prefix |
| every AGREE / CONTRADICT count | `VL_REP_SHADOW=1 vl build`, aggregated over the two populations |
| byte identity | two candidate compilers from ONE seed, sha256 per emitted module |
| the 21-row re-grade | each row read in `docs/internals/inventory/D<id>.md` |

Re-run the census before quoting it. A citation is a measurement with a date on it, and this
document's own §1 will go stale the first time a family converts.
