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

| # | step | freeze | proof it is safe |
| --- | --- | --- | --- |
| 1 | `unionRowOfTy` / `unionRowOfTyRaw` shims + `unionRowOfAB` / `isUNameAB` seams, OFF by default | none | corpus `cmp` per module |
| 2 | convert the 4 ID-FREE + 24 NODE-IN-SCOPE sites to the seam, still returning the NAME answer | none | agreement counters ≥ 99.9%, `id-only` inspected one by one |
| 3 | mint `canonUnionKey` in canon; push `unKey` at all three registry mint sites; **no reader** | none | `unKey` coverage %, and a sweep asserting no two rows with different member SETS share a key |
| 4 | thread the key into `registerInlineUnion`'s 11 recursive sites — the real work | `emit_collect.vl` | per-site liveness + disagreement, one build per site (B87) |
| 5 | **the switch**: seams return the id answer; retire `unNames`-scanning readers | `emit_classify.vl` + `emit_collect.vl`, one PR | rep-fuzz, fixpoint, corpus run-diff, the ABI assertion from step 3 |
| 6 | retire `unMemberSet` as a KEY (it stays as a rendering) | `emit_state.vl` | — |

**Order matters, for D965's reason**: lifting the name key at the READER before every PRODUCER
can supply one turns a loud refusal into a wrong row. Mint, wire every producer, then narrow.
Only steps 4-6 need a freeze at all — step 4 holds `emit_collect.vl` for the ~11 builds its
per-site discipline costs, step 5 holds `emit_classify.vl` and `emit_collect.vl` for ONE PR, and
step 6 holds `emit_state.vl` for one. Steps 1-3 are additive and can land beside other work.

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

## 8. What this PR ships

The spike, OFF by default and byte-identical when off: `unionRowOfTy`, `unionRowOfTyRaw`,
`unionRowOfAB`, `isUNameAB`, `unMemHasAtomRow`, `unionRowOfSpellingTy`, `unABAtomRetry`,
`unionRegistryABSweep`. Arming rides the EXISTING `$VL_REP_SHADOW` harness (`setRepShadow`), whose
report the host already streams — no host change, and no environment read of its own: a compiler
that reads its own environment is a second input to its own fixpoint. Mode 2 (prefer the id
answer) is armed from SOURCE only, for grading.

**The instrument's own bug, recorded.** The first cut bumped `repShadowSweep`'s reason buckets
during emit — and that function RESETS the table before this spike's sweep runs, so every tally
read zero. The control caught it; counters now accumulate and are added once, after the reset.
