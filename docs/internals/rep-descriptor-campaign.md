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

### 5.1 The obligation, stated once

Every conversion owes all five, and the first is the one that decides:

1. **The oracle: 0 CONTRADICT** over `tests/cases` (3,145 modules) and the distilled corpus
   (7,589 cells), with the ladder and the candidate projection compared side by side *before*
   the ladder is deleted.
2. **Byte identity** of the emitted module over both populations — both arms built from ONE
   seed, compared on sha256 and exit code, never on file size.
3. `scripts/silent-sweep/distilled/regress.py`: **0 `runs → not-runs`, 0 `→ silent`**.
4. `scripts/rep-fuzz-check.sh` exact — mandatory, the corpus and the fixpoint are both blind
   to REJECT→MISMATCH.
5. `scripts/mono-tyaram-grid.sh` no BAD — for anything that touches the pin context.

A conversion that cannot be byte-identical is not thereby refused; it is a conversion whose
price must be NAMED, measured on `regress.py`'s `runs` column, and carried in `named/`.

### 5.2 The order

Ranked by blast radius ascending against disagreeing-producer count descending.

1. **`tyKindOf` — the i32 code vocabulary. DONE in this PR.** One private function, 18 call
   sites, all in one file, and a THIRD rep numbering scheme (0/2/3/7/10/11/12/13/20) retired
   in favour of `VKind`. Smallest possible blast radius, and it is the family whose *whole*
   content is "a fourth producer of a fact the descriptor already has". §6 has its numbers.
2. **`vtKindOfType`'s annotation ladder** — 25 predicate rungs, the canonical classifier. The
   seam already exists (`annRepKindOf` is its first rung), so the work is not re-ordering, it
   is **widening `repOfTy` coverage until the fallback is unreachable, then deleting it**. The
   oracle's LEFT-ONLY bucket at this site is the burn-down list, and it is finite.
3. **The `expr*` family — 48 classifiers, 926 call sites, the largest.** Needs `repOfExpr(exprIx,
   fnIx)`, i.e. the node→type→descriptor path plus §3.3's pin context. Convert by AXIS, not
   alphabetically, because each axis is a closed set whose siblings must move together:
   (a) the seven scalar-list predicates (`exprArray`, `exprStringArray`, `exprF64Array`,
   `exprI64Array`, `exprF32Array`, `exprU8Array`, `exprRefArray`);
   (b) the six nullable niches (`exprNullableList`, `exprNullableRefArray`,
   `exprNullableString`, `exprNullableStruct`, `exprNullableVariant`, `exprNulScalarListKind`);
   (c) the three scalars (`exprIsI64`, `exprIsF64`, `exprIsF32`);
   (d) the reference shapes (`exprStruct`, `exprUnion`, `exprMap`, `exprIsClosure`,
   `exprIsLitAtom`).
4. **The return-kind family** — `retResultVKind` plus the fourteen `fnRet*Sid` readers. Already
   frame-aware after #2815/#2840, so the conversion is to make `fRetKind` a PROJECTION of the
   descriptor rather than a parallel column refined by its own fixed point. Two members
   (`fnRetF32ArraySid`, `fnRetAnnF32ArraySid`) still read the flat `fnIndexOfSid` and are the
   residue #2815 left; they move first.
5. **The valtype and field-code ladders** — `fbValtype` (31 arms), `fbValtypeNullable`,
   `fbRefNullForKind`, `fbHeapIdxForKind` over one kind set; `fieldTypeCode`, `nameFieldCode`,
   `anonFieldCode` over another. This is the ROADMAP's "3+ numbering schemes with translation
   functions between them", and D1783 is its worked defect (the declared mint carried a
   literal-union field split the ANONYMOUS mint did not).
6. **The slot layer, last** — `structIndexOfExpr`, `rlSlot*`, `mvSlot*`, `exprVariantIndex`.
   `rdSlot` is the field the descriptor least owns today (`repOfTy` fills it from
   `repSlotOfTy` for `TyObj` alone), and a slot is nominal where the rest of the descriptor is
   structural. Nothing earlier depends on it.

**And separately, on the same clock: the name surface — BUILT, as `repOfNameResult`.** §6.2
has its measurements and the one refinement it forced: of the five monomorphizer rows, only
the return-kind readers wanted a REP. The other three wanted the SLOT and the `$fnsig` key,
and the slot already has one home (`fnIndexOfInScope`). `repOfExpr`'s `Ident` arm still wants
the binding-resolution half, which is a separate surface and is named in §6.2.

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

**Byte identity**, both arms from one seed: `3,150 of 3,150` `tests/cases` modules and
`7,589 of 7,589` corpus cells identical — the conversion moves no byte, and D1834's fix is
observable only on the fixture it ships with, because no existing module had the shape.

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
