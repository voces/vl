# Registries keyed by arena type id — the inventory, the identity question, the price

`ROADMAP.md`'s destringify close leaves one forward question, stated and unpriced:

> the emitter's registries are keyed on the canon-SOFTENED spelling because that is the REP, not
> the type. Re-keying them on the precise type would change what the rep layer decides on — a
> DESIGN change to what the arena records, not a call-site conversion.

This prices it. Every number below was measured **2026-09-02** at `origin/master` 2e406026 with
the spike described here, and rebased onto c1806b64 — a byte-identical comment trim, so the
measurements stand. The programme's older figures are re-derived, not quoted.

**The answer, up front.** Neither candidate key in the tree works. The arena index is not an
identity; `repCanonId` is an identity but the WRONG one — it merges 360 row pairs the box ABI
needs apart and splits the one pair #2406-d2 needed together. The key has to be **a new interned
rep key, minted by canon once, that every producer obtains from canon rather than renders.**

## 1. The registry inventory

Union registry, every name-keyed entry point (`defs+hits`, then non-comment sites; producers §2).

| resolver | hits | code sites | read/write | id-keyed twin today |
| --- | --- | --- | --- | --- |
| `unionRowOf(name)` | 1+2 | 2 | read | `unRowOfCanon(ty)` |
| `isUName(name)` | 1+46 | 32 | read | `isUnionOfTy(ty)` (a THIRD identity — §2) |
| `unionMemberTysOf(name, out)` | 1+9 | 7 | read | — |
| `unionHasAtom(name, atom)` | 1+9 | 5 | read | `unionHasAtomTy` — still name-keyed |
| `unMemHasAtom(name, …)` | 1+2 | 1 | read | — |
| `registerInlineUnion(stmts, name)` | 1+20 | 18 | write | — |
| `registerValueUnionName(name)` | 1+16 | 16 | write | `registerValueUnionNameTy(name, tyIx)` |

**47 read sites + 34 write sites = 81.** Sibling registries, same shape, not converted here:
`variantIndexOf` 1+93, `structIndexByName` 1+38, `rlSlotByName` 1+31, `mvValKindOfName` 1+10,
`declTyIxOfName` 1+9, `fieldElemTyIxOfName` 1+9, `scalarListKindOfName` 1+7, `sTyIxOfName` 1+6,
`pinKindOfName` 1+5, `repRowOfName` / `repStructRowByName` 1+3 each.

Backing store: **726 module-level arrays** — **504 `i32[]`, 200 `string[]`**, 8 `boolean[]`, 14
typed (`emit_state.vl` alone declares 45 `string[]`); 163 co-push groups of 2+ cover 590 of them,
**450 in a group of 3 or more**. Parallel tables are how this compiler stores everything.

### Can a call site even offer an id?

All 81 sites by what the argument traces to (`NODE-IN-SCOPE` = one hop away, not free):

| | sites | share |
| --- | --- | --- |
| **ID-FREE** — the argument is literally `tyToEmitName(nodeTyIxOf(…))` | **4** | 4.9% |
| **NODE-IN-SCOPE** — an id is one hop away | 24 | 29.6% |
| **NAME-ONLY** — the name was CUT from another name | **53** | **65.4%** |

That 53 is the whole difficulty, and `registerInlineUnion` is its centre: **11 of its 18 sites
are self-recursive on a substring it cut** (`aa`, `pun`, `rnp`, `inner`, `ncRes`), and a cut
substring has no arena node to take an id from. This is B277's refusal one layer up — it refused
moving the SPLIT because a downstream consumer wants the strings.

## 2. The identity question

