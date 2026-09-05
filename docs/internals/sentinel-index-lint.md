# `sentinel-index-unguarded` — a table read whose index nobody bounded

**Landed 2026-09-03.** Rule in `compiler/lint.vl`, tree-wide census in
`scripts/sentinel-census.py`, ratchet in `scripts/sentinel-budget.py`, agreement pinned by
`tests/vl_sentinel_index_test.ts`.

## Why

Four compiler TRAPS of one shape landed on 2026-09-03, at four different sites, three of them
found by work aimed at something else and one by the first external VL consumer. In every one
`vl check` returned **0** and the seed then died with an anonymous
`wasm trap: out of bounds array access` — an error the user reads as *their* index being out of
range.

| row | the read | phase | where the index came from |
| --- | --- | --- | --- |
| [D1440](inventory/D1440.md) | `T.tys[t.nInner]` | emit | a `-1` arena hole |
| [D1462](inventory/D1462.md) | `T.tys[lt]` | **check** | `checkNode`, laundering an unresolved element |
| [D1500](inventory/D1500.md) | `rlElemName[slot]` | emit | a slot CLAMPED to 0, into an EMPTY table |
| #2498 | `T.tys[lt]` again | check | `__array_new_default__`'s open element |

(The fourth is referenced by its PR because its row is not on master yet — a row id cited
before it is filed is what `tests/vl_inventory_refs_test.ts` exists to catch.)

D1500's own row states the family-wide guard and says what was missing: *"a table read whose
index came from a reader with an in-band 'no answer' value must be bound-tested or must take
that reader's strict twin… `emit_classify.vl` already spells the bound-test idiom fourteen times
for `rlElemName` alone; what is missing is anything that makes a new consumer adopt it."* This
is that thing.

**[D1513](inventory/D1513.md) is NOT a member and the rule must not claim it** — a chain of
module globals that re-entered its own ladder, with no sentinel and no table read. It is graded
below as the negative control.

## The rule, verbatim

Within ONE top-level function body (a column-0 `function` / `export function` header, to the
line before the next):

> A **TABLE READ** is `<t>[<idx>]` where `<t>` is a bare name or a two-segment path `<g>.<f>`
> that the reading function did **not** declare — not one of its parameters, not one of its
> `let` / `const` / `for` names — and is not one of the module's own MAP globals.
>
> An index `<idx>` is **SENTINEL-BEARING** when, at the read, it is
>
> * **a call result** — a local or parameter last bound by `let x = f(…)`, `const x: T = f(…)`
>   or `x = f(…)`, where the annotation, if any, is a single word; or
> * **a hole field** — the subscript is a bare path `<x>.<f>`, or a local last bound by
>   `let x = <y>.<f>`, where `<f>` is a **HOLE FIELD** of this module: a field the module
>   itself compares `< 0` or `>= 0`, or compares against a negative literal with any operator; or
> * **a fall-through parameter** — one of the enclosing function's own `i32` parameters, read
>   **after** that function's first `return`, in a function that is a **READER**: one that
>   answers a literal `-1` on some path, or hands its answer to one that does (a fixpoint four
>   rounds deep over `return f(…)` and bare two-space tail calls, within the module).
>
> A **GUARD** for `<idx>` is any comparison of it — either way round — against `0`, `-1`, or
> any `.length`, on a line at or before the read. Re-binding the name clears its guard.
>
> A read whose index is sentinel-bearing and unguarded is a hit:
> **`sentinel-index-unguarded`**, tier `warning`. When the producing call's name ends in
> `Strict` the read is reported under **`sentinel-index-strict-untested`** instead — a `*Strict`
> reader's `-1` is its *documented* answer rather than a clamp that happens to be in range, so
> it still has to be tested, but it is the weaker finding and gets its own code.

Both derivations — hole fields and map globals — are read **per module**, from the module's own
text, so `compiler/lint.vl` (which sees one module) and `sentinel-census.py` (which sees the
tree) cannot disagree. Nothing is hard-coded: there is no list of tables, no list of readers, no
list of hole fields.

### What the guard model approximates

