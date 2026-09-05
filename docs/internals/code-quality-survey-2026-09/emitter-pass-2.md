# Code-quality survey — the emitter, second pass, 2026-09-05

Surveyed at `153760e1d`, the merge of #2607. Every line number is that commit's and every
number names the command that produced it in §12. The seed used throughout is
`build/vl-compiler.wasm` at 2,156,482 bytes, proved a fixpoint on this checkout —
`compile(seed, master source)` is `cmp`-identical to it. `VL_STD` pinned to the worktree's
`std/` on every native probe. Read-only apart from §4's probe, which appends one function to
`compiler/lint.vl`, builds to a scratch path and restores the file; nothing it produced
reached `build/`.

The [first pass](emitter.md) surveyed `facb9f610` and thirteen of its twenty consolidated
rows have landed since. This pass takes the four axes of `tests/vl_scaling_shape_test.ts`
the first pass never profiled, re-derives its structural counts, and asks what the six
landings between the two commits left standing. References to the first pass are written
"first-pass §n"; a bare "§n" is this document.

**Summary.** Three findings dominate, and none of them appears in the first pass.

* **`variantSig` is 30.34% of a 3,200-union compile** — a string built by concatenation
  inside an O(n²) twin search, on the invariant side of the inner loop as well as the varying
  one, in a function that memoises its *other* key correctly one loop above (§2). The
  `unions` axis reads **3.86 against a bar of 4.0** at twice its shipped size, and the
  comment above that axis names the wrong mechanism.
* **The env-parameter convention costs the compiler +82,534 seed bytes (+3.83%)** the moment
  one function-typed parameter exists (§4) — an independent re-run of #2601's own probe that
  **confirms #2609's correction to within 0.5%** and then sizes the fix #2609 left open. The
  address-taken set a static ABI split would need is **24.2% of functions**, measured over
  the 611 of 2,440 `tests/cases` modules that carry the convention; and the table section is
  still sized to the function count while the element section beside it is not.
* **`buildFnMap` is 72.42% inclusive of a 600-callback compile** and is reached from
  `monoRebuild` on a program declaring no generic at all (§3.2). That row is in flight
  elsewhere and is **not filed here**; what is filed is the measurement that re-sizes it and
  names the axis it costs most on, which is `callback slots`, not `generic pins`.

Beyond those: the rep-key renderer is written five times (§5.1), four phase flags trace one
monotone arena timeline with one gate between them (§6), the `select` guard's missing proof
is spelled out in the source 2,052 times (§7), untested emit refusals grew 456 → 465 in two
days while the fixture side held flat (§9), and `ExpCtx` landed the four cell-seed ladders
while the ambient `pending*` write count went **311 → 330** (§8).

---

## 1 · Ranked

| # | finding | evidence | size | risk | proof |
|---|---|---|---|---|---|
| 1 | `buildVariantTwins` rebuilds `variantSig` for both operands of every pair in an O(n²) scan; `variantSig(i)` is loop-invariant and `variantSig(d)` is a pure function of tables the loop never writes (§2) | **30.34% self** of a 3,200-union compile, **99.7%** of it from that one loop; the axis reads **3.86 / bar 4.0** at 1,600 unions | XS | none | byte-identical seed; `regress.py`; the `unions` axis ratio |
| 2 | The env-parameter ABI is module-wide: one function value gives **every** function a `structref` param and **every** direct call a `ref.null none` — #2609 named this as "where the next slice is" and it is unsized (§4) | **+82,534 B (+3.83%)** on the compiler, independently reproducing #2609's +82,151; only **24.2%** of functions in the 611 paying `tests/cases` modules are address-taken, so three in four could keep the plain ABI | L | high | `matrix.py`, `regress.py`, corpus byte identity, an owner ruling on the ABI split |
| 3 | Seven `expr*Array` classifiers each ask `unionIdentReadKind` independently, and each re-interns the identifier's sid (§5.2) | `unionIdentReadKind` **21.12% inclusive** on the `functions` axis; `sidOfNode` 5.90% self, half of it under `unionNameOfIdentSid` | M | med | byte-identical seed; corpus `cmp` |
| 4 | The rep-key renderer is written five times: three `*KeyGo` bodies at 110/115/98 lines and 85–98% pairwise, three 33-line entry points at 100%, while `repElemIdGo(ty, mv)` already proves the merge (§5.1) | script-measured token similarity; `repCanonId`/`repElemId`/`repMvValId` are identical after normalisation | M | med | byte-identical seed; `rep-fuzz-check.sh` |
| 5 | The table section is sized to the function count while the element section it feeds is sized to the address-taken set — the same ordering #2609 fixed one section over (§4.4) | arm B declares `(table $0 5039 funcref)` with an **empty** element section | XS | low | byte-identical seed on a no-function-value program; `wasm-dis` on one paying module |
| 6 | Four phase flags mark one monotone arena timeline; only one of the six arena-stability mechanisms has a gate (§6) | `capCacheOn`, `postMonoShapes`, `anonLeafEmitPhase`, `emitArenaFinal`, plus `monoArenaTick` (gated) and ten `caSeen*` prefix marks | L | med | byte-identical seed; a new pass-table rule + its control |
| 7 | Untested emit refusal sites **456 → 465** in two days while `@emit-error` fixtures held at 86 files / 78 texts (§9) | 534 sites today against 527 at `facb9f610`; 69 tested | S | none | the ratio as a gate row, with its own baseline |
| 8 | `emitDirectCall` saves four `pending*` fields and clears six more without saving them — 37 writes, the largest single site, and untouched by `ExpCtx` (§8) | `pending*` write sites **311 → 330** since the first pass; the four delivery ladders hold 102 of them | M | med | byte-identical seed; `regress.py`; `matrix.py` over the delivery positions |
| 9 | The `select` bounds guard on a hoisted list read needs the loop bound proved equal to `len`, and **2,052 of 2,182** candidate loops spell the bound as the receiver's own `.length` (§7) | static census over `std/`, `compiler/`, `bench/`, `tests/cases` | M | high | `tests/cases/loops/hoist-*.vl`; `vl_hoist_trap_iteration_test.ts`; a wasmtime A/B |
| 10 | Eleven functions are the same eight-line linear membership scan; four more are the same eight-line key lookup (§5.3) | exact normalised-body groups | XS | none | byte-identical seed |
| 11 | `binOpcode` ×4 (182 lines over one operator alphabet) and `exprIsStr*` ×7 still stand — first-pass §4.3 and §4.2, neither scheduled (§5.4) | `binOpcode`/`binOpcodeI64` and `binOpcodeF64`/`binOpcodeF32` are identical after normalisation | S | low | byte-identical seed; `wasm-dis` one function per family |
| 12 | `nestedFnDeclaredInFrame` and `nestedFnDeclaredIn` are now identical, and so are their two chain walks — #2583 landed the index and left the duplication (§5.5) | 13/13 and 15/15 lines at 100% | XS | none | byte-identical seed |
| 13 | The state-leak harness pins a general invariant with 28 hand-picked programs against 563 module-scope mutables, 96 never cleared (§10) | `emitter-state-audit.py`; `vl_instance_state_leak_test.ts` | S | none | the harness's own oracle over a wider set |
| 14 | `emitCoalesce` (867) and `emitAssign` (707) are unchanged; ten functions are over 400 lines (§11) | function census, 2,817 emitter functions, median 12 | M | med | byte-identical seed |