Four producers can spell one union, and they disagree: the arena's `tyToStr` (family: 218 calls,
205 of them in `typecheck.vl`), canon's `canonEmitName` (1+5, softens a literal member to its
base at `RC_ROOT`), `monoSubstAnn`'s text substitution (D1042), and the deep-`is` walker
generator (#2406-d2, unmerged). Three candidate keys, measured over **2,389 registered union rows
across 1,032 corpus programs**:

| key | round-trips to its own row | merges | verdict |
| --- | --- | --- | --- |
| raw arena index (`unTyIx[u] == ty`) | 2,389 / 2,389 (100%) | — | **not an identity** — one type mints many indices, so a QUERY holding a different index misses (`unRowOfCanon`'s header: 5,876 misses of 70,163) |
| **`repCanonId`** | **2,211 / 2,389 (92.55%)** | **360 pairs**, all different NAME, **63 different member SET** | **wrong equivalence, both directions** |

Coverage is no longer the obstacle: `unTyIx` is **2,389 / 2,389 = 100%** today — B92's 66.3% is
stale, and step 2's threading is done.

**Why it merges.** Its `TyLit` arm keys a bare literal as its BASE SCALAR, so two disjoint
literal unions of the same arity collide. Minimal witness (`w/merge.vl`), confirmed:

```vl
type SA = "aa" | "bb"
type SB = "cc" | "dd"
```
→ `rows 2 · name-rt 2 · raw-rt 2 · canon-rt 1 · canon-merge 1`. Two rows, one id. **63 of the
360 pairs also differ in their recorded member SET**, and those are the unambiguous hazard: a
union's box tags are positional over that set (`unVarStart`/`unVarCount` slice `uVariants`), so
fusing the rows reads a value boxed under one slice through the other's. The remaining 297 share
a member set — litunion aliases that soften to the same atoms — where the merge is benign or
wanted. Either way the key cannot tell the two cases apart, which is what disqualifies it.

**Why it splits.** `hcUnionId` recurses per member, so a union with an ALIAS arm and its
flattening get different ids. Minimal witness (`w/flat.vl`):

```vl
type J = boolean | f64 | string
type U = J | E          // 2 members
type V = boolean | f64 | string | E   // 4 members — the same type
```
→ `rows 3 · canon-rt 3 · canon-merge 0`. **That split is #2406-d2**: the complement view of
`Json | JsonError` renders flattened (7 members) and nothing has registered that spelling.
Swapping the name key for `repCanonId` would not have prevented it.

The registry therefore needs an equivalence **coarser than `repCanonId` on flattening** and
**finer on literal identity** — canon's softening decision, plus union associativity, plus member
ORDER. That equivalence exists in the tree only as a rendering (`canonEmitName`): hence a string
key.

**Three id-keyed answers already exist and do not agree** — `unTyIx[u] == ty` (raw),
`unRowOfCanon` (`repCanonId`), and `isUnionOfTy` (index rung + a `tySame` scan with a
`TyNullable` arm). A fourth that does not retire these is a second answer nobody asks (B92).

## 3. The proposal — one interned key, minted by canon

| | |
| --- | --- |
| **What** | `canonUnionKey(ty) -> i32`, an interned id minted by canon at the moment it decides a spelling's REP. Flattens nested union members; applies the literal softening; preserves member order. |
| **Who mints** | canon, once, at `canonEmitNameAt`'s existing decision point — the same place the softened NAME is produced today. |
| **Who obtains** | every producer, by ASKING canon. `monoSubstAnn` and the deep-`is` generator stop rendering a name and take the key; `tyToStr` remains a diagnostic renderer and is never a key. |
| **Registry columns** | `unKey: i32[]` beside `unNames`, pushed at all three mint sites — the `unTyIx` slice again, on the right equivalence. |
| **Why neither alternative** | the NAME has four producers and four renderings, with no way to make disagreement impossible, and a single minting site makes it structural; `repCanonId` is §2's 360 merges plus the #2406-d2 split. |
| **Cost side** | `__str_eq__` is the compiler's largest single cost centre — **24.27% self**, the top row of `perf-program.md` §19.1's guest-profiler table over 7,568 samples of `vl build compiler/entry.vl`. `unionRowOf`/`isUName` are LINEAR scans with one `__str_eq__` per row; the corpus run measured **824,867** `isUName` reaches. An integer key removes the compare, not just the scan. |

**The trap this must avoid.** Registering a SECOND row for a union another producer already
registered leaves two tag slices for one type (D1042's own note, and #2402's fix reuses the
existing row for exactly this reason). The key's job is to make `registerInlineUnion`'s `isUName`
gate hit; it is not licence to mint per call site.

## 4. The three witnesses, graded

Built from the rows' own repro blocks, against the PRE-FIX compiler (`82a7bf9f^`, 1,750,392 B) and
that same tree plus **only** the id-keyed retry (1,751,132 B). `git archive`, never `git stash`.

| witness | pre-fix baseline | + id-keyed retry | closed by the key? |
| --- | --- | --- | --- |
| **D1042** pure generic pin, literal arm | emit reject `no recorded members: i32\|"err"` | **identical refusal** | **NO** — `collectU` runs before `monomorphize`, so no row exists under ANY key |
| **D1042** same + a DIRECT spelling present | emit reject, same sentence | **runs — `42` / `5`** | **YES** — this is the producer disagreement, and the key is what closes it |
| **D1042** same + direct, STRUCT arm (no literal) | runs — `42` / `5` | runs (retry inert) | n/a — the control that isolates the literal softening |
| **D1112** un-annotated rebind off a `nulvariant` field | check-clean invalid wasm | not run | **NO** — from the row's OWN ablation: `exprNullableVariant` lacks a `Member` arm and `structIndexByName("JsonError")` is -1 because `collectS` SKIPS a union member. A missing row again. |
| **#2406-d2** complement view, flattened spelling | emit reject at the same `emitFail` | not run (branch unmerged) | **NO under `repCanonId`** — measured directly at §2's `flat.vl`; **YES under the canon-minted key**, which flattens |

The first three rows are MEASURED end to end; the last two are graded on the KEY question alone
(§2's witnesses) plus the row's filed mechanism, and are labelled so. **One `emitFail` serves
D1042 and #2406-d2**, which is why the retry could be placed once.

**So the cheap version closes 1 of 5 rows**, and the failures split into two causes of which only
one is a key question: **a MISSING REGISTRATION cannot be fixed by any key** (D1042 row 1, D1112),
while **a PRODUCER DISAGREEMENT can** (D1042 row 2, #2406-d2). #2402 closed D1042 by making the
producer agree — a producer fix — and today both spellings share ONE row (`w/soften.vl` →
`unionSweep/rows x1`). The design's value is making that agreement structural, not per-defect.

## 5. The migration, and the freeze each step needs

Byte-identical until step 5; steps 1-2 are this PR.

| # | step | freeze | proof it is safe | status |
| --- | --- | --- | --- | --- |
| 1 | `unionRowOfTy` / `unionRowOfTyRaw` shims + `unionRowOfAB` / `isUNameAB` seams, OFF by default | none | corpus `cmp` per module | **SHIPPED** |
| 2 | convert the ID-FREE + NODE-IN-SCOPE sites to the seam, still returning the NAME answer | none | agreement counters ≥ 99.9%, `id-only` inspected one by one | **SHIPPED — and the counter REFUSED the ≥ 99.9% premise** |
| 3 | mint `canonUnionKey` in canon; push `unKey` at all three registry mint sites; **no reader** | none | `unKey` coverage %, and a sweep asserting no two rows with different member SETS share a key | **SHIPPED — 100% covered, 0 different-set merges** |
| 4a | the ARENA-side member-sequence renderer, so `canonUnionKeyOfTy` reaches the row's key | none | agreement per row against `unKey`, every miss categorised | **SHIPPED — 1,369 → 2,422 of 2,447 (55.9% → 98.98%)** |
| 4b | thread the key into `registerInlineUnion`'s recursive sites, and separate the counter's `differ` from a key-EQUAL sibling | `emit_collect.vl` | per-site liveness + disagreement | **SHIPPED — 18 sites, 16 at `differ` 0 / `name-only` 0; `differ` 1,587 → 88** |
| 5 | **the switch**: seams return the id answer; retire `unNames`-scanning readers | `emit_classify.vl` + `emit_collect.vl`, one PR | rep-fuzz, fixpoint, corpus run-diff, **both halves of the ABI assertion** | blocked on `merge-diffvar` reaching 0 (D1492) |
| 6 | retire `unMemberSet` as a KEY (it stays as a rendering) | `emit_state.vl` | — | |

### What steps 1-3 landed, measured

All three are byte-identical: over `tests/cases` the pristine and candidate seeds emit
**2,281 identical modules, 0 differing, 0 rc-differing** (501 refuse under both), and master's
own compiler source builds **byte-identical** (1,812,575 B) under every candidate seed. The
compiler's own wasm grows with the dormant code: 1,812,575 → 1,819,045 (**+6,470 B, +0.36%**),
all of it unreachable while the harness is unarmed. Fixpoint holds at each step, and the
self-compile does not move: five interleaved A/B pairs on the same source (master's own
compiler, after #2419's memoisation made the build ~6 s), min **5.85 s pristine vs 6.00 s**,
median 6.02 s vs 6.09 s — **+1-2.5%, inside the pristine arm's own 5.85-7.35 s spread**.

**Step 1 — the twins.** Every name-keyed union reader now has an arena-keyed sibling over ONE
row core, so the two keys cannot become two readings of the member columns: `unRowOfName`
(new, and `isUName` is now `unRowOfName(...) >= 0`), `unionMemberTysOfRow`/`…OfTy`,
`unionHasAtomRow`/`unionHasAtomOfTy`, `unMemHasAtomTy` beside #2417's `unMemHasAtomRow`.
The tallies became PER SITE (`unABCnt[site * 6 + k]`, reported as `unionAB/<site>/<outcome>`)
because a pooled bucket cannot say which site owns a residue, and step 5 flips site by site.

**Step 2 — the sites.** The re-derivation found **7 ID-FREE** sites (the doc's earlier 4 was
counted before #2417 converted two of them) of which 4 were convertible now — the two
`internShapeDeepTy` reads, `internFuncTypeShapesTy`'s mint, and `inferRetArenaUnionIsDup` —
and **18 NODE-IN-SCOPE** sites that were threaded. Two ID-FREE sites
(`collectTyReachRegister`'s two `registerInlineUnion` calls) are step 4's, since threading
them changes that function's signature. Residue: **59 sites are still name-keyed**, of which
11 are `registerInlineUnion`'s own recursions, 12 are the resolvers' own bodies and thin
wrappers, and the rest are genuinely NAME-ONLY (`monoAnnPinName` ×3, `internInlineShapeTy`
×3, `unionRetOfFnType`, `emitUnionCoerce`, `scanPrintUse`, …).

**And the agreement premise was wrong.** Step 2's stated bar was "every reach answered by
the id twin agrees with the name key". Over 2,782 corpus programs, 24 converted sites:

| outcome | reaches |
| --- | --- |
| agree | 29,774 |
| **differ** | **2,103** |
| name-only | 426 |
| id-only | 107 |
| neither | 960,579 |
| no-ty | 33,169 |

2,636 reaches would take a different answer from the `repCanonId` twin — worst at
`arrLitBoxElem` (1,053 differ of 6,424 answered) and `arrLitUnionElemName` (336 of 2,077).
That is §2's 362 merge pairs arriving at call sites, so **the ID-FREE sites did NOT convert
to id-FIRST**: the fallback the plan expected the counter to prove unused is used, and
`inferRetArenaUnionIsDup` alone is 8 agree / 1 **id-only**.

**Step 3 — and the flatten is the key while the SOFTENING is not.** §3 above says the key is
canon's rendering. Measured, the full render is *worse* than `repCanonId` on the one property
that matters: keying on `canonEmitName` of the alias-expanded spelling fused **185 pairs of
rows with different member SETS** against `repCanonId`'s 65, because the softening collapses
`"aa"|"bb"` to `string` and `61|62` to `i32`. The two halves of `canonEmitName` pull opposite
ways, and only the FLATTEN belongs in a key. `canonUnionKeyText` is therefore the member
SEQUENCE — `collectU`'s own expansion rule verbatim (a union-alias atom expands only when the
expansion is multi-atom, so a litunion alias never softens), not deduped, not reordered — and
`unKey` is that sequence interned. Over the same corpus, 2,441 registered rows:

| | |
| --- | --- |
| `unKey` coverage | **2,441 / 2,441 (100%)** |
| agrees with the row's own recorded member set | **2,441 / 2,441 (100%)** |
| agrees with the ARENA route (`canonUnionKey(unTyIx[u])`) | 1,363 / 2,441 (**55.8%**) |
| pairs one key fuses | 312 — every one with the SAME member set |
| **fused pairs with DIFFERENT member sets** | **0** (`repCanonId`: 65) |

The two §2 witnesses grade as the design predicted: `flat.vl`'s `U = J \| E` and its
flattening `V` get **one key** (`repCanonId` splits them — this is #2406-d2), and `merge.vl`'s
`SA`/`SB` share a key but also share a member set, so the merge is one of §2's benign 297.

**The arena route's 44% miss was step 4a's job, and it is §2's own mechanism.**
`tyToEmitName` is one of the four producers and renders STRUCTURALLY: a declared struct
member comes back as its shape where the source said `S`, and a litunion alias as its
softened base. Until it can produce the member SEQUENCE a row records, a querier holding only
an arena type cannot obtain this key — which is exactly the "every producer OBTAINS rather
than renders" clause, unmet on one producer. **Step 5's switch cannot be scheduled before
that closes**, because a querier that mints a different key silently reads the wrong row.

**Order matters, for D965's reason**: lifting the name key at the READER before every PRODUCER
can supply one turns a loud refusal into a wrong row. Mint, wire every producer, then narrow.
Only steps 4-6 need a freeze at all — 4a needed none, 4b holds `emit_collect.vl` for the ~11
builds its per-site discipline costs, step 5 holds `emit_classify.vl` and `emit_collect.vl` for
ONE PR, and step 6 holds `emit_state.vl` for one. Steps 1-4a are additive.

### Step 4a — the arena renders the member SEQUENCE, and the declared name was in a sidecar

**The arena had NOT lost the declared name; a THIRD renderer already reads it.** The five
sources for a type question (CLAUDE.md) answer this one on the fourth: `cStructTyIxs` /
`cStructNames` and `cUnionTyIxs` / `cUnionNames` are the nominal-identity sidecar the checker
banks at pass 0a, `structNameOfTy` / `unionAliasDeclNameOfTy` are its reverse lookups, and
**`tyToNominalName` is the name-faithful renderer built on them** — the type-taking twin was
already written, and step 4a is four rules ON TOP of it rather than a new walk:

| rule | why the row needs it |
| --- | --- |
| render each member with `tyToNominalName`, NOT `tyToEmitName` | a declared struct member is `Circle` in the row, `{r:i32}` structurally |
| **do not dedupe** | `type K = "a" \| "b"` records `string\|string`; the structural renderer collapses the run to one atom, and a union's tags are positional over the sequence |
| a `TyFunc` member is PARENTHESIZED | bare, the closure's result arms swallow the union's siblings (`()=>f32\|null\|{w:i32}`) and the atom split reads a different sequence |
| unwrap the NULL FOLD with `null` FIRST, and give a nullable SCALAR its one atom | pass 0b folds `type J = null \| A \| B` into a ONE-member `TyUnion` over a `TyNullable`, so the members are a level down; and `i32\|null` is a `TyNullable(TyPrim)` with no union anywhere — the largest single family of rows |

…plus one SUBTRACTION, which is the only new position bit: at `RC_UNION_KEY` the nominal
renderer does **not** take a generic application's name. Canon spells a genApp union MEMBER by
its SHAPE (`unionMemberGenAppShape`), so the row for `type U = Box<i32> | Tag` records
`{v:i32}|Tag`; nested deeper canon keeps the application, and the bit does not propagate.

Measured over the same 2,790-program corpus (2,447 registered rows, six more than steps 1-3's
2,441 — three PRs added cases):

| route | agrees with the row's own `unKey` |
| --- | --- |
| `canonUnionKey(unTyIx[u])` — the structural render, steps 1-3 | 1,369 / 2,447 (**55.9%**) |
| **`canonUnionKeyOfTy(unTyIx[u])` — step 4a** | **2,422 / 2,447 (98.98%)** |

`keySweep/merge-diffset` stays **0**: the key's licence is unchanged.

#### The 25 misses, by mechanism

| # | miss | rows | why | is a PRODUCER the fix? |
| --- | --- | --- | --- | --- |
| 1 | the row's `unTyIx` is not a UNION at all — `obj` ×5, `func` ×1 | **6** | the mint resolved the row's SPELLING (`A\|B`, `Cat\|Dog`) to a member's shape or to a closure type, so there is no member sequence to render and the renderer answers -1 | **YES, and not this one** — the RESOLVER at the mint (`declTyIxOfName`). A row whose recorded type is not a union is unreachable by ANY type route, including `repCanonId`'s. Step 4b. |
| 2 | a litunion ALIAS's members are flattened into sibling `TyLit`s | **10** | `type R = Kind \| string` stores three members where the row records two; the alias BOUNDARIES are not an arena fact | partly. The string-lit REGROUP both existing renderers carry was built and measured here: **0 extra rows** — every case in this corpus is either two adjacent runs (`SA\|SB`, which regroup fuses into one atom) or a NUMERIC run, which the regroup does not cover. |
| 3 | `null`'s declared POSITION | **6** | the fold takes `null` out of the member list, so `null\|f64` and `f64\|null` reach ONE arena type | **YES — but it is a KEY decision, not a renderer one.** Normalising `null` to one end inside `canonUnionKeyText` closes all six; it also re-keys the ROWS and would create `merge-diffset` pairs, and 0 of those is the property the key's licence rests on (§3). Deliberately deferred to step 4b with this evidence. |
| 4 | a NAMED type nested ONE level inside an anonymous composite member | **3** | canon spells the nesting inconsistently: `{v: Pair<i32,string>[]}` keeps the application, `{v: {v:i32}}` and `{b: Node}` expand it | canon, the annotation-side producer. Both directions are present in this corpus, so no single arena rule wins — measured, not asserted: taking the nominal name inside fixes 2 and breaks 2. |

#### Byte-identity, and the per-site sweep with the arena key on the id side

Additive and dormant: over `tests/cases` the pristine (`origin/master` 76dfcc00) and candidate
seeds emit **2,289 identical modules, 0 differing, 0 rc-differing** (501 refuse under both), and
master's own compiler source builds **byte-identical (1,832,652 B) under both seeds**. Both
seeds are self-compilation fixpoints; the compiler's own wasm grows 1,832,652 → 1,833,871
(**+1,219 B, +0.067%**), all of it unreachable while the harness is unarmed. L1 6.26 s,
L2 15.21 s, both rc 0 under `timeout 300` (a loaded box; both are fixpoints).

`unABMode = 3` re-keys the per-site counter's ID side on `unKey` (via `unRowOfKey`) instead of
`repCanonId`, leaving the shipped answer alone. Over the same corpus, 27 sites, `repCanonId` →
arena key:

| outcome | `repCanonId` | arena key |
| --- | --- | --- |
| agree | 30,225 | 30,245 |
| **differ** | **2,207** | **1,587** (−28.1%) |
| name-only | 426 | **1,026** |
| id-only | 107 | 47 |
| neither | 990,140 | 990,200 |
| no-ty | 33,188 | 33,188 |

**The prediction was that `differ` falls toward 0 as the producer agrees. It falls by 620 —
and 600 of those become `name-only`, not `agree`.** So the arena key stops naming the WRONG
row; it does not yet name the right one. The residue is concentrated: `arrLitBoxElem`
1,131 → 786 (with `name-only` 0 → 207), `arrLitUnionElemName` 362 → 253 (0 → 59),
`letAnnUnionKind` 235 → 165 (0 → 123), `letAnnUnionSlot` 216 → 165 (0 → 109). Four sites are
UNMOVED — `collectU/inferLetTy` 50, `nliInferIfLet` 32, `emitLetDeclStmt/nli` 35,
`nliInferOptChainLet` 5 — so their disagreement is not a key question at all.

That gap is the difference between a ROW's recorded type and the type a CALL SITE holds: the
row-level agreement is 98.98%, but `arrLitBoxElem` holds an ELEMENT type and mints a key no row
was minted under. **Step 4b is where that closes**, and the reading is the same one step 2
earned: the counter is the authority, and the plan's premise was again optimistic.

### Step 4b — the counter had no word for "the same key, a different row"

Step 4a read **1,587 differing reaches** and called them "a call-site-type-vs-row-type gap".
Probed reach by reach — what the site HOLDS, what the row RECORDED, and whether the two rows
share a `unKey` — that is not what they are. A seventh outcome, `alias`, separates them
(2,790 programs, `unABMode = 3`, the same corpus as 4a):

| outcome | 4a | 4b |
| --- | --- | --- |
| agree | 30,245 | 30,279 |
| **differ** | **1,587** | **88** |
| **alias** — both rows found, different index, SAME `unKey` | — | **1,499** |
| name-only | 1,026 | 992 |
| id-only | 47 | 47 |

`canonUnionKeyText` is the member SEQUENCE, so a declared alias and the inline spelling of the
same members mint ONE key — the equivalence §2 argues for, and `unRowOfKey` returns the FIRST
row carrying it. **87 of the 88 remaining are the three WRITE-seam sites** (`collectU/inferLetTy`
50, `nliInferIfLet` 32, `nliInferOptChainLet` 5), and that answers 4a's "four sites are UNMOVED,
so their disagreement is not a key question": three of the four probe through `unABTyProbe`, a
`repCanonId` comparison of two arena TYPES at a MINT, which mode 3 never re-keys, so they could
not move; the fourth (`emitLetDeclStmt/nli` 35) was 100% `alias`. **One read-seam reach in the
whole corpus names a different row**, and it is 4a's own miss #3.

`unionDeclTyIxOfIdentSid` is `unionNameOfIdentSid`'s type-taking twin over its two ANNOTATION
arms, with the node's own type as the fallback (`letUnionNameOf`'s rule on the type side);
threaded at `memberUnionFieldName` and `writeRhsIsNullBearing`, the two sites asking about a
declared union while offering a NARROWED arm. The residual 992 `name-only` classify as:

| class | reaches | is "ask a different type" the fix? |
| --- | --- | --- |
| a NARROWED receiver or rhs whose binding is not an annotated ident | ~416 | no type in scope names the declared union; needs a narrowed-from link |
| a union the arena records STRUCTURALLY where the row holds the reverse-mapped NOMINAL spelling (an inferred return, an array-literal element join) | 350 | no — `registerInferRetNominalUnion`'s own note: the string lives ONLY in the name |
| the row's own key is one of 4a's misses #2/#4 | ~148 | on the PRODUCER side, not the call site |
| the same-shape collapse (D1490) | ~78 | no — measured, the recorded member type is load-bearing |

### Step 4b — 18 registration sites obtain the key from canon

`registerInlineUnionAt(stmts, name, site, ty)` carries a site id and whatever identity the
caller has; `isUNameKeyAB`'s id side is `unRowOfTyAB(ty)` where a type was offered and
`unRowOfKeyId(canonUnionKeyOfName(name))` otherwise — obtained from canon for the sub-spelling,
never re-cut from the parent's. The key is computed only when armed, so an unarmed compile is
byte-identical.

| site group | agree | differ | alias | name-only | id-only |
| --- | --- | --- | --- | --- | --- |
| `ctr/unionName` (ID-FREE, now offers its type) | 89,649 | **0** | 135 | 120 | 308 |
| `ctr/nullableName` (ID-FREE) | 45,697 | **0** | 1 | 167 | 0 |
| the 12 `riu/*` recursions except `mapVal` | 113 | **0** | 3 | **0** | 6 |
| `riu/mapVal` | 12 | 12 | 0 | 128 | 18 |

`riu/mapVal` is D1493: `canonUnionKeyText` expands an ALIAS through `unionAliasMembers`, whose
`tyToEmitName` render DEDUPES, so a litunion's `string|string` collapses to one atom, the
multi-atom guard declines, and the alias NAME stands as its own key — while the ROW was keyed
on `collectU`'s un-deduped `udSet`.

### The licence is TWO assertions, and one of them reads 1

`keySweep/merge-diffset` compares the member-set STRING. A struct union's tags are positional
over its VARIANT SLICE, so `keySweep/merge-diffvar` is the other half, and neither alone is the
licence:

* `type AS = (Sc | Dg)` beside the inline `Sc | Dg` — same key, same set string, slices
  `[Sc, Dg]` and `[]`. `merge-diffset` **0**, `merge-diffvar` **1**, on master today (D1492).
  This is what step 5 is blocked on.
* a VALUE union owns no variants, so only the set compare can see two ATOM sets fused.

Two candidate re-keyings were measured and **refused**, each with its price:

| candidate | buys | costs |
| --- | --- | --- |
| normalise `null` to one end of the key (4a's deferred miss #3) | `tykey-agree` 2,422 → 2,427, the last read-seam `differ` | `merge-diffset` 0 → **25**, every pair differing only by where `null` sits; `merge-diffvar` unmoved at 1 |
| expand a declared alias through `canonUnionKeyTextOfTy` (D1493) | `tykey-agree` 2,422 → 2,427, `riu/mapVal` cleared | `merge-diffset` 0 → **2**, fusing `K\|f64` with `KB\|f64` and `SA\|SB` with `OA\|OB` — §2's literal-softening merge, back |

Re-keying rows while the licence is unmet is the wrong order, so neither ships. The expansion
the key needs is the DECLARATION's member list with no softening, and neither renderer in the
tree is that.

## 6. The storage-class ladders

`VKind` has **30 members** (`emit_state.vl:536`). Measured across `compiler/*.vl`: **119 dispatch
ladders in 94 functions**, 696 kind tests, in 7 files (`emit_classify` 59, `wasmEmit` 36,
`emit_sections` 8, `emit_bytes` 5, `emit_collect` 5, `emit_rep` 4, `typecheck` 2). **Only 2 are
exhaustive** — `fbValtype` and `fbValtypeNullable`, both `match` with **no wildcard**, so a 31st
`VKind` breaks the self-compile rather than falling through.

Holes ranked by reachability (the class can genuinely reach the operation):

| # | site | hole |
| --- | --- | --- |
| 1 | `fnHasMap` `emit_classify.vl:12082` | a `nulmap` LOCAL does not reserve the map scratch frame; the PARAM half deliberately over-answers via `nodeTyReachesMap` |
| 2 | `emitLetDeclStmt` `wasmEmit.vl:20636` | no `nulvariant` seed for a variant object-literal init — the GLOBAL path has exactly this seed (`emit_sections.vl:1800`) and the `nulstruct` twin is present |
| 3 | `emitCapturedCall` `wasmEmit.vl:24563` | 5 arms against `emitDirectCall`'s 8+8+3 — a whole missing delivery position, not one arm |
| 4 | `retLocalCellKind` `emit_classify.vl:4008` | `u8list` missing from a payload-free allow-list its sibling rung does write |
| 5 | `emitMapValDefault` / `emitMapSetValExpr` | `u8list` missing from a 4-of-5 fan; the two are byte-identical chains |

**THE CENSUS IS A SCRIPT NOW — `python3 scripts/ladder-census.py`.** It reads the closed sets
from the tree (`--sets`: twelve, `VKind` and `Node` and `Ty` among them), tables every ladder by
set / arms / missing / how it ENDS, and has two sections nothing else has: `--split` for one walk
divided across two functions, and `--pred` for the form below. The numbers in this section were
hand-derived; re-run the script before quoting them. `compiler/lint.vl`'s
`kind-ladder-incomplete` / `kind-ladder-split` are the same walk per module, ratcheted by
`scripts/ladder-budget.py`.

**#2400's `nulvariant` hole is FIXED** (`wasmEmit.vl:6347`, landed `ef30652f`) — and it was in a
ladder of PREDICATES (`exprVariantIndex` → `exprNullableVariant` → `structIndexOfExpr`), invisible
to any grep for `== "<kind>"`. A kind-literal audit alone would not have found it.

**The dispatch table.** 11 groups of ladders share an arm set exactly, covering 51 ladders — the
largest being `{struct, nulstruct}` at **11 sites**, the five `nul*list` at 6, and
`{f64, i64, f32, u8list}` at 9. Proposal: one row per storage class, one column per operation
(valtype · ref.null · slot · sig token · niche twin · list backing · struct row), read through
named accessors. **The model is already in the tree**: `vkNulNicheOf` (`emit_classify.vl:28787`)
is a 12-arm `VKind → VKind` table that replaced two hand-written lists whose own header records
that they "drifted apart for eleven of the thirteen ref kinds". Migrate `{struct, nulstruct}`
first: 11 sites, one question ("does this kind carry a struct-table row"), and `repSigTokHasSlot`
is already the named predicate for its superset.

## 7. The parallel tables

Three genuine lockstep violations, all one shape — a span opened, then a `return` before it
closes:

| site | opens | closes | returns between |
| --- | --- | --- | --- |
| `collectShapeVariantFields` | `uFieldStart.push` 11552 | `uFieldCount.push` 11623 | 2 `emitFail` |
| `collectVariantFields` | `uFieldStart.push` 11643 | `uFieldCount.push` 11727 | 2 `emitFail` |
| **`collectS`** | `sNames`/`sFieldStart.push` 11417 | `sFieldCount.push` 11521 | 2 `emitFail` |

The first two are **D1152**, mitigated by `reconcileVariantFieldSpans`. **`collectS` is the exact
structural twin and has no reconcile pass** — safe today only because its `-1` propagates through
`runEmitPass`, which the variant side's does not (the `registerInlineUnion` recursions swallow
it). That is D1153's population, and it is one swallowed return from D1152 with no net.

Unguarded reads (no length test on any family member in the enclosing function): `uFieldStart`
27 of 41, `sFieldStart` 22 of 32, `sFieldCount` 26 of 39, `mvValKind` 70 of 76 — and the two
hottest accessors carry no bound at all: `variantFieldTypeAt(vi, fi)` is
`uFieldTypes[uFieldStart[vi] + fi]`, `sFieldTypeAt` its struct twin.

**Records, and the seed compiles them well today.** Measured (`w/rec.vl` vs `w/par.vl`: 20
fields, 10,000 rows, push then 50 read passes, same printed result, best of 7):

| form | emitted wasm | best wall |
| --- | --- | --- |
| array of 20-field structs | **2,256 B** | **31 ms** |
| 20 parallel `i32[]` | 4,943 B | 57 ms |

**2.2× smaller and 1.8× faster.** The record form is not blocked on a compiler gap; the migration
is a refactor, not a language ask. Cheapest first family is **UField** (7 members, 3 pushing
functions, 52 unguarded reads); the highest-value change is folding `fieldStart`/`fieldCount`
into one `span`, which makes "a row with a start and no count" unrepresentable.

**What a record does NOT fix:** a span still slices a flat store, so
`uFieldTypes[row.span.start + fi]` is unbounded against `uFieldNames.length` unless the span
becomes a checked accessor in the same change. Both halves of D1152 belong in a conversion brief.

**Bootstrap hazard.** A cost regression shows up one bootstrap step late, so both levels were
timed under `timeout 300`: **L1 (seed builds the spike) ok, L2 (spike builds the compiler) 125 s
rc 0**, fixpoint held. An L1-only check is vacuous for this class.

## 8. What the PRs ship

**Step 4b (the fourth PR), and what step 5 needs.** In `emit_classify.vl`: the `alias`
outcome and `unRowKeySame`; `unRowOfKeyId` and the key-taking seam `isUNameKeyAB`;
`unionDeclTyIxOfIdentSid` / `unionDeclTyIxOfExpr` and their two converted sites;
`unRowVariantsSame` and `keySweep/merge-diffvar`; eighteen new site ids. In
`emit_collect.vl`: `registerInlineUnionAt`, and every `registerInlineUnion` call routed
through it. In `emit_classify.vl` again: `isUnionOfTy`'s index rung gated on the row's
recorded type being a union SHAPE (D1490). Still no reader; arming still rides
`$VL_REP_SHADOW`, and mode 3 is armed from SOURCE.

**Step 5 needs three things, in this order.** (1) **`merge-diffvar` to reach 0** — one pair,
D1492, and until it does the switch can hand a caller a row with an empty variant slice.
(2) **A decision for the 87 write-seam `differ`** — `registerValueUnionNameAB`'s probe is
`unABTyProbe`, a `repCanonId` compare of two TYPES at a mint, which is a different question
from "which row"; either it becomes a row question or those three sites are a documented
exception. (3) **A rule for the 992 `name-only`**, which is not one gap: ~416 want a
narrowed-from link the tree does not have, 350 are unions the arena records structurally
where the row holds a reverse-mapped nominal spelling, ~148 are the row's own key (4a misses
#2/#4), ~78 are D1490's collapse. **The seams that return a ROW rather than a boolean
(`unionMemberTysOfAB`, `unionHasAtomAB`) have `differ` 0 at every site**, which is the single
most useful fact for sequencing the switch: the sites where a key-equal sibling could change
an answer are exactly the ones that do not disagree.

**Step 4a (the third PR).** In canon: `RC_UNION_KEY` (the one new position bit, and the one
place `tyToNominalNameGo` consults it), `canonUnionKeyAtomOfTy`, `canonUnionKeyTextOfTy` and
the exported `canonUnionKeyOfTy`. In `emit_classify.vl`: `unRowOfKey` (the third and last
candidate reverse index), `unRowOfTyAB` and harness mode 3 — which re-keys the four A/B seams'
TALLY without touching what they return — and the `keySweep/tykey-*` buckets beside the
step-3 `keySweep/ty-*` ones, so the two routes are graded on the same rows in the same run.
Still no reader; arming still rides `$VL_REP_SHADOW`, and mode 3 is armed from SOURCE.

**A one-route table is a number nobody can grade**, which is why `tykey-*` sits BESIDE `ty-*`
rather than replacing it: 2,422 of 2,447 means nothing until the sentence carries the 1,369
the same run produced from the same rows.

**Steps 1-3 (the second PR).** `unRowOfName`, `unionMemberTysOfRow`/`…OfTy`,
`unionHasAtomRow`/`unionHasAtomOfTy`, `unMemHasAtomTy`; the per-site counter (`unABCnt`,
`unABProbe`, `unABTyProbe`, `unABSiteName`) and the seams `unionRowOfAB`, `isUNameAB`,
`unionMemberTysOfAB`, `unionHasAtomAB`, `registerValueUnionNameAB`, each carrying a site id;
22 converted call sites; `canonUnionKey` / `canonUnionKeyOfName` / `canonUnionKeyText` in
canon, the `unKey` column, and `unKeySweepRow` / `unKeySweepPair`. Arming still rides
`$VL_REP_SHADOW`; nothing reads `unKey`.

**Two instrument facts the measurements turned on.** Bucket names come from a SITE TABLE
rather than an interpolation, so the report is greppable and a call site costs one i32
constant. And `repShadowAddReason` skips a zero, so a site with no reaches prints NO ROW —
reading "the site is missing" as "the site is dead" would have been wrong twice here
(`arrLitBoxElem` and `arrLitUnionElemName` were simply below a `tail -60`).

## 8.1. What the first PR shipped

The spike, OFF by default and byte-identical when off: `unionRowOfTy`, `unionRowOfTyRaw`,
`unionRowOfAB`, `isUNameAB`, `unMemHasAtomRow`, `unionRowOfSpellingTy`, `unABAtomRetry`,
`unionRegistryABSweep`. Arming rides the EXISTING `$VL_REP_SHADOW` harness (`setRepShadow`), whose
report the host already streams — no host change, and no environment read of its own: a compiler
that reads its own environment is a second input to its own fixpoint. Mode 2 (prefer the id
answer) is armed from SOURCE only, for grading.

**The instrument's own bug, recorded.** The first cut bumped `repShadowSweep`'s reason buckets
during emit — and that function RESETS the table before this spike's sweep runs, so every tally
read zero. The control caught it; counters now accumulate and are added once, after the reset.