The walk is linear, so a guard counts only where it *precedes* the read — the same
approximation `arenaScanLint` makes. A guard inside an `else` arm marks the name and the read
goes unreported. That is a false **negative**, which is the safe direction for a ratcheted
warning.

## The reader census is REPORTING, and the rule deliberately does not filter on it

`scripts/sentinel-census.py --readers` derives **842 readers** from `compiler/*.vl` by three
tells, all read from the source: a literal `-1` answer on some path; being the non-strict
sibling of a `*Strict` twin (that twin's existence *is* the record that this one clamps); and
being a `*Strict` twin. `--readers --hits` joins it against the hit table:

```
842 readers derived from compiler/*.vl

4 of them produce an UNGUARDED index somewhere:

    25  refListSlotOfExpr    compiler/emit_classify.vl  — has a *Strict twin, so this one CLAMPS a miss to a real row
     2  mfResultSlotOf       compiler/emit_classify.vl  — answers a literal -1
     1  mvValStructIdxOf     compiler/emit_classify.vl  — answers a literal -1
     1  nodeTyIxOf           compiler/typecheck.vl      — answers a literal -1
```

**29 of 386 hits have a producer in that set, and filtering on it would drop two of the five
controls.** D1462's producer, and #2498's, is `checkNode`, which carries no `-1` of its own: it
launders `TyArray.aElem`'s hole four hops down (`checkNode` → `checkNodeReal` → `checkIndexNode`
→ `arrElemValueTy(at.aElem)`). A reader-filtered rule was measured at ~29 hits and misses them.
The census keeps the set because it is the right thing to *read* when triaging a hit — it says
whether the producer already admits it answers in band — and the rule keeps its distance from it
because a laundered hole is still a hole.

## The five controls, run on both trees

Each fix's parent tree was unpacked with `git archive … | tar -x` and graded with
`sentinel-census.py --root`. Measured 2026-09-03; the pre-fix trees against master `4490423c`, the counts against master
`1fc0d8d8`.

| control | pre-fix tree | fires pre-fix | quiet after |
| --- | --- | --- | --- |
| D1440 | `f0c824a7^` | `typecheck.vl:29797 nodeTyIsNulBool T.tys[t.nInner]` | yes, on master |
| D1462 | master `4490423c` | `typecheck.vl:36387 checkIsExprNode T.tys[objTy]` (+5 in `checkBinExprNodeReal`) | yes — **#2494 merged mid-branch and the ratchet's `--why` named exactly those sites** |
| D1500 | `4f1c36a3^` | `emit_classify.vl:9406 rlElemInnerSlot rlElemName[slot]` | yes, on master |
| #2498 | master `4490423c` | `typecheck.vl:33549/33699/33808 checkBinExprNodeReal T.tys[lt]` | yes, on `d1566-operand-hole-default` (#2498) |
| **D1513 (negative)** | `dcc88153^` | **nothing** — `globalCellKind` has no sentinel and no table read | n/a |

The two branches were the sharpest reading: #2494 guarded `lt` and `checkIsExprNode` and its
tree reported only the `rt` reads it did not touch; #2498 guarded both `lt` and `rt` and its
tree reported only the `checkIsExprNode` read that is #2494's. Each fix silences exactly its own
sites.

**#2494 then MERGED while this branch was open, which is the control re-run for free.**
`sentinel-budget.py --why` on the new master prints

```
sentinel-index-unguarded  390 hits over 274 names -> 386 over 273
  LEFT     compiler/typecheck.vl:checkIsExprNode
  compiler/typecheck.vl:checkBinExprNodeReal  5 -> 2
```

— the whole fall attributed by name to the sites that fix guarded, which is what a ratchet's
`--why` is for. `checkBinExprNodeReal`'s two remaining `T.tys[rt]` reads are #2498's, still
open.

`nodeTyIsNulScalarBox` (`typecheck.vl:30096`) carries D1440's shape **unfixed on master** — the
sibling one line down from the row's own witness, found by this rule and left standing for a
separate change.

## The count, and what it is not

**386 hits on master `1fc0d8d8`**, `sentinel-index-strict-untested` at **0**. By producer:
**167 call**, **160 hole field**, **59 fall-through parameter**.