Rows 1, 5, 10 and 12 are hours each with a byte-identical proof. Rows 2 and 9 are the two
that need an owner ruling before an agent starts.

---

## 2 · `variantSig` — a string built n² times, on both sides of a loop

`buildVariantTwins` (`compiler/emit_classify.vl:20156`) decides which variant rows are
representation twins. Its first loop precomputes an interned key per variant, correctly:

```vl
const keys: i32[] = []
let i = 0
while i < uVariants.length {
  keys.push(repNameCanonId(uVariants[i]))
  i = i + 1
}
```

Its second loop is O(n²), and the D1023 arm inside it does **not** get the same treatment:

```vl
    if rep == i {
      let d = 0
      while d < i {
        if variantSig(d) == variantSig(i) && variantLitDiscriminable(d, i) {
```

`variantSig` (`:20291`) builds a comma-joined string of the variant's field names by
repeated concatenation. So for n variants the loop performs ~n² string constructions, and
**`variantSig(i)` is loop-invariant** — rebuilt on every iteration of the inner loop as well.

### 2.1 Measured

Four profiles of `genUnions(N, 1)`, `--names` seed:

| unions | guest samples | `variantSig` self | `__str_eq__` self |
|---:|---:|---:|---:|
| 400 | 151 | 15.89% | 17.88% |
| 800 | 463 | 20.09% | 24.84% |
| 1,600 | 1,621 | **29.98%** | 20.54% |
| 3,200 | 5,840 | **30.34%** | 27.09% |

Samples rise ×3.07 / ×3.50 / ×3.60 for each doubling of the union count — quadratic, not
linear — and the share rises with it. `profile-parents.py` attributes **99.7%** of
`variantSig`'s samples to `buildVariantTwins` and 0.3% to `assignTags`; `buildVariantTwins`
is **27.64% inclusive** at 1,600.

The axis this sits on is close to its bar. Wall time, min of three, plain seed:

| unions | many | one | ratio | bar |
|---:|---:|---:|---:|---:|
| 800 (the shipped pair) | 0.440 s | 0.172 s | 2.56 | 4.0 |
| 1,600 | 1.321 s | 0.342 s | **3.86** | — |

### 2.2 The axis comment names the wrong mechanism

`tests/vl_scaling_shape_test.ts`'s header says of its three super-linear axes: *"All three are
a name-keyed registry answering a lookup by linear scan"*, and the `unions` axis carries the
note *"A per-union cost is scaling with the union registry."* The profile disagrees. The
registry lookups are there — `unionRowOf` 4.13% self at 3,200, `isDeclaredStructName` 15.58%
inclusive — but the largest single frame is a string BUILD in an O(n²) twin search, with no
registry under it at all.

That is the same failure mode `profiling-the-compiler.md` records for the `generic pins` axis
one week ago, where the comment named `tyTopIndexOf` and the cost was `monoRebuild`. **A note
above an axis is a citation, and a citation is a measurement with a date on it.**

### 2.3 The change

Three steps, each strictly cheaper than the last:

1. **Hoist `variantSig(i)`** out of the inner loop. One line; removes half the builds.
2. **Precompute the column**, beside `keys`: `sigs.push(variantSig(i))` in the first loop,
   then `sigs[d] == sigs[i]`. n builds instead of n²; the inner loop becomes n²/2 string
   compares.
3. **Intern it**, exactly as `keys` already does: `sigIds.push(sidOf(variantSig(i)))`, then
   `sigIds[d] == sigIds[i]` is an integer compare. Then a first-row-per-sig-id map makes the
   whole search O(n).

Step 2 is the one to land first: it is a memo of a pure function whose inputs — `uFieldStart`,
`uFieldCount`, `uFieldNames` — the loop never writes (its only write is `uVarTwin.push`).

*Size* XS. *Risk* none for steps 1 and 2. *Proof*: byte-identical seed
(`refresh-compiler.sh` + `cmp`); `regress.py` 0 `runs → not-runs`; the `unions` axis ratio, and
if it falls clear the bar should fall with it — the comment above it needs rewriting either
way, per §2.2.

---

## 3 · The four axes, profiled

`tests/vl_scaling_shape_test.ts` grades eight axes on a time RATIO and names, in a comment
above each, the function it holds responsible. The first pass profiled a self-compile only.
These are the four the brief asked for, each at its shipped size and at least one doubling,
`--names` seed, `VL_PROFILE_GUEST` + `profile-rank.py`.

### 3.1 What each axis costs, and where

| axis | samples | top self frames | phase split |
|---|---:|---|---|
| `generic pins` 800 | 1,003 | `__str_eq__` 18.44, `recordRedundantAnnot` 9.17, `sidOfNode` 2.79 | emit 78.6%, check 15.4% |
| `generic pins` 1,600 | 6,285 | `__str_eq__` 18.60, `recordRedundantAnnot` 8.62, `sidOfNode` 7.46 | — |
| `functions` 1,600×20 | 1,051 | `__str_eq__` 20.84, `sidOfNode` 5.90, `unionNameOfIdentSid` 4.66 | emit 84.1%, check 8.4% |
| `unions` 1,600 | 1,621 | **`variantSig` 29.98**, `__str_eq__` 20.54, `isDeclaredStructName` 3.52 | emit 89.2%, check 8.0% |
| `callback slots` 600 | 736 | `__str_eq__` 16.30, `tyTopIndexOf` 7.07, **`buildFnMap` 5.43 self / 72.42 incl** | emit 95.5%, check 2.5% |