| file | hits |
| --- | --- |
| `compiler/emit_classify.vl` | 171 |
| `compiler/typecheck.vl` | 71 |
| `compiler/wasmEmit.vl` | 68 |
| `compiler/emit_rep.vl` | 39 |
| `compiler/emit_collect.vl` | 15 |
| `compiler/lint.vl` | 11 |
| `compiler/emit_mono.vl` | 6 |
| `compiler/emit_query.vl` | 2 |
| `compiler/driver.vl` | 1 |
| `compiler/emit_base.vl` | 1 |
| `compiler/parser.vl` | 1 |

Eleven files hold all of it; the top three tables are `P.nodes` (190), `T.tys` (80) and `hcLen`
(20), and the top producers are `unwrapParen` (62), `e.callFn` (52) and `refListSlotOfExpr` (25).

`std/` is **0** and the 2,740-case corpus is **0**, so the code needs no corpus exemption — it
is not in `CORPUS_EXEMPT_CODES`, unlike the kind-ladder pair.

### A seeded 10-hit sample, graded

`random.seed(1500)` over the hits sorted by `(file, line, col)`, each graded **LIVE** (a witness
can reach it), **DEFENSIVE** (provably not) or **UNDECIDED**, time-boxed to a few minutes each.

| site | grade | why |
| --- | --- | --- |
| `emit_classify:37301` `T.tys[el]` ← `m.aElem` | UNDECIDED | `aElem` is `-1` for an unpinned element — D1462's and #2498's own producer. The `el >= 0` on the next line is about a *different* value (`en.nInner`), so this read is genuinely unguarded; the obvious witnesses (`const xs = []` into a union arm) are refused by the checker before emit. |
| `emit_classify:3937` `P.nodes[iv]` ← `unwrapParen` | UNDECIDED | `unwrapParen` is the identity on a non-`Paren`, so it answers `-1` exactly when its input does; the input is a member-chain field this site does not test. |
| `emit_rep:1875` `hcLen[rc]` ← `repIdOf` | UNDECIDED | `repIdOf` answers `-1` in band and `fnRet` is a hole field, but a void-returning closure value runs, so the obvious witness does not reach it. |
| `emit_collect:865` `P.nodes[synInit]` ← `unwrapParen` | **DEFENSIVE** | the arm is under `s.letType < 0`, and `letType < 0 && letInit < 0` is refused by the checker — `'x' needs a type annotation or initializer`, run as a witness. |
| `emit_classify:8775` `P.nodes[c.callFn]` | UNDECIDED | no constructor writes `callFn: -1` and the parser's only producer is a parsed expression — but the tree bound-guards `callFn` in three places, which is evidence somebody believed otherwise. |
| `emit_classify:37747` `P.nodes[e.callFn]` | UNDECIDED | same producer. |
| `emit_mono:344` `P.nodes[ax]` ← `unwrapParen` | UNDECIDED | same as row 2, on a call argument. |
| `emit_classify:37368` `P.nodes[c.callFn]` | UNDECIDED | same producer. |
| `wasmEmit:13598` `P.nodes[callIx]` (`emitStrCpLen`) ← the parameter `callIx` | **DEFENSIVE** | one caller, `emitCallNode`, which reached here by narrowing that very node; the fall-through is `emitFail`'s early return, not a miss. |
| `emit_classify:27745` `P.nodes[oi]` ← `unwrapParen` | UNDECIDED | same as row 2, on an object-literal expression. |

**2 DEFENSIVE, 0 LIVE, 8 UNDECIDED.** So: **386 is not a bug count.** Read it the way the
kind-ladder ratchet's 442 is read — most standing hits are a reader handed an arena index its
caller already knows is real, and what the rule buys is that a *new* one has to say so. The LIVE
evidence for the population is the five controls, every one of which needed a user program or an
unrelated probe to find; none was found by reading the code.

The grading also biases toward UNDECIDED on purpose: a time-boxed "I could not build a witness"
is not proof of unreachability, and calling it DEFENSIVE is the error CLAUDE.md's reachability
section names.

### The 21 wrapped-header hits, graded — 21 DEFENSIVE, 0 LIVE