Wall time, min of three, plain seed, box load 6–68:

| axis | many | one | ratio | bar |
|---|---:|---:|---:|---:|
| `generic pins` 200 | 0.204 | 0.183 | 1.12 | 2.5 |
| `generic pins` 400 (shipped) | 0.443 | 0.385 | **1.15** | 2.5 |
| `generic pins` 800 | 1.051 | 0.686 | 1.53 | — |
| `generic pins` 1,600 | 3.553 | 1.867 | **1.90** | — |
| `unions` 800 (shipped) | 0.440 | 0.172 | **2.56** | 4.0 |
| `unions` 1,600 | 1.321 | 0.342 | **3.86** | — |
| `callback slots` 300 (shipped) | 0.374 | 0.211 | 1.77 | 4.0 |
| `callback slots` 600 | 1.350 | 0.834 | 1.62 | — |

Two readings worth stating plainly. `generic pins` is comfortable at its shipped size and its
ratio is still RISING with N — 1.12 / 1.15 / 1.53 / 1.90 — which is what the axis's own
comment predicts ("a bigger pair needs its own bar"), and #2604's landing did not remove the
super-linearity, only the constant that made it red. `unions` is the opposite: at twice its
shipped size it reads **3.86 against a bar of 4.0**, and §2 says why.

A third reading, for the record: `recordRedundantAnnot` is **9.17% self** at 800 pins and
**10.14%** on the *one* arm, with 100% of its samples under `checkLetDeclNode`. It is
`typecheck.vl`, not the emitter, and it is not axis-specific — noted here for the front-end
survey rather than filed as an emitter row.

### 3.2 `buildFnMap` — measurement only, the row is in flight

`monoRebuild` (`emit_mono.vl:1992`) skips its four passes on an unmoved arena stamp, and
#2604 taught the first of them, `collectA`, to resume on the arena prefix. `buildFnMap`
(`emit_collect.vl:2492`) is the second and does not resume: it clears ten parallel tables and
re-walks all of `fnStmts`, seeding each row's return facts from the annotation.

Measured here, and larger than #2604's parting figure of 18.71%:

| arm | `buildFnMap` inclusive |
|---|---:|
| `generic pins` 400 | 12.40% |
| `generic pins` 800 | 19.94% |
| `generic pins` 1,600 | **34.88%** |
| `callback slots` 600 | **72.42%** |