Reading a function's whole header (#2605) uncovered 21 hits in three functions, every one the
`fall-through i32 parameter` arm — D1500's own. Each was graded by tracing the parameter to
every caller, then by an instrumented seed that turned each read's missing bound into a
distinctive `emitFail` and swept **10,901 programs** (2,975 `tests/cases`, 7,564 distilled-corpus
cells, 362 other tree `.vl` files) plus **84** generated union-delivery-position programs.
**No bound fired.** The instrument was validated against an inverted control — flipping one
condition to `==` made it refuse every program — so the zero is a measurement, not a silent probe.

| hits | function · read | producer | grade · the comparison that guarantees it |
| ---: | --- | --- | --- |
| 10 | `emit_mono.vl:monoMakeInstance` — `monoOrigNode[origFe]` ×9, `fnStmts[origFe]` | `monoWalk`'s `fe`, `monoCoerceFnValueName`'s `gfe`, `monomorphize`'s `fe3` | **DEFENSIVE** — all three callers pass `fe >= 0 && fe < monoGen.length` (`emit_mono.vl:3794`, `4376`, and `4819`'s `nDecl`); `monoGen` and `monoOrigNode` are pushed in one loop (`4782`–`4787`) and neither is appended to again, so that test is `monoOrigNode.length`. `fnStmts` only grows past it. |
| 3 | `emit_mono.vl:monoMakeInstance` — `P.nodes[calleeIx]` | `c.callFn` (call-driven), `exprIx` / `fnStmts[fe3]` (annotation-driven) | **DEFENSIVE** — each caller has already dereferenced the same index as `P.nodes[…]` before the call (`monoInstantiate`'s `P.nodes[callIx]` narrowed to `Call`, `monoCoerceFnValueName`'s own `P.nodes[exprIx]`), so this read is never the first. |
| 2 | `wasmEmit.vl:emitStructExprAsVariantBox` — `uFieldCount[vi]`, `uFieldStart[vi]` | `unionArmVariantForStructExpr`, `exprVariantIndex` | **DEFENSIVE** — the function's first line is `guardVariantFieldSpan(vi, …)`, which tests `vi >= 0 && vi < uFieldStart.length && vi < uFieldCount.length` and both span ends. The rule's guard model reads comparisons, not helper calls (§What the guard model approximates). |
| 2 | `wasmEmit.vl:emitStructExprAsVariantBox` — `uTags[vi]`, `uVarHeap[vi]` | same | **DEFENSIVE** — not covered by that guard, covered by construction: `assignTags` rebuilds `uTags` and `mAssignTypeIndices` rebuilds `uVarHeap` at one row per `uVariants` row, and the last writer of `uVariants` is a PASS (`collectU`, or `monoRegisterPinUnion` inside `monomorphize`), all of which run before the type section. A parity probe over 3,059 programs found `uVariants.length != uVarHeap.length` **0** times. |
| 2 | `wasmEmit.vl:emitStructExprAsVariantBox` — `sHeapIdx[ssi]` ×2 | `structIndexOfExpr` | **DEFENSIVE** — each caller bounds it, differently: the union-coerce site only reaches the call past `unionArmVariantForStructExpr`, whose `structIdxMatchesVariantIdx` declines on `ssi >= sFieldCount.length` (`emit_classify.vl:26019`); the argument boundary carries `bssi < sHeapIdx.length` (`wasmEmit.vl:4074`, #1673). `sFieldCount` gains a row at every `sNames.push`, and a probe over 3,059 programs found `sNames.length != sHeapIdx.length` **0** times — checked at the top of the code section and again after every function body, so no row is interned late. |
| 2 | `wasmEmit.vl:emitVariantFieldsEq` — `uVarHeap[vi]` ×2 | `eqConcreteVariantRow`, the `vis` column | **DEFENSIVE** — both callers take the same four bounds first: `emitStructUnionEqConcrete` spells them at `wasmEmit.vl:4660`–`4663`, and every `vis` entry `emitUnionBoxEqStaged` dispatches on was filled by `unionBoxEqColumns`, which declines at `4762`–`4765`. |

Two things the sweep found that are **not** this family, recorded so they are not re-found as
one: a same-shape union arm minted through an earlier `==` is check-clean invalid wasm
(`type mismatch: expected (ref $type), found (ref $type)`, identical on master), and 13 of the
84 generated position programs are loud check rejects. Neither is a trap, and grouping silent
cells by that validator sentence is the mistake CLAUDE.md names.

`guardVariantFieldSpan` checks two of the four tables its own callers go on to read; the two
places that spell the bound by hand check all four. Closing that gap is free today (it fires on
nothing measured) but it is a hardening, not a fix, and no hit here needs it.

## The false positives the rule had to design out

Each was a real over-report during the build, and each is pinned as a fixture in
`tests/vl_sentinel_index_test.ts`:

* **`while tbl.length <= k { tbl.push(-1) }` then `tbl[k]`.** The grow loop IS the bound.
  Eleven of these were reported until `siBoundAt` stopped letting the path reader eat the
  `.length` it was looking for.
* **A map subscript.** `m[k]` cannot go out of bounds — a miss reads back null — so a module's
  own `{[…]: …}` globals are excluded. **24 hits** were map reads before that, one of them in
  this rule's own code.
* **`x.length > 0`.** A non-empty test is not a hole test, and taking it made `length` a hole
  field, which turned every `const id = xs.length` into a producer.
* **A locally-built list**, a **re-bound index**, and a **parameter read at the TOP of a
  reader** rather than on a fall-through.
* **A parameter on a WRAPPED header.** Both implementations read a function's declarations off
  its header, and both read only the header's FIRST line — so when `vl fmt` broke a long
  parameter list over several lines, a parameter declared on a continuation line was neither
  "declared" nor "an `i32` parameter". The header now runs to the `{` that opens the body.

  The one-line read cost the rule in BOTH directions, and only one of them was a false
  positive. Measured on `compiler/` when the fix landed: **0 hits left** — the false positive
  is real (a six-parameter helper written in #2601 hit it the day it was written) but no
  function in the tree happened to have that shape — and **21 hits ENTERED**, every one the
  fall-through-`i32`-parameter arm inside a function whose header wraps: `monoMakeInstance`
  (13), `emitStructExprAsVariantBox` (6), `emitVariantFieldsEq` (2). The ratchet therefore
  ROSE, 358 → 379, which is a detector seeing more rather than a tree getting worse, and
  `tests/vl_sentinel_index_test.ts`'s `wrapped.vl` fixture pins both directions.

## Agreement, and why there are two implementations

`compiler/lint.vl` grades one module from the source the driver hands it; the census grades the
tree. Nothing else ties them together, so a change to either that moves a count silently
un-ratchets the tree. Two things hold them: the fixture suite compares hit **lines and columns**
on five programs, and during the build both were run over all eleven compiler modules and
compared position for position — **386 = 386, 0 files disagreeing**.

## Running it

```sh
python3 scripts/sentinel-census.py                    # every hit: file:line, function, table[idx] <- producer
python3 scripts/sentinel-census.py --readers --hits   # the reader census, joined against the hits
python3 scripts/sentinel-census.py --holes            # each module's hole fields
python3 scripts/sentinel-census.py --root <dir>       # grade another tree (a `git archive` unpack)
python3 scripts/sentinel-budget.py                    # the per-file table
python3 scripts/sentinel-budget.py --check            # the gate: a file may only go down
python3 scripts/sentinel-budget.py --why              # what LEFT and what ENTERED since the baseline's commit
python3 scripts/sentinel-budget.py --write-baseline   # after a real fix, in the same PR
```

`--check` is a `gate.sh` row and a ci-native step. `scripts/lint-self.sh` holds
`sentinel-index-unguarded` out of its `info` gate while the baseline still owes it, read FROM
the baseline, so the exemption deletes itself at zero. `sentinel-index-strict-untested` is
already at zero and therefore already gated at `info` — the exemption working one code at a
time.

## Cost

Two module passes and one per function, all linear in bytes, sharing the kind-ladder line and
function index. The seed grew **+1.6%** (2,043,139 → 2,076,521 bytes), under
`scripts/seed-size.py`'s +3% bar; `scripts/native-fixpoint.sh` holds.