Two facts the pins reading cannot show. **First, the axis it costs most on is `callback
slots`, not `generic pins`** — and that program declares no generic: `monoRebuild` is reached
from `monoSpecializeConcrete`, so a program with no type parameter anywhere still pays the
per-instance rebuild. **Second, its own cost is annotation TEXT.** Under it on the
600-callback arm: `sidOfNode` 3.53% of the run (89.7% of that frame's samples),
`retStructIndex` 2.04%, `retVoidAnnFlag` 1.49%, `retRefArrElemName` 0.95% — and beside them
`tyTopIndexOf` 7.07% self, 78.8% of it under `nullablePartOf`. Each function's return
annotation is re-rendered and re-parsed through several character grammars on every rebuild.

So the fix has two independent halves — a prefix resume, and reading the return kind from the
arena rather than the render — and only the first is in flight. The second belongs to the
destringify program (§9's parse count).

---

## 4 · The env-parameter convention, priced independently

`selfhost-lambdas-design.md` §"every callee takes a hidden leading `structref env`
parameter" is module-wide: `fnValUsed` (`emit_state.vl:162`) flips the calling convention for
the entire module the first time any function value exists.

#2601 measured that flip and recorded it in `CHANGELOG.md`:

> a single unused function-typed parameter added to master's `lint.vl` costs **+92,002** on
> its own … the module gains `(table $0 4997 funcref)` and an `elem` segment listing every
> function of the program, so one address-taken function pays for all 4,997 … **Narrowing
> that segment to the functions whose address is taken would make the callback spelling
> free.**

#2609 performed exactly that narrowing and **corrected the attribution in the same breath**:
its `CHANGELOG.md` entry records the probe dropping to **+82,151 B (+3.82%)** and names the
remainder as the calling convention — 28,337 `ref.null struct` pushes, 295 export wrappers,
the env param on every functype.

**This section is an independent re-run of that probe at `153760e1d`, and it agrees to within
0.5%.** That is worth having on its own — the two measurements were taken by different people
on different commits with different probe signatures — and the framing matters: **#2601's
sentence, not #2609's, is the one that is refuted**, and it is #2601's sentence that a reader
of `CHANGELOG.md` meets first. What is new below is §4.3, which sizes the analysis #2609 named
as "where the next slice is", and §4.4, which finds one section that the same ordering fix has
not reached.

*A note on how this was nearly reported wrong.* The correction is in #2609's CHANGELOG entry
and **not** in its commit message, which is what `git log` shows. Reading the commit message
and stopping there produced a confident "the attribution was wrong, and nobody has noticed" —
one `head -12 CHANGELOG.md` refuted it. **A landing's record is its CHANGELOG entry; the
commit message is a summary of it.**

### 4.1 The same probe, re-run at `153760e1d`

One function appended to `compiler/lint.vl`, never called:

```vl
function em2ProbeUnusedSlot(cb: (string, i32, i32, i32) => i32, x: i32): i32 { x }
```

| | master | + the probe | delta |
|---|---:|---:|---:|
| **seed total** | 2,156,482 | 2,239,016 | **+82,534 (+3.83%)** |
| code | 1,848,665 | 1,923,664 | +74,999 |
| type | 36,461 | 47,509 | +11,048 |
| function | 10,056 | 6,536 | −3,520 |
| table | 0 | 5 | +5 |
| **element** | 0 | **0** | **0** |

The element section is **absent from both arms** — the probe takes no address, so #2609's
`fnAddrTaken` marks nothing and section 9 is not written. The narrowing worked, and the price
is 89.7% of what #2601 measured. So a function-typed parameter that is never *used* as a value
now costs nothing in section 9 and 82,534 bytes everywhere else, which is the shape §4.3 is
about.

### 4.2 Where the price actually is

Disassembled with `./node_modules/.bin/wasm-dis`:

| | master | + the probe |
|---|---:|---:|
| `ref.null none` | 120 | **28,596** |
| `(call $…)` | 28,677 | 28,974 |
| `(func $…)` | 5,047 | **5,345** |
| `structref` mentions | 0 | 10,440 |
| `(export "…")` | 298 | 298 |

**28,476 new `ref.null none` instructions, one before every direct call** — `wasmEmit.vl:20580`
says why: when a function value exists module-wide, every callee carries the hidden leading
`structref env` param, and a direct call to a never-capturing top-level function supplies
`ref.null struct` for it. At two bytes each that is 56,952 of the code section's 74,999, and
the rest is locals renumbering past the shifted env slot. **298 new functions** are the export
ABI wrappers (`exportWrapSlots`, `emit_sections.vl:5663`), exactly one per export entry —
minted for all 298 whether or not any export is ever reached through a function value.

Independently: 28,476 against #2609's 28,337, 298 wrappers against its 295, on a tree seven
commits later. Two probes, two authors, two signatures, the same mechanism.

**The cost MODEL is what neither probe states, and a synthetic control gives it.** 5,000
identical `(i32) => i32` functions with only 40 call sites cost **+282 bytes** for the same
flip — 0.3% of what `lint.vl` pays with a hundredth of the functions' worth of difference.
**The price is per CALL SITE and per distinct functype, not per function.** That matters for
scheduling: a program's exposure is its call-site count, so `lint.vl`'s 3.83% is close to the
worst case for a VL program and a leaf module's is near zero. Had only the synthetic been run,
"+282 B, negligible" would have been the reported answer.

### 4.3 What a static address-taken analysis would take, sized

The mechanism to decide who needs the env param already exists — `markFnAddrTaken`
(`emit_state.vl:176`), set at `emitClosureValueCore` (`wasmEmit.vl:1496`), the one site that
turns a wasm function index into a closure id. What it lacks is a *time*: it is computed while
the code payload is built, four sections after the functypes are written.

The payoff, measured over every `tests/cases` module this seed builds:

| | |
|---|---:|
| modules built | 2,440 |
| modules carrying the env convention | **611 (25.0%)** |
| functions in those modules | 9,205 |
| address-taken (element-segment entries) | **2,231 = 24.2%** |
| per-module share | median 23.1%, min 0.7%, max 90.9% |

So **three functions in four**, in the modules that pay, would keep a plain signature and a
plain call. The largest paying module,
`tests/cases/literal-unions/litunion-order-cross-module-alias.vl`, has 140 functions and
**one** address taken.

*Change.* A pre-pass over the final arena marking every position where a function name is
used as a VALUE rather than as a callee — a binding initialiser, an argument in a
function-typed slot, a return, a container element, a map value, a `??` operand, a generic
pin. `emit_collect.vl`'s `anonLeaf*` family already answers most of that question
(`anonLeafFnValueNames`, `anonLeafFnValueTarget`), and `emitArenaFinal` (§6) is the
declaration that says such an index may be built. Then the functype, the call-site `ref.null`
and the export wrapper are each decided per function.

*Size* L. *Risk* **high** — this is a calling-convention split, and CLAUDE.md's position-matrix
rule applies in full: a function the analysis misses is a `call_indirect` into a signature
mismatch, which is a trap, not a refusal. **Proof:** `scripts/capability-probes/matrix.py`
over both faces; corpus byte identity with the analysis forced to "everything" (which must be
byte-identical to today); `regress.py`; and the conservative direction has to be the DEFAULT —
an unknown answer means "address taken".

*And this is a language question before it is an emitter one.* The convention is why the
callback spelling is expensive at all, and #2601 chose an `i32` kind selector over a function
value because of it. That trade is a standing tax on the language's own idiom; the owner
should see the number before an agent spends a week on the analysis.

### 4.4 The table section is one ordering behind

`emit_sections.vl:3506` is candid: *"Sized for all of them, not for the filled ones: the size
is written four sections before the bodies decide which those are."* Section 9 no longer has
that problem — #2609 moved `buildCodePayload` above the element section for exactly this
reason. Section 4 was not moved with it, so the probe module declares `(table $0 5039
funcref)` while its element section is empty: 5,039 funcref slots allocated at instantiation
for a module with zero address-taken functions.

*Change.* Hoist `buildCodePayload` above the table section as well, and size the table to the
highest marked index plus one (or omit it when nothing is marked). Nothing between the two
reads the code payload — the memory, global, export and start sections are all computed
independently. *Size* XS. *Risk* low. *Proof*: byte-identical seed (master's own compile has no
function value, so the section is absent either way); `wasm-dis` on one paying `tests/cases`
module before and after; `regress.py`.

---

## 5 · Duplication, re-measured

Two scans over the thirteen emitter files (§12): exact match after normalising every
identifier to `X`, number to `N` and string to `S`; and a `difflib` ratio over the same token
streams for the pairs that merely drifted. **2,817 functions, median 12 lines, 129 over 100,
41 over 200, 10 over 400.** The exact scan finds **54 groups**; the ratio scan **1,664 pairs
at ≥ 70%** among the 1,181 functions of 15 lines or more.

### 5.1 The rep-key renderer, five times

| function | lines | pairwise |
|---|---:|---|
| `emit_rep.vl:329 repCanonKeyGo` | 110 | — |
| `emit_rep.vl:504 repElemKeyGo` | 115 | **85%** vs canon, **98%** vs mv |
| `emit_rep.vl:698 repMvValKeyGo` | 98 | **87%** vs canon |
| `emit_rep.vl:1280 repCanonIdGo` | 116 | — |
| `emit_rep.vl:1553 repElemIdGo(ty, mv)` | 101 | — |

And the entry points: `repCanonId` (`:1246`), `repElemId` (`:1465`) and `repMvValId` (`:1515`)
are three 33-line bodies, **identical** after normalisation, differing only in which cycle
stack, which memo, which sync and which `Go` they name. `repCanonKey` / `repElemKey` /
`repMvValKey` are 29 / 29 / 15 lines on the same pattern.

Each `*KeyGo` is a `match t { … }` over all eleven `Ty` arena variants, and the three differ
only in their FOLD rule — `repElemKey` folds `i32[]`/`boolean[]`/litunion `K[]` to one token
because they share a backing, `repMvValKey` keeps them distinct because mv rows do not, and
`repCanonKey` is fully structural. Two bits of parameter over one walk.

*Why it matters.* These three define three equivalence relations whose rows become WasmGC
heap-type indices, and a union's box tags are positional. Two renderers drifting apart is not
a cosmetic problem — it is a different module. The `Id` family already made the argument:
`repElemIdGo(ty, mv)` carries the elem/mv fold as a parameter and its header calls itself
"the mode dispatch for the shared walk's recursion". The `Key` family never got it, and the
`Id` entry points never got the collapse the `Go` bodies did.

*Change.* (a) `repKeyGo(ty, mode)` with the fold bits as the mode, the three names kept as
wrappers. (b) One shared entry-point body for the six, or — since VL has no default parameters
(first-pass §6.5, still 102 wrappers, §5.4 below) — six thin wrappers over one. *Size* M.
*Risk* med: the fold table is the whole content and a transcription error is a merged row that
should not merge. *Proof*: byte-identical seed; **`scripts/rep-fuzz-check.sh`, which is
mandatory here and is the only gate that sees REJECT→MISMATCH**; corpus `cmp`.

### 5.2 The `expr*Array` ladder has a number now

First-pass §6.2 measured the seven classifiers on a self-compile (≈23% summed, with overlap)
and #2583 merged two of the sixteen sites, refuting the other fourteen. On the **`functions`**
axis the shared sub-question is visible instead of the ladder:

* `unionIdentReadKind` **21.12% inclusive**, reached from `exprString` (28.6% of its
  samples), `exprF64Array` (21.4%), `exprStringArray` (14.3%), `exprArray`, `exprIsF32`,
  `exprIsI64`.
* under it, `unionNameOfIdentSid` 12.56% inclusive / 4.66% self, and `sidOfNode` 5.90% self
  with **50%** of its samples under `unionNameOfIdentSid`.
* the same shape on the parameter side: `paramTypeNode` 6.37% inclusive, reached from
  `paramIsF64`, `paramArray`, `paramStringArray`, `paramNulRefArray`, `exprU8Array`,
  `identCellVKind`.

So the seven classifiers do not merely repeat a ladder — each independently asks whether the
identifier reads a union, and each independently interns its sid to ask. **A per-identifier
memo of `unionIdentReadKind` is the smaller and safer half of first-pass row 12**, and it does
not need the sixteen call sites merged.

*Size* M. *Risk* med — the answer depends on narrowing state, so the memo's key has to carry
the frame, not only the sid, and an epoch stamp has to retire it when narrowing moves.
*Proof*: byte-identical seed; corpus `cmp`; the `functions` axis.

### 5.3 Fifteen copies of two eight-line scans

Eleven functions are the same eight-line linear membership scan, identical after
normalisation, over `string[]` or `i32[]`:

```
emit_base.vl:115 capIsBound · :124 capHas · emit_classify.vl:15108 retMapInFlight ·
:16336 fnTyParamName · :20324 lexInLexes · :22027 unRowHasTyIx · emit_collect.vl:1510
dstPinIsTyParam · emit_mono.vl:1423 monoI32ListHas · :4562 monoInstantiatedAny ·
emit_rewrite.vl:175 drwCloShadowed · wasmEmit.vl:11911 armPreludeWalked
```

and four more are the same eight-line "index of key, or -1":

```
emit_classify.vl:1276 cloSigPosOfKey · :19313 gaeIndexOf · emit_collect.vl:9041 gaeBaseSlot ·
emit_rep.vl:2212 repStructRowByName
```

*Change.* `listHasStr(xs, v)` / `listHasI32(xs, v)` / `listIndexOfStr(xs, v)` in `emit_base.vl`
or `symbols.vl`, with the fifteen names kept as one-line wrappers where they document
something. *Size* XS. *Risk* none. *Proof*: byte-identical seed. **Not a perf row** —
`perf-opportunities-2026-09.md` B4 already records that `capHas` takes a `string[]` PARAMETER
and no shared index is possible; this is one place to get the loop right, nothing more.

### 5.4 Still standing from the first pass

* **First-pass §4.3, `binOpcode` ×4.** `emit_base.vl:484` / `:545` / `:603` / `:640`, 182
  lines over one operator alphabet, all four called only from `emitBinExprNode`.
  `binOpcode`/`binOpcodeI64` and `binOpcodeF64`/`binOpcodeF32` are identical after
  normalisation; the i32/i64 pair is 92% similar to `emit_classify.vl:765 retKindPri` and 84%
  to `emit_rep.vl:122 repSigTokOfKind`, so the shared shape is wider than the four.
* **First-pass §4.2, `exprIsStr*` ×7.** `emit_classify.vl:7026`–`:7105`; six are exact copies
  and `exprIsStrIndexOf` differs only in accepting two method names.
* **First-pass §4.5, `exportSlotOfTarget` / `monoFirstFnIndexNamed`.** `emit_sections.vl:5611`
  and `emit_mono.vl:4529`, 11 lines each, still identical.
* **First-pass §6.5, the delegation wrappers.** Re-derived: **102** (74 in
  `emit_classify.vl`), against the first pass's 100. Still an owner ruling on default
  parameter values, not a refactor.
* **First-pass §6.3, boolean parameters: 72**, unchanged, and the `keyI32` and `want` families
  are unchanged with it.

### 5.5 #2583 landed the index and left the duplication

First-pass §4.4 asked for two things: move the child index somewhere both files can read, and
collapse the two chain walks. The first landed — `fnChildHead` / `fnChildNext` /
`buildFnChildIndex` are in `emit_state.vl:1254` with a header saying they live there *"so both
walks can read it"*. The second did not: `emit_classify.vl:3546 nestedFnDeclaredInFrame` and
`emit_collect.vl:2664 nestedFnDeclaredIn` are now **identical 13-line bodies**, and
`fnIndexOfInScopeSid` / `fnIndexOfInScopeChainSid` are identical 15-line bodies beside them.
Both files already import `emit_state.vl`, so the stated blocker — *"this file cannot import
`emit_collect`, since the module graph runs the other way"* — no longer applies to either, and
that sentence is now stale in two headers.

*Size* XS. *Risk* none. *Proof*: byte-identical seed; the two headers' "first slot wins" rule
is the one thing to carry over verbatim.

---

## 6 · Four flags, one timeline, one gate

Six mechanisms in the emitter answer a version of "has the arena stopped moving?", and they
were built one at a time:

| mechanism | where | what it says | gate |
|---|---|---|---|
| `capCacheOn` | `emit_state.vl:215` | the AST is final, so the capture-list cache is valid | none |
| `postMonoShapes` | `:575` | `monomorphize` has run, so a shape row is an instance re-spelling | none |
| `anonLeafEmitPhase` | `:629` | the mint is over, so a `??` literal resolves to the merged row | none |
| `emitArenaFinal` | `:635` | the pass table has finished, so a whole-program index is safe | none |
| `monoArenaTick` | `emit_mono.vl:276` | an in-place arena write happened | **`tests/vl_mono_arena_tick_test.ts`** |
| `caResumeArmed` + ten `caSeen*` marks | `emit_state.vl:1206–1225` | the prefix `collectA` may resume on | (the same test's second half) |

**Four of the six are points on ONE monotone timeline** — AST final → post-mono → pass table
done → `emitModule` — set in that order and cleared together in `emitProgram`'s prologue. They
could be one `i32` rank with four named constants, and every reader that today writes
`if emitArenaFinal` would write `if emitPhase >= PHASE_ARENA_FINAL`. That collapse is worth
having for one reason above tidiness: **a rank makes "later than" checkable, and four
independent booleans do not.**

**The other two cannot join them, and saying so is the point.** `monoArenaTick` counts WRITES,
not phases, and `caResumeArmed` is a re-entrancy arming around one call site. So one mechanism
carrying all three of the enumeration-based soundness arguments the brief names is **not**
available: #2594's tick and #2604's "only `emit_mono.vl` edits the arena" are already the same
mechanism — the tick is what makes that enumeration checkable — but #2607's `emitArenaFinal`
is a different claim, *no pass runs after this point*, and its evidence is the pass table's row
grammar rather than a write count.

*What is actually missing is a gate on the fourth.* The pass table (`emit_sections.vl:4153`)
checks that each row's declared prerequisites have run; nothing checks that a row which
MUTATES the arena is declared before every row that scans one. That invariant is stated in the
table's own comment — *"a pass that mutates the arena runs before every pass that scans it"* —
and is exactly what `emitArenaFinal` rests on. An in-place arena-write census finds **116
candidate sites**: `emit_rewrite.vl` 77, `wasmEmit.vl` 16 (all false positives — they write
`ExpCtx` fields, not nodes), `driver.vl` 12, `emit_collect.vl` 5, `emit_mono.vl` 5,
`typecheck.vl` 1. A pass declared after `emitArenaFinal` that reached any of them would be
silently wrong.

*Change.* (a) One `EmitPhase` rank replacing the four booleans. (b) A source-text rule on the
pass table, in the shape `vl_mono_arena_tick_test.ts` already proves works: every function
named in `runEmitPass`'s ladder (`emit_sections.vl:3968`) is classified MUTATES or SCANS by
whether its body reaches an in-place arena write, and a MUTATES row must precede every SCANS
row. *Size* L. *Risk* med. *Proof*: byte-identical seed for (a); for (b), the control the tick
test already demonstrates — a synthetic misordered row must be reported, validated both ways.

---

## 7 · The `select` guard — the proof is spelled out 2,052 times

`emitListIdxGuardHoisted` (`wasmEmit.vl:8482`) emits, per hoisted list access, an `i32.lt_u`
plus `select` that maps an out-of-range index onto `-1` so the access traps rather than reading
the zero-init slack `.push` leaves past `len`. `bulk-copy-design.md` §E4 says what removing it
would take:

> dropping it needs the loop's own bound proved EQUAL to the cached `len`, which is a
> value-flow question the hoist does not ask.

Counted over `std/`, `compiler/`, `bench/` and `tests/cases`, the question is usually not a
value-flow question at all:

| loop shape | count |
|---|---:|
| `while i < <recv>.length` — the bound IS the read | **2,052** |
| `while i < n` with `n = <recv>.length`, `<recv>[…]` in the body | 60 |
| `while i < n` with `n = <recv>.length`, no index in the body | 70 |

For the 2,052 the condition literally re-reads the same `len` the prologue cached, and
`loopHoistOpen` (`wasmEmit.vl:9045`) already establishes the two facts that make them equal:
`hoistSafeBlock` proves no call in the body can reallocate the list, and
`blockReboundsName`/`exprReboundsName` prove the receiver is not rebound. What remains is the
induction variable's lower bound — `i >= 0` — which is syntactic for a `ForRange` and a
two-line analysis for the `let i = 0` / `i = i + 1` `while`.

*Change.* Where the loop condition is `<iv> < <recv>.length` for the row's own receiver, the
row is live, and `<iv>` is a local whose only writes in the loop add a positive literal from a
non-negative start, emit the hoisted access without the guard. Every other access keeps it.

*Size* M. *Risk* **high** — this removes a trap. A wrong answer is a silent read of a list's
slack capacity, which is clause 1. **Proof:** the seven `tests/cases/loops/hoist-*.vl` fixtures
sit at the legality boundaries already, `tests/vl_hoist_trap_iteration_test.ts` pins WHICH
iteration an out-of-range read traps on (which `@trap` cannot see), and a new fixture is owed
for each of: a body that mutates `i`, a `break` past the bound, a nested loop over the same
receiver, and a receiver aliased to a second name. The win is wasmtime's — §E4 records that V8
folds the reload itself — so grade it on `bench/` under both engines before believing a number.

---

## 8 · `ExpCtx` landed the ladders; the ambient globals grew

First-pass §6.1 counted **16** `pending*` globals and **311** write sites, and #2589/#2596
collapsed the four cell-seed ladders onto `expCtxForCell`. Re-derived today (declarations
excluded; `parser.vl`'s six `pendingGt` writes share a prefix and nothing else and are not
counted):

| file | writes |
|---|---:|
| `wasmEmit.vl` | 287 |
| `emit_sections.vl` | 42 |
| `emit_collect.vl` | 1 |
| **emitter total** | **330** |

**311 → 330 across the two commits**, over 18 distinct globals. The four ladders did what the
row said — `emitGlobalSection` fell 19 → 12 — and the growth is elsewhere:

| function | writes | first pass |
|---|---:|---:|
| `wasmEmit.vl emitDirectCall` | **37** | 35 |
| `emit_sections.vl emitStartFnCode` | 30 | 28 |
| `wasmEmit.vl emitAssign` | 29 | 29 |
| `wasmEmit.vl emitLetDeclStmt` | 27 | 25 |
| `wasmEmit.vl emitVariantFieldValue` | 24 | 24 |
| `wasmEmit.vl emitStructFieldValue` | 21 | 21 |
| `wasmEmit.vl emitReturnValue` | 20 | 20 |
| `wasmEmit.vl expCtxApply` | 17 | (the resolver) |

The remaining 102 writes in `emitDirectCall` / `emitVariantFieldValue` /
`emitStructFieldValue` / `emitReturnValue` are **delivery** ladders, not cell-seed ladders, and
`ExpCtx` was never pointed at them. `emitDirectCall` (`wasmEmit.vl:20566`) is the worked case:
it saves four fields (`pendingF32`, `pendingF64`, `pendingLitUnion`, `pendingNulLitUnion`) and
then clears six more (`pendingStructIdx`, `pendingListKind`, `pendingListSlot`, `pendingI64`,
`pendingMapSlot`, …) **without saving them**. Its own comment names the defect that put the
first four there. The six unsaved ones are the shape D964 came from, and the `ExpCtx` header
says it in one sentence: *"a hand-rolled save/restore at every site risks a leaked seed."*

*Change.* Point `expCtxHere` / `expCtxApply` / `emitExprExpect` at the four delivery ladders,
the way #2589 pointed them at the four cell-seed ladders — starting with `emitDirectCall`,
whose argument boundary already has a `matrix.py` template family. *Size* M. *Risk* med: the
six cleared-without-saved fields may be deliberate (the caller re-seeds), and step one is a
table of which, with a witness per row, not a merge. *Proof*: byte-identical seed;
`regress.py`; `scripts/capability-probes/matrix.py` over the argument, field and return
positions.

---

## 9 · The refusal population grew and its fixture coverage did not

Balanced-paren extraction of every `emitFail` / `emitFailAt` argument in the thirteen emitter
files, definitions excluded (§12):

| | `facb9f610` (first pass) | `153760e1d` |
|---|---:|---:|
| call sites | 527 | **534** |
| message appears under `tests/` | 71 | **69** |
| appears nowhere | 456 | **465** |
| `@emit-error` fixtures | 86 files / 78 texts | **86 / 78** |

By file today: `wasmEmit.vl` 440, `emit_collect.vl` 27, `emit_bytes.vl` 24,
`emit_sections.vl` 21, `emit_mono.vl` 13, `emit_classify.vl` 9.

The first pass proposed *"making the ratio visible … running it in `gate.sh` would turn '456
untested' into a number that moves"*. It moved — in the wrong direction, by nine, in two days,
because the fixture side is flat while the site side is not. **This is the ratchet argument
exactly**: nobody noticed, and nobody could have, because there is no committed number.

*Change.* A sixth per-file ratchet on `scripts/ratchet.py`'s shared core — untested emit
refusal sites per file, baseline committed, may only fall, `--why` naming what left. It reds
on a NEW untested refusal, which is the direction that matters, and shrinks as fixtures land.
It must not demand fixtures for the floors no `vl check`-clean program can reach:
`emit-refusal-reachability-2026-09.md` puts ≈187–328 of the sites reachable, so a per-file
count that only ratchets is the right instrument and a target is not. *Size* S. *Risk* none.
*Proof*: its own `--check`, plus `tests/vl_comment_budget_test.ts`'s shape — the script and any
lint half must agree hit for hit.

Two related counts, re-derived. `goal-scoreboard.py --sites` reads **22** capability literals,
all 22 reached by no corpus cell, twelve of them in `wasmEmit.vl` — unchanged from the first
pass. And the destringify program's parser list is called **407** times across `compiler/*.vl`
(206 in `emit_classify.vl`, 62 `emit_base.vl`, 55 `emit_collect.vl`, 41 `typecheck.vl`) — not
comparable to the first pass's 431, because this scan's parser list is six names longer, so
the two numbers count different populations and only the concentration carries across: **51%
of the calls are still in one file.** §3.2 names where that concentration costs most.

---

## 10 · The state-leak harness is 28 programs against 563 mutables

`scripts/emitter-state-audit.py` at this commit: **563 module-scope mutables** in the emitter —
177 prologue-cleared, 149 pass, 60 frame, 81 inner, **96 never cleared** — and **2 of 25** frame
flags asymmetric, which are exactly D1006 and D1007. The instrument is healthy (#2564 fixed
it) and its two survivors are the two filed rows.

`tests/vl_instance_state_leak_test.ts` pins the general invariant — *compiling P on a reused
instance must be byte-identical to compiling P fresh* — with **28 hand-picked programs**. That
is the right invariant and a hand-picked population, and the file says so. Against 96
never-cleared mutables it is a sample, not a sweep; and this class surfaces as *"a scatter of
unrelated failures with no common cause"*, which is what cost D986 a bisect.

*Change.* Not more hand-picked programs — the same oracle over a wider set. The distilled
corpus already holds 1,477 programs chosen to be behaviourally distinct, and the harness's
comparison is byte-identity, which needs no expected output. Running the shared-instance sweep
over a few hundred of them, in a fixed shuffled order, costs one instance and would cover flag
families nobody picked a program for. *Size* S–M. *Risk* none. *Proof*: the harness's own
oracle; a new leak must name its first divergent compile, which the file already does.

---

## 11 · The long functions, unchanged

The ten longest emitter functions at this commit, and whether the first pass's seam still
reads right:

| lines | function | seam | still worth it? |
|---:|---|---|---|
| 867 | `wasmEmit.vl:21384 emitCoalesce` | shape dispatch, then a rep ladder | yes — unchanged since `facb9f610` |
| 707 | `wasmEmit.vl:14195 emitAssign` | three target arms | yes, and it is nearly free |
| 697 | `emit_collect.vl:4862 collectA` | now THREE phases with a named resume mark (#2604) | **the seam is now written** — `caPopFieldTail` (`:4804`) names the M/W/F boundary, so a split follows the resume rather than inventing a cut |
| 653 | `emit_mono.vl:2929 monoMakeInstance` | keying, cloning, pins | grade any split on `mono-tyaram-grid.sh` |
| 604 | `wasmEmit.vl:6012 emitArr` | element-rep dispatch | yes |
| 600 | `emit_sections.vl:4600 emitTypeSection` | one block per WasmGC family | yes |
| 550 | `wasmEmit.vl:13419 emitCall` | intrinsic / member / direct / indirect | yes |
| 475 | `emit_bytes.vl:1370 fbEmitLocalsVec` | one block per scratch frame | the three-way walk landed in #2581; this alone buys little |
| 445 | `wasmEmit.vl:3523 emitUnionCoerce` | source-rep ladder | yes |
| 406 | `wasmEmit.vl:16767 emitReturnValue` | the 20-write seed block, then delivery | the seed block goes to §8's resolver |

`collectA` is the one whose answer changed: the first pass said *"not obviously — it is a
single pass and its length is its coverage"*, and #2604 made its three phases explicit and
named the boundary between them. A split into `collectAMarks` / `collectAWalk` /
`collectAFields` is now a rename of what the resume already assumes.

---

## 12 · What I measured and how

Environment: worktree at `153760e1d`, seed copied from the main checkout at the same commit
and **proved a fixpoint** (`compile(seed, master source)` `cmp`-identical, 2,156,482 B).
`scripts/seed-size.py --check` reads +0.3% over the committed baseline, a pass. Box load 6–68
across the session; every ratio is a ratio and every share is a share, so load cancels.
Wall-clock figures are the minimum of three interleaved runs and are quoted only where a ratio
is the point.

**Interpreter note.** Homebrew's `python3` (3.14) broke mid-session with a `GLIBC_2.38` link
error. Every number in this document was re-derived under `/usr/bin/python3` (3.12.3) and
reproduces identically; the readings taken before the break were confirmed, not assumed.

**Ratchets and scoreboards**, all re-derived here:

```sh
python3 scripts/scan-budget.py          # 102 arena scans outside a pass (28 emit_classify, 27 emit_collect)
python3 scripts/ladder-budget.py        # 440 silent kind ladders, 8 split walks
python3 scripts/sentinel-budget.py      # 379 unguarded sentinel-index reads (170 emit_classify, 76 wasmEmit)
python3 scripts/goal-scoreboard.py --sites   # 22 capability literals, 22 reached by no corpus cell
python3 scripts/emitter-state-audit.py  # 563 mutables · 96 never cleared · 2 of 25 asymmetric
python3 scripts/seed-size.py --check    # 2,156,482 B, +0.3%
python3 scripts/export-budget.py        # 0
python3 scripts/comment-budget.py       # 0 / 0 / 0 / 0
```

**Profiles.** One `--names` seed built once
(`vl build compiler/entry.vl -o names.wasm --names --compiler build/vl-compiler.wasm`,
2,265,251 B), then per arm
`VL_PROFILE_GUEST=p.json vl build <arm> -o o.wasm --compiler names.wasm` and
`scripts/profile-rank.py`, `scripts/perf/profile-parents.py`, `scripts/perf/profile-phases.py`.
The arms are `tests/vl_scaling_shape_test.ts`'s own generators, transcribed line for line into
a Python script and checked against the file: `genFunctions`, `genUnions`, `genCallbacks`,
`genPins`, `genClosures`, `genCallSites`. Sample counts: pins 400/800/1,600 = 782 / 1,003 /
6,285; functions = 1,051; unions 400/800/1,600/3,200 = 151 / 463 / 1,621 / 5,840; callbacks
600 = 736.

**The env-parameter probe (§4).** One function appended to `compiler/lint.vl`, two
`vl build compiler/entry.vl` runs to scratch paths, then the file restored and `cmp`-verified.
Section sizes from a short ULEB section walker; instruction counts from
`./node_modules/.bin/wasm-dis` on both seeds. Neither build touched `build/`, so no seed was
poisoned — the tell CLAUDE.md names (unrelated CLOSED rows regressing together) cannot arise
from a build that writes elsewhere. The synthetic control is `genFunctions(5000, 4)` with and
without a function value, and it is in the document because it DISAGREES with the `lint.vl`
reading (+282 B against +82,534 B), which is what located the per-call-site cost model.

**The address-taken census (§4.3).** Every `tests/cases/**/*.vl` built with the plain seed
(2,440 of them succeed), then each module's function-section count and element-section entry
count read by the same walker. A module "carries the convention" iff it has an element
section, which `emit_sections.vl` writes only under `fnValUsed`.

**Structural scans**, one pass each over the thirteen emitter files, with a brace-depth
function splitter that starts counting after the first `{` (a multi-line signature otherwise
closes a function on its first line):

* *lengths* — 2,817 functions, median 12, 129 over 100, 41 over 200, 10 over 400.
* *exact duplicates* — normalise identifiers to `X`, numbers to `N`, strings to `S`, hash the
  token stream after the opening brace, group. 54 groups.
* *near duplicates* — the same token streams compared with `difflib.SequenceMatcher`, bucketed
  by token count so the compare stays bounded, over the 1,181 functions of ≥ 15 lines. 1,664
  pairs at ≥ 70%.
* *`pending*` writes* — line-anchored assignment match, declarations excluded, each hit
  attributed to its enclosing function. 330 in the emitter, 18 distinct globals.
* *`emitFail` sites* — balanced-paren extraction of the first argument with string-literal
  awareness, then a verbatim substring test of each ≥ 20-character literal against the
  concatenated `tests/` tree.
* *in-place arena writes* — `<x>.<field> =` where `<x>` was bound from `P.nodes[…]` or from a
  name that was. 116 candidates; the 16 in `wasmEmit.vl` are `ExpCtx` fields and are false
  positives, which §6 states rather than silently dropping.
* *loop bound shapes* — `while <iv> < <recv>.length` against `while <iv> < <n>` with
  `<n> = <recv>.length` bound in the same file and never reassigned, over `std/`, `compiler/`,
  `bench/`, `tests/cases`.
* *type-string parse calls* — the destringify program's own parser list, comment lines and the
  parsers' own declarations excluded. 407.

**Counted by hand, and where it would have been wrong.** The `emitFail` population is 534
including the two definitions' calls to each other and 532 excluding them — this document says
534 and says which. The `pending*` count excludes `parser.vl`'s `pendingGt`. The
delegation-wrapper count (102) requires the body to be one call after comments and blanks are
stripped, which is what separates it from a two-line function; the raw line-count version is
about 20% higher.

**Not run:** the full census (a discovery instrument, forbidden by the brief), `gate.sh`, and
any build of a proposed change. Every "proof" column states what such a compile would have to
show. `deno test -A --no-check tests/vl_inventory_refs_test.ts` was run and is green.
