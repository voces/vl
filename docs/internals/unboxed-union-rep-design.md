# The UNBOXED union rep — and the measurement that says the REP is not the problem

**Verdict: the rep change is REFUSED, and a non-rep phase 1 is recommended in its
place.** The union box `(struct (field i32) (field anyref))` melts completely under the
*shipped* release profile — no new wasm vocabulary, no ABI change, no boundary change —
**whenever it is constructed at exactly ONE allocation site**. VL constructs it at one
site *per arm*. That is the whole defect, and it is an emitter-shape defect, not a
representation defect. Four candidate representations were hand-written, validated, run
and timed against today's output; **the one that wins is "keep the rep, sink the
construction"**, and it beats `ref.i31` on every axis measured.

Measured off `master` at `0ab94642` (post-#1318), with a seed-built compiler
(`scripts/refresh-compiler.sh`, which reports *"the seed IS the fixpoint"* at this base),
binaryen 130, wasm-tools (shipped-proposals default), wasmtime 47 via `vl-host`, and
V8 (node 24.18).

---

## 0. The ask, and the row it follows

`docs/internals/opt-profile-design.md` §3 item 0 (#1318) measured that `vl build -O3`
melts record and list-wrapper scratch completely but leaves a UNION box standing the
moment the narrowed value is read:

| shape (same loop/helper/profile) | none | release |
| --- | ---: | ---: |
| scalar union `i64\|boolean`, tag test only | 4 | 0 |
| struct union `Hit\|Miss`, tag test only | 4 | 2 |
| scalar union, payload read | 4 | **4** |
| struct union, field read | 4 | **4** |

and filed the conclusion that *"a kernel that writes `if e is Unit { e.hp … }` allocates
once per trip at every optimization level available today."* That doc names the follow-up
this document answers: *"what would move it is an unboxed union rep — the tag carried
without a heap object at all — which is a different and much larger question."*

It turns out to be a *smaller* question than that, and the melt table's own headline —
**"the discriminating variable is whether the narrowed value is consumed"** — is
incomplete. §2 replaces it with a two-variable rule, and §2's second variable is the one
the fix hangs on.

The instrument was cross-checked against the shipped fixtures before anything else was
measured: `union-box-call` 4→0, `union-box-payload-read` 4→4, `union-box-branch-local`
4→2, reproducing §2 and §3 of `opt-profile-design.md` to the digit.

---

## 1. THE POPULATION

Three censuses, three units. Each unit is stated because they do not agree and are not
supposed to: a *spelling* is what a programmer writes, a *site* is what the emitter
emits, and a *function* is the scope binaryen's Heap2Local reasons in.

### 1.1 SOURCE spellings, by union KIND

**UNIT: one row per union type EXPRESSION written in an annotation position** — a type
expression containing a top-level `|`. The same spelling written twice counts twice; the
question is how much code writes unions, not how many distinct unions exist. Script in
§8.1; comments and string literals are blanked first, multi-line spellings are joined.

`tests/cases/**` — **1,715 files, 708 (41.3%) write at least one union**:

| kind | spellings | share |
|---|---:|---:|
| nullable (`T \| null`) | 849 | 41.7% |
| mixed (scalar + struct/composite) | 430 | 21.1% |
| all-scalar | 335 | 16.5% |
| litunion (all members quoted) | 224 | 11.0% |
| all-struct | 179 | 8.8% |
| mixed-litunion | 17 | 0.8% |
| **total** | **2,034** | |

`compiler/*.vl` + `std/*.vl` — **32 files, 9 write a union, 56 spellings**: nullable 42
(75.0%), all-scalar 8 (14.3%), litunion 4 (7.1%), all-struct **2** (3.6%). One of those
two all-struct rows is `type Node` (`compiler/ast.vl:278`), a **41-arm** union, and it is
the single most-executed union in the project.

**The compiler is not a representative consumer and must not be read as one.** It writes
56 union annotations in 101,222 lines, 75% of them `T | null`; and its unions are AST
nodes stored in a module-global array, so they *escape* and could never melt under any
rep. The corpus is the population that speaks for user code.

### 1.2 EMITTED sites — the melt-relevant unit

**UNIT: one row per union-box INSTRUCTION in the emitted module.** The box is the unique
type `(struct (field i32) (field anyref))` — exactly one per module (`uBoxIdx`,
`compiler/emit_state.vl:1018`, *"All unions SHARE one box heap type"*; verified: exactly
one such type in `build/vl-compiler.wasm`'s 2,953 types). Commands in §8.2.

1,404 of the 1,715 corpus cases build to a module. The other **311 are deliberate rejects
and multi-file cases** — checked, not assumed: `soundness/` 53, `types/` 44, `modules/` 32
(these need the import graph, not a single-file build), `std/` 21, `maps/` 17, and the
sampled stderr is `Error: type error` / `Error: emit error` on `error-*.vl` fixtures.
**527 of the 1,404 (37.5%) contain a union box.** Across them:

| instruction | count | what it is |
|---|---:|---|
| `struct.new <box>` | **1,537** | a union VALUE constructed |
| `struct.get <box> 0` | 1,342 | a TAG read (`is`, `??`, `==`) |
| `struct.get <box> 1` | **1,396** | a PAYLOAD read — the narrowed value being used |
| … of which followed by `ref.cast` | **1,396** | **100%** |

Every single payload read in the corpus is immediately followed by a `ref.cast`. That is
the second discriminator §3 spends.

The 1,537 constructions, bucketed by what produced the payload operand (the instruction
immediately preceding, in `wasm-tools print`'s flat form) — which decides whether the
value costs **one** allocation or **two**:

| payload operand | sites | share | allocations per value |
|---|---:|---:|---:|
| `struct.new` of a variant/record type (struct arm) | 548 | 35.7% | **2** |
| `struct.new` of `$vbI32`/`$vbI64`/`$vbF32`/`$vbF64` (scalar arm) | 514 | 33.4% | **2** |
| `global.get` (a pooled string literal) | 180 | 11.7% | 1 |
| `ref.null` (the null arm) | 165 | 10.7% | 1 |
| an existing ref (`local.get`/`call`/`array.get`/…) | 130 | 8.5% | 1 |

**1,062 of 1,537 (69.1%) union-value constructions cost TWO allocations.**

Per module: **379 of the 527 (71.9%) read the payload**, 22 are tag-test-only, 126
construct without testing. The tag-only shape that `opt-profile-design.md` §2's headline
row melts is **4% of the union-using corpus**.

`build/vl-compiler.wasm` (1,113,946 B) on the same unit: **56** constructions (51
struct-arm, 4 scalar, 1 null), **3,321** tag reads, **5,942** payload reads, again 100%
cast-followed. Through the shipped release profile it becomes 51 / 3,225 / 4,503 — **5 of
56 construction sites melt (8.9%)**, on the only large non-foldable VL program that
exists.

### 1.3 SITES PER FUNCTION — the number the recommendation turns on

**UNIT: one row per emitted wasm FUNCTION that constructs at least one union box**, and
the bucket is how many `struct.new <box>` sites it contains. This is the right unit
because binaryen's Heap2Local scalarizes **per allocation site** (§2), so a function with
two sites feeding one value cannot melt either of them.

Corpus, 775 such functions:

| sites in the function | functions | share |
|---:|---:|---:|
| 1 | **417** | **53.8%** |
| 2 | 195 | 25.2% |
| 3 | 76 | 9.8% |
| 4 | 38 | 4.9% |
| 5 | 15 | 1.9% |
| 6+ | 34 | 4.4% |
| **≥2** | **358** | **46.2%** |

And where in the function each of the 1,537 sites sits, bucketed by the instruction that
follows it:

| position | sites | share |
|---|---:|---:|
| `local.set` (a `let`/`const` binding or scratch slot) | 464 | 30.2% |
| call argument | 335 | 21.8% |
| **`return` (+5 implicit tail)** | **309** | **20.1%** |
| nested into another allocation (field / element being built) | 229 | 14.9% |
| `global.set` | 39 | 2.5% |
| mid-expression operand (`i32.const`, `local.get`, …) | 161 | 10.5% |

### 1.4 REFUTED: the corpus cannot measure the melt

The obvious next census — run the release profile over all 1,404 modules and count what
survives — was run, and its answer is **8 modules still contain a box type and 3
constructions survive**. That is not a melt result; it is a constant-folding result.
Corpus cases are straight-line `print` programs over literal inputs, and
`--closed-world -O3 --gufa -O3` evaluates them at compile time: `unions/paren-is-narrow`
comes out of the profile as a module whose entire body is `global`-initialised constants
and a `start` that prints them. **The corpus measures the SOURCE population; only a
parameterised loop measures the melt**, which is why `tests/fixtures/opt-melt/` exists and
why §3's probe is hand-written rather than swept.

---

## 2. THE MECHANISM — a two-variable rule, and the correction it forces

`opt-profile-design.md` §3 item 0 concludes *"the discriminating variable is whether the
narrowed value is consumed."* That is true **at two or more allocation sites and false at
one**, and the difference is the entire design. Four VL programs, one cell each, all
built with the shipped compiler and the shipped release profile (§8.3):

| box construction sites | payload read? | allocation sites none → `-O3` | witness |
|---:|---|---:|---|
| 1 | **yes** | 2 → **0** | `spell3.vl` (§8.3) |
| 1 | no | 2 → **0** | `spell4.vl` |
| 2 | no | 4 → **0** | `tests/fixtures/opt-melt/union-box-call.vl` |
| 2 | **yes** | 4 → **4** | `tests/fixtures/opt-melt/union-box-payload-read.vl` |

**The rule, corrected: a union box melts when it is constructed at ONE allocation site,
whatever is done with it; at two or more sites it melts only if the payload is dead.**

The mechanism is the one `opt-profile-design.md` §3 item 1 already names for
`union-box-branch-local` — *"Heap2Local scalarizes per allocation site, so when two sites
merge into one local, neither can own it"* — and the finding here is that **it is the same
mechanism, and it reaches the return path too**. A helper with two `return` statements is
two allocation sites just as surely as a `let` written on two branches is.

That also means §3 item 1's shipped guidance is not sufficient as written:

> *"Build it with `const u = <helper call>`, not by assigning a `let` on two branches."*

`union-box-payload-read.vl` **is** written with `const u = <helper call>` and does not
melt, because the *helper* has two returns. Rewording is proposed in this PR's body.

### 2.1 There is no VL spelling that reaches one site — measured

If a one-site construction is what melts, the cheapest possible fix would be a documented
source pattern. There is none. Three spellings of the same two-armed producer, all built
and counted (§8.3):

| spelling | `struct.new <box>` sites | allocation sites none → `-O3` |
|---|---:|---:|
| two `return`s (the fixture) | 2 | 4 → 4 |
| one `return` of an **if-expression** (`spell1.vl`) | 2 | 4 → 4 |
| one `return` of a **local assigned on two branches** (`spell2.vl`) | 2 | 4 → 4 |
| ONE-ARM producer (`spell3.vl`, the control) | **1** | 2 → **0** |

`emitUnionIfValue` emits a value-typed `if` whose blocktype is `(ref $uBox)` and routes
**each arm** through `emitUnionCoerce`; the `let`-on-two-paths form does the same. Every
VL spelling of a two-armed union producer emits two boxes. **Candidate (d) — "do nothing
and document the fast pattern" — is refuted: there is no fast pattern to document.**

**This table is the measurement that MOTIVATED the work and is no longer the emitter's
behaviour.** The first two rows are now 1 site and 3 → 2: §10 sinks the two-`return`
form and §11 splits the if-expression into the same per-arm exits. Only the third row —
a local assigned on two branches — still reads as written; it is the open phase-2 shape.

### 2.2 REFUTED: no binaryen flag set reaches it

Before proposing emitter work, 16 flag sets were run against today's output of the
canonical loop (§8.4). **All 16 leave all 4 allocations**, and 13 of them produce
byte-identical output (179 bytes) to the shipped profile:

`--closed-world -O3 --gufa -O3` (shipped) · that set twice · three times ·
`+ --type-ssa` · `+ --type-ssa --type-merging` · the `wasm-toolchain-audit.md` §1 full
pipeline · `+ --flatten --rereloop` · `+ --local-cse --precompute-propagate` ·
`--heap2local` ×5 after `-O3` · `--type-ssa --heap2local` · `--type-refining` ×2 ·
`--gsi --cfp --gto` · `--monomorphize` — all **4**.
`--monomorphize-always` (and the two sets containing it) make it **8**.

The shipped four-flag profile is already at binaryen's ceiling for this shape. **The lever
is in the emitter or nowhere.**

---

## 3. THE CANDIDATE REPRESENTATIONS, PRICED

Every row was hand-written as WAT, parsed and validated with `wasm-tools validate`, run
under wasmtime through `vl run`, and checked against the same oracle (all 16 modules print
`350`). §4 has the numbers; this section has the properties.

| # | candidate | allocs / value | new wasm vocabulary | `is` stays a field-0 read? | crosses the module boundary? | what breaks |
|---|---|---:|---|---|---|---|
| **a** | `ref.i31` tagged-pointer payload | 2 → **1** (kinds 0/1 only) | `ref.i31`, `i31.get_s/u`, `ref.cast (ref i31)` — **zero i31 in the compiler today** | **yes**, untouched | yes (i31ref never reaches an export) | covers 2 of the 5 boxed kinds; **31 bits cannot hold VL's full-range `i32`**; `atomIsRefKind` becomes a 3-way payload discipline consumed at 8 unbox sites |
| **b** | multi-value `(i32, T)` result | 2 → **0** | multi-value results — **and `--enable-multivalue`, which `BINARYEN_FEATURES` does not have** | no — the tag is a stack value / local | yes, if no union is exported (none is) | result arity is hard-coded to 0-or-1 at 5 functype sites; the sig-key vocabulary is **one char per slot**; `fRetKind` is a scalar; the `??` stash is one slot; the value-`if` blocktype is one valtype byte |
| **c** | scalarize a non-escaping union LOCAL into (tag, payload) locals | 2 → **0** | none | no | n/a (never crosses) | the emitter is one-slot-per-binding at 9 named places (§5.3); `emitIs`'s 6 receiver forms each double |
| **d** | leave it alone, document the fast pattern | 2 | none | yes | yes | **refuted — §2.1: no VL spelling produces the fast pattern** |
| **e** | payload-TYPED box `{i32 tag, T payload}` per scalar rep | 2 → **1** | none | **yes**, untouched | yes | one box type per rep instead of one module-wide; only expressible when every arm shares a scalar rep; mixed ref/scalar unions still need the anyref |
| **f** | drop the tag, discriminate with `ref.test` | 2 → **1** | `ref.test` | **no** | yes | **refuted by the code** — see below |
| **g** | **SINK the construction to one site; rep unchanged** | 2 → **1**, and the box itself **melts at `-O3`** | **none** | **yes**, untouched | **yes, untouched** | two reserved locals and one exit block per union-returning function |

Candidate **e** is not new: `compiler/emit_state.vl:1037` records that the retired
TypeScript host *"uses a payload-typed box (`{tag, i32}`) when every member shares one
scalar rep — the 'value' kind"*, and that the self-hosted emitter dropped it because the
shared-`anyref` route *"reuses the single interned `uBoxIdx` machinery."* That trade is
priced for the first time in §4.

**Candidate f is refuted by two facts in the tree, not by argument.**
1. `emitUnionUnionEq` compares **tag to tag** — `compiler/wasmEmit.vl:3499-3502` pushes
   `struct.get <box> 0` for both operands and `i32.eq`s them, with no constant anywhere.
   The tag is a first-class comparable i32, not a switch selector, so a rep that only
   recovers it through a `ref.test` ladder loses the site.
2. **The wasm heap type does not discriminate the arms.** `i32` and `boolean` share
   `$vbI32` (`emit_state.vl:1032`, *"keyed by wasm rep — boolean shares the i32 box"*), and
   `buildVariantTwins` (`compiler/emit_classify.vl:13818`) deliberately **collapses
   structurally identical variants onto one heap type** — `uVarTwin[i]` is the smallest
   earlier layout twin, keyed on `repNameCanonKey` + `variantFieldLayoutEq`. Two arms can
   therefore be the same wasm type by construction.

**A16 is not the fix, and this measurement agrees — with one correction.**
`litunion-compact-rep-design.md` §5/§6 price every payload encoding at *one allocation,
the box only*, and conclude the allocation rationale is refuted. That is correct **for the
litunion arm**, whose payload is a pooled string literal reached by `global.get`. It is
not the general case: §1.2 measures that **69.1% of union constructions allocate twice**,
because a scalar arm's payload is a `$vbI32`/`$vbI64`/`$vbF32`/`$vbF64` heap object. So
`ref.i31` really does halve the allocation count for kinds 0 and 1 — it just does not
**melt** anything (§4), which is what the customer asked for.

---

## 4. THE PROBE — 16 hand-written modules, one loop, one oracle

The canonical loop is `tests/fixtures/opt-melt/union-box-payload-read.vl`, transcribed
instruction-for-instruction from `vl build --wat` with one change: the loop bound is a
parameter of an exported `i32 -> i32` function so the same module can be benchmarked. The
module boundary stays scalar, so `--closed-world` remains sound (DECISIONS H6 /
`opt-profile-design.md` §4). Every module also keeps a `(start)` that prints `tick(100)`,
which is the oracle: **all 16 print 350**, at every rung, under wasmtime.

`allocs` = `struct.new*` + `array.new*` in the whole module — the same unit
`opt-profile-design.md` §2 uses. V8 = min of 7 × `tick(20000000)`, node 24.18.
Native = min of 5 × `vl run` of the same loop with the bound raised, wasmtime 47,
process spawn included. Commands in §8.5.

| id | representation | allocs/value | sites none → `-O3` | bytes `-O3` | V8 ms | native ms |
|---|---|---:|---:|---:|---:|---:|
| **Z0** | *control* — no union at all | 0 | 0 → 0 | 133 | **6.4** | **12** |
| | **`i64 \| boolean`, payload read** | | | | | |
| A0 | **TODAY** | 2 | 4 → **4** | 179 | 61.8 | 68 |
| A6 | today's rep, box **SUNK to one site** | 2 → 1 | 3 → **2** | 158 | **31.0** | 53 |
| A5 | today's rep, ONE site (mechanism witness) | 2 → 0 | 2 → **0** | 149 | **10.9** | 21 |
| A1 | payload-typed box `{i32, i64}` (e) | 1 | 2 → 2 | 167 | 38.6 | 36 |
| A4 | payload-typed box, ONE site (e+g) | 1 → 0 | 1 → **0** | 143 | 11.8 | 20 |
| A3 | no tag, `ref.test` (f) | 1 | 2 → 2 | 154 | 23.0 | 44 |
| A2 | multi-value `(i32,i64)` + scalar locals (b+c) | **0** | 0 → 0 | 156 | **8.0** | 16 |
| | **`i32 \| boolean`, payload read** | | | | | |
| B0 | **TODAY** | 2 | 4 → **4** | 179 | 71.5 | 66 |
| B1 | **`ref.i31`** payload (a) | 1 | 2 → 2 | 171 | 38.2 | 37 |
| B2 | payload-typed box `{i32, i32}` (e) | 1 | 2 → 2 | 164 | 30.6 | 38 |
| B3 | multi-value `(i32,i32)` (b+c) | **0** | 0 → 0 | 150 | 11.6 | 20 |
| | **`Hit \| Miss`, field read — the sim shape** | | | | | |
| C0 | **TODAY** | 2 | 4 → **4** | 177 | 60.8 | 71 |
| C3 | today's rep, box **SUNK to one site** | 2 → 1 | 3 → **2** | 156 | **28.1** | 49 |
| C1 | no box, `ref.test` on the variant (f) | 1 | 2 → 2 | 154 | 22.0 | 45 |
| C2 | multi-value `(i32, anyref)` (b) | 1 | 2 → 2 | 162 | 21.5 | 37 |

### What the ladder says

1. **Nothing melts by changing the payload.** `ref.i31` (B1), the payload-typed box (A1,
   B2), and dropping the tag (A3, C1) all halve the static count 4 → 2 and then **stop**:
   two sites survive the release profile in every one. They buy 1.6× – 2.8× on V8 (A1
   1.60×, B1 1.87×, B2 2.34×, A3 2.69×, C1 2.76×), and they buy it by allocating less, not
   by allocating nothing.
2. **Sinking the construction to one site melts the box**, with the representation, the
   tag bands, `is`, `??` and the boundary all untouched: A6 3 → 2 and C3 3 → 2, where the
   survivors are the two payload allocations (the data) and the casualty is the box (the
   overhead). 61.8 → 31.0 ms and 60.8 → 28.1 ms on V8, 2.0× and 2.2×.
3. **Sink + a single payload type reaches zero**: A5 2 → 0 and A4 1 → 0, at **10.9 ms and
   11.8 ms against a 6.4 ms no-union control** — i.e. within 1.7× of not having a union
   at all, and *ahead of* the zero-allocation multi-value rep on the native host (21/20 ms
   vs 16 ms, all against a 12 ms spawn-dominated floor).
   (A5 is a **mechanism witness only**, not a shippable rep: it parks a `boolean` in a
   `$vbI64` box, which is sound only because nothing reads the boolean arm. A4 is the
   shippable form of the same cell.)
4. **Multi-value is the theoretical floor, and it is barely below the row above it.**
   A2 at 8.0 ms vs
   A5 at 10.9 ms and A4 at 11.8 ms; on the native host A2/B3 are 16/20 ms vs A4/A5 at
   20/21 ms — inside the noise of a 12 ms process floor. The last allocation is worth
   ~2-4 ms per 20 M trips on V8 and nothing measurable natively.
5. **`--enable-multivalue` is missing from the shipped flag set.** All three multi-value
   modules parse and validate under `wasm-tools` (multivalue is wasm 2.0 core) and run
   under wasmtime, and all three are **rejected by `wasm-opt`** with
   `Tuples are not allowed unless multivalue is enabled … [--enable-multivalue]`.
   `BINARYEN_FEATURES` (`scripts/vl-host/src/main.rs:1320`) carries only
   `--enable-reference-types --enable-gc --enable-bulk-memory`. Candidate (b) cannot even
   be measured without a host change; the numbers above were taken with the flag added by
   hand.

---

## 5. THE BLAST RADIUS, read off the code

Counted over `compiler/*.vl` at `0ab94642`. UNIT and exclusion rule stated per table;
comment-only lines are dropped with `grep -vE ":[0-9]+: *//"` (VL has no block comments),
definition lines with `grep -vE "^[^:]*:[0-9]+:(export )?function "`.

### 5.1 The instruction census — 56 sites, all in one file

```
grep -c "fbStructNew(uBoxIdx)"    compiler/wasmEmit.vl   # 18
grep -c "fbStructGet(uBoxIdx, 0)" compiler/wasmEmit.vl   # 20
grep -c "fbStructGet(uBoxIdx, 1)" compiler/wasmEmit.vl   # 18
```

| instruction | sites | file |
|---|---:|---|
| `struct.new $uBox` — CONSTRUCT | **18** | all `wasmEmit.vl` |
| `struct.get $uBox 0` — TAG READ | **20** | all `wasmEmit.vl` |
| `struct.get $uBox 1` — PAYLOAD READ | **18** | all `wasmEmit.vl` |
| `struct.new $vb*` — scalar payload box | 1 | `wasmEmit.vl:3026` |
| `struct.get $vb* 0` + its `ref.cast` | 7 + 7 | `wasmEmit.vl` |
| `ref.cast $uVarHeap[…]` (box payload → variant) | 6 | `wasmEmit.vl` |
| `ref.cast $aTypeIdx` (box payload → string) | 4 | `wasmEmit.vl` |

The box's heap-type index has exactly one spelling, `uBoxIdx` (`emit_state.vl:1018`); no
variable ever holds it. Lines mentioning it, non-comment: `wasmEmit.vl` 59,
`emit_bytes.vl` 5, `emit_collect.vl` 4, `emit_state.vl` 1 — **69 of 103 total mentions**.
`emit_classify.vl`, `typecheck.vl`, `emit_base.vl`, `emit_query.vl` and
`emit_sections.vl` mention it **only in prose**: they are documentation dependencies, not
code dependencies.

Five byte-level sites carry **no searchable token** and a grep census misses all of them:
the box's own type bytes at `emit_sections.vl:2950-2955`
(`wU8(95) wU8(2) wU8(127) wU8(0) wU8(110) wU8(0)`) and the four value-box types at
`2961-2982`.

### 5.2 The field-0 invariant — CONFIRMED, with two qualifications

`litunion-compact-rep-design.md` §1.1 states that *"every consumer (`is`, `??`, the
narrowing push, the unbox reads) reads field 0 and nothing else."* Checked against all 20
field-0 reads: **every one is consumed by `i32.eq` (opcode 70) or `i32.ne` (71) and by
nothing else** — never stored, returned, arithmetic'd or passed. 19 of 20 compare against
a compile-time constant. Two corrections:

- **The 20th compares tag to TAG** (`wasmEmit.vl:3499-3502`, `emitUnionUnionEq`'s chain
  bottom). The tag is materialisable, which is what kills candidate (f).
- **"The narrowing push" is not a consumer at all.** `pushNarrowRep`/`pushNarrow`/
  `pushNarrowIs`/`pushNarrowComplement` (`emit_classify.vl:3999`, `4017`, `4024`,
  `17344`) touch no box instruction; they bank an arena type and a member set. The field-0
  read happens later, in `emitIs`.

Field 1 is read at 18 sites. Exactly **8** of them sit under an instruction-level tag test
emitted a few lines earlier (`wasmEmit.vl:3351`, `3477`, `3480`, `3584`, `3691`, `5031`,
`14867`, `14965` — the `==`, `is`-literal, `??` and map-miss paths). The rest are the
NARROWED-READ family (`:2175`, `:2188`, `:2432`, `:2468`, `:2487`, `:3162`, `:3699`,
`:3763`, `:9805`, `:14323`): they carry no runtime tag test at all, relying on
compile-time narrowing having already run the `is`, with `ref.cast` as the only runtime
backstop. So the honest invariant is: *every RUNTIME DISCRIMINATION reads field 0 and
nothing else; every narrowed payload read reads field 1 with `ref.cast` as its only
runtime check.*

### 5.3 The scalar value boxes, and which kinds pay for one

**Four** value-box types, minted only when used (`emit_collect.vl:2653-2656`, flags set in
`markValueUnionAtoms` at `emit_classify.vl:13954-13962`, bytes at
`emit_sections.vl:2961-2982`): `$vbI32` `$vbI64` `$vbF32` `$vbF64`.

| kind | spelling | second allocation? |
|---:|---|---|
| 0, 1 | `i32`, `boolean` | **yes — `$vbI32`** (boolean shares it) |
| 3 | `i64` | **yes — `$vbI64`** |
| 4 | `f64` | **yes — `$vbF64`** |
| 5 | `f32` | **yes — `$vbF32`** |
| 2 | `string` | no — the `(ref $aTypeIdx)` array rides the anyref directly |
| 6 | `null` | no — `ref.null none` |
| 7-10, 12 | `i32[]`, `f64[]`, `string[]`, `i64[]`, `f32[]` | no — the list wrapper rides directly |
| 11 | closure | no — the `cloStructIdx` fat pointer rides directly |
| — | struct variant / ref-array / map arm | no — tagged out of band, rides directly |

**Boxed = five kinds, four box types.** That is the 33.4% scalar-arm slice of §1.2, and
`ref.i31` could serve only kinds 0 and 1 of it — and only if VL's `i32` were narrowed to
31 bits, which nothing in `valueAtomKind`'s kind-0 arm does.

### 5.4 What each candidate would have to move

**(g) sink the construction — the recommended phase 1.** Touches the CONSTRUCT half only:
the return-position subset of the 18 `fbStructNew(uBoxIdx)` sites, plus two reserved
locals and one exit block per union-returning function. Touches **none** of the 20 field-0
reads, **none** of the 18 field-1 reads, no tag formula, no type byte, no sig token, no
boundary.

**(a) `ref.i31`.** Zero `i31` in the compiler (`grep -rn 'i31' compiler/*.vl` → nothing);
no `fbI31New`/`fbI31Get` builder exists beside `fbStructNew`/`fbStructGet`/`fbRefCast`
(`emit_bytes.vl:574,580,639`). `atomIsRefKind` (`wasmEmit.vl:2414`) becomes a three-way
payload discipline consumed at 8 unbox sites. Field 1 stays `anyref` (i31ref is a
subtype), so the type bytes survive — that is the one axis it is cheap on.

**(c) scalarize the local.** The emitter is one-slot-per-binding at nine named places:
`addLocalName(…, "union", -1)` (`emit_collect.vl:1643`, `1753`), the valtype byte
(`emit_bytes.vl:1548-1551`), the local run (`emit_bytes.vl:1235`), the single `local.get`
recovery (`emitUnionBoxPush`, `wasmEmit.vl:2316`), the non-defaultable pre-seed
(`emitNulNullToLocal`, `wasmEmit.vl:7810`), the nullable-`if` binding
(`wasmEmit.vl:11851-11880`), and the `slotKind == "union"` string test at eight query
sites. And a union value must be ONE ref wherever it is stored in a single slot: struct
field code 16 (`pushFieldStorage`, `wasmEmit.vl:811-816`; 20 sites test `== 16`), variant
field, array element (`rlElemHeap[rs] = uBoxIdx`, `emit_collect.vl:2765`), map value
(`emit_bytes.vl:764-773`), module global (`emit_sections.vl:1226`, `3663`), call argument
(`wasmEmit.vl:9272`, `14276`, `14392`), return (`wasmEmit.vl:11489`), and the value-`if`
blocktype (`wasmEmit.vl:3092`).

**(b) multi-value.** Five functype sites hard-code result arity 0 or 1
(`emit_sections.vl:2806`, `2814`, `2833`, `3206`, `3208`, plus the synthesized-signature
path at `2751-2765`); the sig-key vocabulary is a **one-character-per-slot** bijection
(`repSigTokOfKind`/`repKindOfSigTok`, `emit_rep.vl:155`, `240`; `"u"` is one box) with no
spelling for a pair; `fRetKind[i]` is a scalar (`emit_collect.vl:1255`); the `??` call
stash is exactly one `(ref $uBox)` local (`emit_bytes.vl:1232-1236`,
`wasmEmit.vl:14855`); the value-`if` blocktype is one valtype byte
(`wasmEmit.vl:3092`) and the emitter mints no functype blocktypes; and
`emitUnionUnionEq` **re-evaluates its operand 2-6 times** (`wasmEmit.vl:3462-3501`,
gated by `unionEqOperandOk` at `emit_base.vl:655`), which a two-value producer cannot
satisfy. **This is a rewrite of the signature layer, not a slice** — and the number that
shows it is the one-character sig token, because every param and result rep in the whole
ABI key vocabulary is one character wide.

---

## 6. THE RULING

**REFUSED: no representation change.** Every rep candidate was measured and none of them
melts the box; the two that reach zero allocations (b, c) cost the signature layer, and
the one the adjacency invites (`ref.i31`) covers 2 of 5 boxed kinds, cannot hold a
full-range `i32`, needs an instruction family the emitter has never emitted, and still
leaves the allocation standing at `-O3`.

**RECOMMENDED phase 1 — SINK the union box to one construction site in the RETURN path.**

In a function whose declared result is a boxed union, every union coercion at return
position writes `(tag, payload)` into two reserved locals — an `i32` and an `anyref` — and
branches to a single exit that performs the one `struct.new $uBoxIdx`.

- **What it is worth**: the box melts entirely under the *shipped* release profile.
  Measured on the canonical loop as A6 (3 → 2 sites, 61.8 → 31.0 ms V8) and on the sim
  shape as C3 (3 → 2, 60.8 → 28.1 ms). On the shipped fixture `union-box-payload-read.vl`
  the unoptimized count should go **4 → 3** (one of the two boxes disappears) and the
  `-O3` count **4 → 2** (the surviving box melts). That pair is the gate, and the melt
  table in `opt-profile-design.md` §2/§3 is where it gets pinned.
- **What it costs**: two locals and one block per union-returning function, and a rewrite
  of the union arm of the return path. It touches none of the 20 field-0 reads, none of
  the 18 field-1 reads, no tag band, no type byte, no signature token, no module boundary,
  and no checker.
- **Its population**: **309 of 1,537 corpus construction sites (20.1%)** are in return
  position, spread over the 358 functions (46.2%) that construct at two or more sites.
- **The host prerequisite is zero.** Unlike candidate (b), nothing in
  `BINARYEN_FEATURES` has to change.

**Phase 2, filed not recommended: the same sink at `local.set` position** (464 sites,
30.2%) — a `let`/`const` binding written on two branches, which is
`opt-profile-design.md` §3 item 1's own row. Same transform, different position; it should
be a separate slice because the binding's slot lifetime is the part that can go wrong.

**Phase 3, filed: the payload-typed box for all-scalar unions** (candidate e). With phase
1 it reaches **zero** (A4: 1 → 0, 11.8 ms against a 6.4 ms no-union control). Its
population is the 335 all-scalar spellings (16.5%) plus the litunion rows; its cost is one
box type per scalar rep instead of one module-wide, which re-opens the type-index
questions `litunion-compact-rep-design.md` §7.1 hands to the owner. **Do phase 1 first and
re-measure** — phase 1 alone already collects the larger half of the win.

**Not recommended at any phase: `ref.i31` (a), multi-value (b), local scalarization (c),
dropping the tag (f), and doing nothing (d).** (f) is refuted by the tag-to-tag compare
and by twin collapse; (d) is refuted by §2.1; (a) does not melt; (b) and (c) are the
signature layer.

---

## 7. Side findings (filed here because the witnesses were built here)

Both were found while trying to construct a struct-union witness for candidate (f). Both
are small programs, neither is fixed by this document, and neither is in the corpus.

1. **The compiler TRAPS on a call result returned from a struct-union-typed function.**
   `vl build` exits 1 with `wasm trap: out of bounds array access` and writes nothing —
   a compiler-side crash, not a diagnostic. Witness (`callret.vl`, §8.6): a function
   `boxOf(i): Hit | Miss` whose first `return` is `mkHit(7)` (a *call*) rather than an
   object literal. Replacing the call with the literal compiles and runs.
2. **Two structurally identical variants of one union are a loud emit reject.**
   `type Cat = { n: i32 }` / `type Kot = { n: i32 }` with `pick(): Cat | Kot` gives
   `emitProgram: ref valtype with no interned shape`; the same program with a narrowing
   `is` gives `emitProgram: is receiver is not a union value`. This is
   `buildVariantTwins`' collapse (§3, candidate f) surfacing as an expressiveness gap.

---

## 8. How to re-verify each headline, from a clean checkout

```
bash scripts/fetch-seed.sh && bash scripts/refresh-compiler.sh
VL=scripts/vl-host/target/release/vl      # the host
SEED=build/vl-compiler.wasm
WT=wasm-tools                             # shipped-proposals default feature set
WO=node_modules/binaryen/bin/wasm-opt
FEAT="--enable-reference-types --enable-gc --enable-bulk-memory"
REL="--closed-world -O3 --gufa -O3"
```

### 8.1 §1.1 — source spellings by kind

Save as `kindcensus.py` and run
`python3 kindcensus.py $(find tests/cases -name '*.vl' | sort)` and
`python3 kindcensus.py compiler/*.vl std/*.vl`.

```python
import re, sys, collections
PRIM = {"i32","i64","f32","f64","boolean","string","char","void"}
def blank(s):                      # drop // comments and string bodies
    o,i,n=[],0,len(s)
    while i<n:
        c=s[i]
        if c=='/' and i+1<n and s[i+1]=='/':
            while i<n and s[i]!='\n': o.append(' '); i+=1
            continue
        if c=='"':
            o.append('"'); i+=1
            while i<n and s[i]!='"':
                if s[i]=='\\':
                    o.append(' '); i+=1
                    if i<n: o.append(' '); i+=1
                    continue
                o.append('_' if s[i]!='\n' else '\n'); i+=1
            if i<n: o.append('"'); i+=1
            continue
        o.append(c); i+=1
    return "".join(o)
def take(s,i):                     # the type expression starting at i
    d,st,n,prev=0,i,len(s),':'
    while i<n:
        c=s[i]
        if c=='{' and d==0 and prev not in ":|,<(=": break
        if c in "([{<": d+=1
        elif c in ")]}>":
            if c=='>' and i>st and s[i-1]=='=': i+=1; prev=c; continue
            if d==0: break
            d-=1
        elif c=='\n':
            j=i+1
            while j<n and s[j] in " \t\n": j+=1
            if prev=='|' or (j<n and s[j]=='|'): i+=1; continue
            break
        elif d==0 and c in ",;=":
            if c=='=' and i+1<n and s[i+1]=='>': i+=2; continue
            break
        if not c.isspace(): prev=c
        i+=1
    return s[st:i].strip()
def split(t):
    o,d,cur=[],0,""
    for j,c in enumerate(t):
        if c in "([{<": d+=1
        elif c in ")]}>":
            if not (c=='>' and j>0 and t[j-1]=='='): d-=1
        if c=='|' and d==0: o.append(cur.strip()); cur=""
        else: cur+=c
    o.append(cur.strip())
    return [m for m in o if m]
def kind(ms):
    q=[m for m in ms if m.startswith('"')]; rest=[m for m in ms if m!="null"]
    if q and len(q)==len(ms): return "litunion"
    if len(ms)-len(rest) and len(rest)==1: return "nullable"
    if q: return "mixed-litunion"
    st=lambda m: bool(re.fullmatch(r'[A-Z][A-Za-z0-9_]*',m)) or m.startswith("{")
    sc=lambda m: m in PRIM or m.endswith("[]") or m.startswith('"') or m.startswith("{[")
    if all(st(m) for m in rest): return "all-struct"
    if all(sc(m) for m in rest): return "all-scalar"
    return "mixed"
agg,files=collections.Counter(),collections.Counter()
for p in sys.argv[1:]:
    src=blank(open(p,encoding="utf8",errors="replace").read()); hit=0
    for m in re.finditer(r'(:|\btype\s+[A-Za-z_]\w*\s*(?:<[^>]*>)?\s*=)',src):
        if m.group(0)==':' and m.start()>0 and src[m.start()-1]==':': continue
        t=take(src,m.end())
        if '|' not in t: continue
        mem=split(t)
        if len(mem)<2: continue
        agg[kind(mem)]+=1; hit=1
    files["files"]+=1; files["files_with_union"]+=hit
print(dict(files)); print(agg.most_common(), sum(agg.values()))
```

### 8.2 §1.2/§1.3 — emitted sites

For one module (the box type is unique per module):

```
$WT print M.wasm -o M.wat
BOX=$(grep -oP '^\s*\(type \(;\K\d+(?=;\) \(struct \(field i32\) \(field anyref\)\)\))' M.wat)
grep -cP "^\s*struct\.new $BOX\s*\$"   M.wat     # constructions
grep -cP "^\s*struct\.get $BOX 0\s*\$" M.wat     # tag reads
grep -cP "^\s*struct\.get $BOX 1\s*\$" M.wat     # payload reads
```

On `build/vl-compiler.wasm` that is `BOX=60` and **56 / 3321 / 5942**. For the corpus,
build every case first (`find tests/cases -name '*.vl'`, `$VL build … --compiler $SEED`,
1,404 of 1,715 succeed) and sum. The per-payload-class, per-function and per-position
buckets read the instruction immediately before/after each `struct.new $BOX` in the same
flat listing.

### 8.3 §2 — the melt truth table and the spellings

```
$VL build tests/fixtures/opt-melt/union-box-payload-read.vl -o f.wasm --compiler $SEED
$WO f.wasm $REL $FEAT -o f-o3.wasm
$WT print f-o3.wasm -o f-o3.wat && grep -cE '^\s*(struct|array)\.new' f-o3.wat   # 4
```

The four spellings (write each to a file and run the same three commands):

```vl
// spell1.vl — one `return` of an IF-EXPRESSION.  2 box sites, 4 -> 4
function boxOf(i: i32): i64 | boolean { return if i % 2 == 0 { 7 } else { true } }
// spell2.vl — one `return` of a local assigned on two branches.  2 box sites, 4 -> 4
function boxOf(i: i32): i64 | boolean {
  let u: i64 | boolean = true
  if i % 2 == 0 { u = 7 }
  return u
}
// spell3.vl — ONE-ARM producer, payload READ.  1 box site, 2 -> 0   (prints 4950)
function tick(n: i32): i32 {
  let acc = 0
  let i = 0
  while i < n {
    const u: i64 | boolean = i as i64
    if u is i64 { acc = acc + (u as i32) }
    i = i + 1
  }
  return acc
}
print(tick(100))
// spell4.vl — as spell3 with `acc = acc + 1` (tag test only).  1 box site, 2 -> 0
```

`spell1`/`spell2` reuse the `tick` loop of `union-box-payload-read.vl` verbatim.

### 8.4 §2.2 — the flag hunt

`$WO A0.wasm <SET> $FEAT -o out.wasm` for each of the 16 sets listed in §2.2, then the
allocation count of §8.3. All 16 give 4 (or 8 with `--monomorphize-always`).

### 8.5 §4 — the probe ladder

Each variant is a hand-written `.wat` (A0/B0/C0 transcribed from `vl build --wat`; the
rest written against them). For each:

```
$WT parse V.wat -o V.wasm && $WT validate V.wasm
$WO V.wasm $REL $FEAT -o V-o3.wasm            # + --enable-multivalue for A2/B3/C2
$WT print V-o3.wasm -o V-o3.wat && grep -cE '^\s*(struct|array)\.new' V-o3.wat
$VL run V-o3.wasm                              # the oracle: 350
```

V8 timing: instantiate `V-o3.wasm` with the five `imports.__print_*__` stubs and call the
exported `tick(20000000)`, min of 7. Native timing: substitute the `$main` loop bound with
20000000, re-optimize, `time $VL run`, min of 5.

### 8.6 §7 — the two side findings

```vl
// callret.vl — `vl build` TRAPS: "wasm trap: out of bounds array access"
type Hit = { dist: i32 }
type Miss = { why: i32 }
function mkHit(v: i32): Hit { return { dist: v } }
function boxOf(i: i32): Hit | Miss {
  if i % 2 == 0 { return mkHit(7) }
  return { why: 1 }
}
const u = boxOf(0)
print(1)

// twin6.vl — `emitProgram: ref valtype with no interned shape`
type Cat = { n: i32 }
type Kot = { n: i32 }
function pick(i: i32): Cat | Kot {
  if i % 2 == 0 { return { n: 7 } }
  return { n: 1 }
}
const a = pick(0)
print(1)
```

---

## 9. Where the pieces live

- `tests/fixtures/opt-melt/union-box-payload-read.vl` — the canonical loop this document
  is written against; `union-box-call.vl` and `union-box-branch-local.vl` are the other
  two cells of §2's truth table.
- `compiler/emit_state.vl:1018` — `uBoxIdx`, the one box heap type; `:1029-1049` — the
  representation note and the four value boxes.
- `compiler/wasmEmit.vl` — all 56 box instructions: `emitUnionCoerce` (`:2622`),
  `emitIs` (`:1855`), `isArmTagOfTy` (`:1810`), `emitCoalesce` (`:14614`),
  `emitUnionUnionEq` (`:3376`), the unbox family (`:2425`, `:2466`, `:2485`, `:3245`).
- `compiler/emit_rep.vl:1458` — `scalarTagOfKind`; `emit_classify.vl:13883`/`13896` —
  `refArrSlotTag`/`mapSlotTag`; `:13818` — `buildVariantTwins`, the twin collapse.
- `compiler/emit_sections.vl:2950-2982` — the box and value-box type BYTES, invisible to
  every identifier grep.
- `scripts/vl-host/src/main.rs:1320` — `BINARYEN_FEATURES` (no `--enable-multivalue`);
  `:1353` — `RELEASE_PASSES`.
- `docs/internals/opt-profile-design.md` §3 — the row this follows;
  `docs/internals/litunion-compact-rep-design.md` §5/§6 — the payload-encoding pricing
  this corrects for the non-litunion case.

---

## 10. PHASE 1 SHIPPED — what it did against what §6 predicted

Measured on this document's own witnesses, `A` = the published `seed-latest`
(master's compiler, 1,119,281 B), `B` = the return-sink compiler at its native
fixpoint (1,120,712 B, `compile(B) == B` byte-for-byte). Same binaryen 130, same
wasm-tools, same wasmtime-via-`vl-host`.

### 10.1 The melt — predicted exactly

§6 predicted the shipped fixture would go **4 → 3** unoptimized and **4 → 2** at `-O3`.
Both are exact. The struct-union twin does the same, matching C3's 3 → 2.

| fixture | box sites A→B | allocs none A→B | allocs `-O` A→B | allocs `-O3` A→B |
|---|---:|---:|---:|---:|
| `union-box-payload-read` | 2 → **1** | 4 → **3** | 4 → **2** | 4 → **2** |
| struct-union twin (`Hit \| Miss`, field read) | 2 → **1** | 4 → **3** | 4 → **2** | 4 → **2** |
| `union-box-call` | 2 → **1** | 4 → **3** | 4 → **0** | 0 → 0 |
| `union-box-branch-local` | 2 → 2 | 4 → 4 | 4 → 4 | 2 → 2 |

**The `-O` column is a finding §2.2 did not anticipate.** That section concluded the
shipped four-flag profile *"is already at binaryen's ceiling for this shape"* and that
the box melts *"by closed-world type refinement plus DCE, which is why no amount of `-O`
level reaches it"* (`opt-profile-design.md` §3). That is a property of TWO sites. At one
site plain escape analysis is enough: both fixtures now melt **one optimizer rung
earlier**, at `-O`, with no `--closed-world` and no `--gufa`. The ceiling was never
binaryen's — it was the site count.

### 10.2 The speedup — REFUTED as stated; 1.7×, not 2.0–2.2×, AND ONLY UNDER `wasm-opt`

> **Read the ratio with its condition: this slice is worth NOTHING without `-O`.** The sink
> removes a *merge point*, not an allocation, so binaryen's Heap2Local has to be there to
> collect. Independently re-measured on the same loop at 100 M trips, min-of-5, load 3.4:
>
> | build | A (master) | B (this slice) | ratio |
> |---|---:|---:|---:|
> | plain `vl build` | 535 ms | 530 ms | **1.00× — a wash** |
> | `vl build -O` | 304 ms | **173 ms** | **1.76×** |
> | `vl build -O3` | 293 ms | **176 ms** | 1.66× |
>
> A user on the default build gets nothing from this change. That is not a defect in the
> slice — it is the same fact §10.1 records from the other side (the box melts at `-O`,
> and before that there is nothing to melt into) — but any figure quoted from this section
> without naming the optimizer level is wrong by 1.7×.

§4 reports A6 at 61.8 → 31.0 ms (2.0×) and C3 at 60.8 → 28.1 ms (2.2×). Those are **V8**
numbers. On the native host, 100 M trips of the same two loops, interleaved A/B, min-of-5:

| loop | A | B | ratio |
|---|---:|---:|---:|
| `i64 \| boolean`, payload read | 311 ms | **187 ms** | **1.66×** |
| `Hit \| Miss`, field read | 279 ms | **164 ms** | **1.70×** |

Noise floor (spawn + instantiate, `print(0)`, min-of-5) **3 ms**; load average 4.0 on a
contended box. The two distributions do not overlap on either loop — B's slowest run
beats A's fastest — so min-of-5 is not carrying the result. §4's own native column
(A0 68 → A6 53 ms, 1.28×) understated it because a 20 M-trip run sits close to its 12 ms
process floor; 1.7× is the honest native figure and 2.0–2.2× should be read as V8-only.

**What the ratio is NOT is an allocation-count ratio.** A and B both allocate exactly
TWO objects per trip before the optimizer — only one of A's two sites executes on any
given trip. The sink removes no allocation by itself; it removes the *merge* that stopped
Heap2Local from owning the one allocation that does happen. All of the win is downstream
of the optimizer, which is why §1.4's warning matters: a corpus sweep cannot see it.

### 10.3 The population — 78 sites, not 309

§6 sizes the population as *"309 of 1,537 corpus construction sites (20.1%) in return
position."* The sink removes **78** of them, across **76 functions** in **54 modules**
(corpus at this base: 1,720 files, 1,442 building, 1,578 box sites → 1,500).

The gap is arithmetic, not a measurement error, and §6 should not be read as a forecast:
a function with *k* constructing returns loses *k−1* sites, never *k*, because the exit
still builds one box. So the removable population is the return-position census **minus
one site per union-returning function**, and a single-exit function contributes zero. 76
of the roughly 230 functions holding those 309 sites have two or more constructing
returns; the rest already had the one site the sink would have built for them.

**A site census in return position is an upper bound on where the transform APPLIES, and
roughly four times the count of what it REMOVES.** Any later phase sized off §1.3's
position table should apply the same correction: phase 2's 464 `local.set` sites (30.2%)
will not yield 464 either.

### 10.4 What does NOT sink

- **A `let` assigned on two branches (`spell2`, `union-box-branch-local`).** Not a return;
  phase 2's row, unmoved at 4 → 4 and 4/4/2 as pinned.
- **A passthrough return** (`return u` where `u` is already a union). There is nothing to
  sink and the sink correctly declines — pinned by `union-sink-passthrough`, whose two
  sites are its CALLER's argument coercions and must stay two.
- **Single-exit functions**, by the prediction predicate: sinking one site into one site
  buys nothing and costs a block.
- **The compiler's own unions.** §1.1 already says why — AST nodes live in a module-global
  array and escape — so of the compiler's 56 construction sites the sink is worth static
  size, not speed. It is +1,431 B (+0.128%) on `vl-compiler.wasm`.

### 10.5 Corrections to §5.4's cost estimate

§5.4 prices (g) as touching *"the return-position subset of the 18 `fbStructNew(uBoxIdx)`
sites."* **It touches none of them.** The transform is a PEEPHOLE at the three places that
terminate a return value (`emitStmt`'s `RetStmt`, `emitFuncBody`'s tail, `emitStmtTail`):
when the last instruction written is `struct.new $uBox`, its two operands are already on
the stack in field order, so they are popped into two reserved locals and a `br` replaces
the `return`. Justified locally, it is indifferent to WHICH of the eighteen sites produced
the box — which is why no flag is threaded through them and why a nineteenth site would be
covered for free.

Three consequences §5.4 does not list:

1. **The transform is per-exit and need not be total.** An exit whose tail is not a box
   emits its ordinary `return` and simply becomes one fewer predecessor of the exit block.
   That is what makes the passthrough case safe without a whitelist.
2. **Two conditions gate the rewrite, and a byte pattern alone is not enough.** An operand
   can spell any opcode, so matching the trailing bytes proves only that they LOOK like the
   instruction; `fbStructNew` records a cursor and the rewrite additionally requires that
   nothing has been written since.
3. **The exit block is decided AFTER the body is lowered**, off a count of what actually
   sank — so only the two locals ride a prediction. A prediction that over-fires costs
   4 bytes of unused local declarations and never a dead allocation: exactly one corpus
   file (`statements/tail-assign-if-arms.vl`) is in that state, at +4 B.

Every one of the 55 corpus byte movers is accounted for by that model: **+18 B per sunk
function** (a block, its `end`, two `local.get`s, one `struct.new`, two local runs, and
+2 per merged return), +3 per arm beyond the second, +4 for the mispredicted one. Corpus
total **+1,379 B (+0.069%)** over 1,442 modules, 55 up, 0 down — the sink trades static
size for the melt, and the `-O3` artifact is SMALLER (the fixture: 156 → 140 B).

### 10.6 A latent defect the sink forced closed

`emitIfTail` opened a wasm `if` frame without `ctrlEnter()`/`ctrlLeave()`, as did
`emitUnionIfValue`, `emitVariantIfValue` and `emitNullableIfBinding`. It was inert because
nothing branch-bearing had ever been emitted inside those frames. A sunk `return` in an
if-tail arm IS branch-bearing, and its `br` operand is the frame distance to the exit
block, so every one of the four counts its frame now. Nothing asserts this — the failure
mode is an off-by-one `br` operand, which is invalid wasm rather than a wrong answer.
Counting a frame nothing branches out of is byte-neutral, so the three that are still
inert cost nothing for being correct.

### 10.7 A measurement trap, recorded because it cost a full benchmark round

**`vl build -O3` is a SOFT NO-OP when no `wasm-opt` is reachable.** `binaryen_tool`
consults `VL_WASM_OPT` and then `PATH`; this tree ships binaryen under
`node_modules/binaryen/bin/` and puts neither on `PATH`, so `-O3` silently wrote the
UNOPTIMIZED module. A first benchmark round read A = 382 ms / B = 381 ms — a clean,
plausible, entirely false null result, because both artifacts were unoptimized and both
therefore allocate twice per trip. The tell was structural, not temporal: the artifact
still had the box's `struct.new` in it. `selfhost_native_release_test.ts` sets
`VL_WASM_OPT`/`VL_WASM_DIS` explicitly for exactly this reason. **Any A/B of an optimizer
effect must assert that the optimizer RAN** — count allocation sites in the timed
artifact, never trust the flag.

---

## 11. THE RETURNED IF-EXPRESSION — §10.4's largest remaining shape, closed

§10.4 filed `return if c { a } else { b }` as *"the single largest remaining
return-position shape"*: `emitUnionCoerce` routes a union-valued if-expression to
`emitUnionIfValue`, which emits a value-typed `if` with a `(ref $uBox)` blocktype and
union-coerces EACH ARM, so one `return` carries one construction site per arm and the last
instruction written is the `if`'s `end` — nothing for §10.5's peephole to match.

`A` = the published `seed-latest` (1,135,405 B), `B` = this change at its native fixpoint
(1,136,589 B, `compile(B) == B` and stage3 == stage4 byte-for-byte from a freshly fetched
seed). Same binaryen 130, same wasm-tools, same wasmtime-via-`vl-host`.

### 11.1 The transform is a SPLIT, not a second peephole

The source is lowered as a VOID statement-`if` whose arms each terminate as their own
return — which is the program `if c { return a } else { return b }` already emitted — so
every arm's box meets the existing peephole unchanged. Nothing new matches bytes, no
second frame is reserved, and §10.5's model still describes every byte: `emitReturnExit`
is now the single place a return value is paired with its terminator (`emitStmt`'s
`RetStmt`, `emitFuncBody`'s tail and `emitStmtTail` all route through it), and the split
is the one shape it handles specially.

Three consequences the split has that the statement form does not:

1. **`retExitCount` had to learn to look INSIDE a return value.** A `RetStmt` counted 1
   exit whatever it returned, so a two-armed if-expression predicted a single-exit
   function and declined the frame. It now counts one exit per arm, through `else if`
   chains and nested if-expressions. The prediction's failure modes are unchanged and both
   harmless (§10.5): over-count reserves two unused locals, under-count declines a sink.
2. **The trailing `unreachable` is load-bearing, not padding.** A wasm `if` whose arms both
   diverge is still REACHABLE at its `end`; the `return` that used to sit after the value
   made everything following it stack-polymorphic. Without the `unreachable`, a function
   whose arms ALL declined the sink — both arms pass a union through, so no box is built
   and each arm emits a plain `return` — falls out of the `if` with an empty stack into a
   non-void function `end`. That is invalid wasm, and it is reachable from source: it is
   exactly `union-sink-passthrough` written as an if-expression.
3. **A nested if-expression arm now compiles.** `emitUnionIfArm` gates on
   `stmtIsTailValue`, which is false for an `IfStmt`, so
   `return if c { if d { a } else { b } } else { e }` was `emitProgram: union
   if-expression arm is not a single value` — a loud reject, measured on A. Per-arm exits
   recurse through the same return path, so the shape is just another exit. Pinned by
   `tests/cases/unions/return-if-expression-arms.vl`.

### 11.2 The melt, and the ratio with its rung

`tests/fixtures/opt-melt/union-sink-if-expression.vl` is `union-box-payload-read`'s
program in the if-expression spelling; the two rows must now read the same, and do.

| fixture | box sites A→B | allocs none | allocs `-O` | allocs `-O3` |
|---|---:|---:|---:|---:|
| `union-sink-if-expression` | 2 → **1** | 4 → **3** | 4 → **2** | 4 → **2** |
| `union-box-payload-read` (unmoved) | 1 | 3 | 2 | 2 |

Wall clock on the same loop at 100 M trips, interleaved A/B, min-of-5, load 6.8, with the
optimizer's having RUN asserted structurally in the timed artifact (A stays at 4
allocations at every rung; B reaches 2):

| build | A | B | ratio |
|---|---:|---:|---:|
| plain `vl build` | 514 ms | 507 ms | **1.01× — a wash** |
| `vl build -O` | 364 ms | **218 ms** | **1.67×** |
| `vl build -O3` | 353 ms | **207 ms** | **1.71×** |

Read with §10.2's warning, which this reproduces to the digit: **the split is worth
nothing without `-O`.** It removes a merge point, not an allocation, so Heap2Local has to
be present to collect.

### 11.3 The population is FOUR sites, and that is the honest number

Corpus at this base, 1,735 files: A builds 1,451 and B builds 1,452 (the newly-accepted
nested arm), with **zero** modules moving to or from invalid wasm. Union-box construction
sites **1,500 → 1,496**: four removed across three modules, none added.

| module | sites | bytes |
|---|---|---:|
| `conditionals/union-if-as-value-return.vl` | 6 → **4** | +39 |
| `unions/infer-struct-union-return.vl` | 3 → **2** | +19 |
| `unions/union-if-value-variant.vl` | 9 → **8** | +19 |
| `closures/union-returning-map.vl` | 6 → 6 | +17 |

Corpus total **+94 B (+0.004%)** over 1,451 modules, 4 up, 0 down.

The fourth row is the mispredict class §10.5 records, in a form that table does not have:
`tag(a) = return if a is Cat { {woof: a.meow} } else { a }` has ONE constructing arm and
one passthrough, so the split fires, the exit block is emitted, and the site count is
unchanged — one site in an arm became one site at the exit. **A split whose arms do not
all construct buys nothing and still pays the frame.** It is bounded at +17 B and cannot
produce an allocation that was not already there, which is why it is not worth a predicate
to avoid: the predicate would have to agree with what the peephole actually did, and
§10.5's whole argument is that only the lowering knows that.

Four sites is small against §1.3's 309 return-position rows, and it is not a shortfall in
the transform — it is that `return if …` is a RARE SPELLING. The corpus writes the
two-`return` form instead, which is why phase 1 found 78. §10.3's correction applies here
too: a spelling census is not a site census.

### 11.4 The compiler pays for the code and gains nothing from the transform

`vl-compiler.wasm` 1,135,405 → 1,136,589 B (**+1,184 B, +0.104%**), and the whole of it is
the new lowering: the module's union-box construction sites are **52 → 52** and its total
allocation sites **4,804 → 4,804**, with 5 new functions. The compiler writes no
`return <if-expression>` union producer at all — §1.1 already says its 56 sites are AST
nodes in a module-global array. Self-compile wall clock is inside the noise (min-of-7
interleaved: A 1,499 ms, B 1,586 ms at load 22.9, distributions fully overlapping), which
is the expected reading for a change that moves neither the site count nor the allocation
count of the module being timed.

---

## 12. THE BINDING — §10.4's `let` row, and the half of it that is a sink

§10.4 filed *"a `let` assigned on two branches"* as one remaining shape. **It is two
shapes, they fail for different reasons, and only one of them is a sink.** Splitting them
is the first result of this section; closing the sinkable one is the second.

| spelling | why it had two-or-more sites | closed by |
|---|---|---|
| `const u: A\|B = if c { a } else { b }` | one box per arm PLUS a pre-seed | **this section** |
| `let u: A\|B = a; if c { u = b }` | two writes, no merge point to sink into | **not a sink** — §12.4 |

`A` = the worktree's `master` compiler at its native fixpoint (1,139,472 B), `B` = this
change at its own (1,141,227 B, `compile(B) == B` byte-for-byte from a freshly fetched
`seed-latest`). Same binaryen 130, same wasm-tools 1.256, same wasmtime-via-`vl-host`.

### 12.1 The binding shape had THREE sites, not two — and the third is dead

`emitNullableIfBinding` already lowered a union-box binding as a VOID `if` whose arms each
`local.set` the binding's own slot, so the value-typed-`if` merge §11 had to split was
never there. It still read 5/4/4, and the reason is the site the arm count does not
predict: the slot is a non-null `(ref $uBox)`, which is **not defaultable**, and a void-`if`
merge does not satisfy the validator's definite-assignment check, so the rep's NULL BOX was
constructed before the `if` and overwritten on every path. Two arms, three sites, and the
third one allocates on every trip and is read by nothing.

### 12.2 The transform is §10.5's peephole at a second position

Each arm's value is lowered exactly as before; when its last written instruction is the
box's own `struct.new $uBox`, the same two conditions §10.5 states unwrite it and pop its
operands into the sink pair. The single `struct.new` then follows the `if` and stores the
binding. **The pre-seed goes with it** — not as an optimization but as a consequence: one
store, dominating every read, is definite assignment.

So the shape drops from `arms + 1` sites to exactly ONE, and the arm count stops mattering:
a three-armed `else if` chain is also one, and an else-LESS chain's null path writes the
tag and payload directly instead of building a box for the merge to discard.

**The two sinks share ONE frame** (`fbUsesSinkPair` is the single condition behind the
reservation, the locals count and the two valtype runs). The pair's live ranges cannot
interleave: a sunk `return` branches straight to the exit block, a sunk binding arm falls
straight to the `if`'s `end`, and an arm's value is an EXPRESSION, so no `return` can be
emitted between an arm's write and the construction that reads it. That argument is what
`tests/cases/unions/let-if-binding-sink-with-returns.vl` exists to witness — both nestings,
checked behaviourally, because the failure mode is reading a value from the wrong producer
rather than failing to validate.

### 12.3 Two arm shapes DECLINE, and the gate is static

`unionIfBindingAllBox` refuses the whole rewrite unless every terminal arm constructs:

- an arm whose value is itself an if-expression lowers as `emitUnionIfValue`'s value-typed
  `if`, so its last instruction is a frame `end` and there is no construction to unwrite;
- an arm passing an EXISTING union through builds no box at all.

The second is the one that has to be a GATE rather than a per-arm decline, and this is
where binding position differs from return position. A declining EXIT is free — it emits an
ordinary `return` and is one fewer predecessor of the block (§10.5 consequence 1). A
declining ARM is not: the `if` has one join, so a mixed `if` would have to unbox the
passthrough arm and rebuild it after the merge, **trading no site for an allocation that
executes every trip at the default rung**. `emitUnionArmToPair` still contains that
unbox/rebuild as the backstop for a mispredicted arm — correct at exactly that price — but
the gate is what keeps it unreached.

### 12.4 The other half needs a REP change, and that is the honest answer

`union-box-branch-local` / §8.3's `spell2` is unmoved at 4/4/2 and this change does not
touch it:

```vl
let u: i64 | boolean = true   // site 1
if i % 2 == 0 { u = 7 }       // site 2
```

The two writes are SEPARATE STATEMENTS. There is no merge point for a box to sink into —
the `if` has no else, and `u` is live out of both paths — so the sink has nothing to
rewrite. Collapsing it means holding the tag and payload in the pair across a LIVENESS
WINDOW (from the declaration to the first read of `u`), proving every write in that window
constructs and no read occurs inside it, and materialising the box at the window's end.
That is §6's candidate (c), local scalarization, filed there as *"the signature layer"* and
not recommended: it changes what a union-typed local IS between two program points, which
is a representation question and not a peephole. **A measured "this is bigger than filed"
is the result for this row**, and `tests/vl_union_return_sink_test.ts` keeps it pinned at 2
so a future attempt has its before-number.

§13 is the independent re-derivation of that verdict on the disassembly, and it corrects
the number quoted here: 4/4/2 is measured with the payload DISCARDED, and its `-O3` fall is
field removal rather than a melt. Read with the payload, the shape is 4/4/4.

### 12.5 The melt, and the rung — this one is NOT a wash at plain `vl build`

`tests/fixtures/opt-melt/union-sink-let-if.vl` is `union-box-payload-read`'s program in the
binding spelling; all three spellings must now read the same, and do.

| fixture | box sites A→B | allocs none | allocs `-O` | allocs `-O3` |
|---|---:|---:|---:|---:|
| `union-sink-let-if` | 3 → **1** | 5 → **3** | 4 → **2** | 4 → **2** |
| `union-box-payload-read` (unmoved) | 1 | 3 | 2 | 2 |
| `union-sink-if-expression` (unmoved) | 1 | 3 | 2 | 2 |

100 M trips of the same loop, interleaved A/B, **CPU milliseconds** (`scripts/p7-time.sh`,
min and median of 7) because the box was at load 80–88 and a wall-clock ratio on the same
runs swung between 1.02× and 1.40× at one rung. The optimizer's having RUN is asserted
structurally in each timed artifact, per §10.7.

| build | A min/med | B min/med | ratio (min) |
|---|---:|---:|---:|
| plain `vl build` | 750 / 772 ms | **551 / 602 ms** | **1.36×** |
| `vl build -O` | 594 / 613 ms | **354 / 373 ms** | **1.68×** |
| `vl build -O3` | 558 / 576 ms | **372 / 397 ms** | **1.50×** |

The distributions do not overlap at any rung (A's fastest beats B's slowest every time).

**§10.2's warning does not transfer, and the difference is the mechanism.** Phase 1 and
§11 remove a MERGE POINT — A and B execute the same number of allocations, so there is
nothing to win before Heap2Local arrives, and both were a wash at plain `vl build`. This
removes an ALLOCATION: the pre-seed box was built and discarded on every trip, so three
allocations per trip become two and the default rung improves by 1.36× on its own. The
`-O` column is then the merge win on top of it. **Quote either number with its rung**; they
are not the same claim.

### 12.6 The population — 53 sites over 6 modules

Corpus at this base (`tests/cases` + `std` + `bench`, 1,831 files, 1,544 building, and the
SAME 1,544 on both sides — no module moved to or from invalid wasm). Union-box construction
sites **1,551 → 1,498**: 53 removed, none added.

| module | sites | bytes |
|---|---|---:|
| `functions/inferred-nullable-if-binding.vl` | 19 → **6** | +11 |
| `functions/nullable-if-expr-binding.vl` | 16 → **5** | +9 |
| `functions/else-less-if-expression-binding.vl` | 15 → **5** | +10 |
| `functions/inferred-if-binding-ident-arm.vl` | 12 → **4** | +8 |
| `unions/let-if-binding-arms.vl` | 21 → **12** | +15 |
| `unions/union-if-value-variant.vl` | 8 → **6** | +2 |

Corpus total **+55 B (+0.0022%)** over 1,544 modules, 6 up, 0 down — and the six byte movers
are exactly the six site movers, so nothing moved that did not sink. The fifth row is the
case this change ADDS, compiled by both compilers from the same source; the other five are
population.

§10.3's correction applies here in the opposite direction from §11.3's. The SPELLING is
rare — 15 source sites in 8 files at A's base — but each one loses `arms` sites rather than
`arms − 1`, because the pre-seed goes too. That is why a shape §11 found four instances of
yields 53 here: `nullable-if-expr-binding.vl` alone holds six bindings, and a two-armed one
is a 3 → 1.

### 12.7 The compiler pays for the code and gains nothing from the transform

`vl-compiler.wasm` 1,139,472 → 1,141,227 B (**+1,755 B, +0.154%**), and the whole of it is
the new lowering: the module's union-box construction sites are **52 → 52** and its total
allocation sites **4,826 → 4,826**. The compiler writes no union-box `let … = if …` binding
at all, which is the same reading §11.4 records for the if-expression split.

---

## 13. THE REMAINDER, RE-DERIVED — the `let` on two branches is a Heap2Local limit

§12.4 filed the last shape as needing a rep change. This section is the independent
re-derivation of that verdict, because the filing rested on reasoning and the number it
quoted (4/4/2) turns out to be measuring something other than the box.

### 13.1 The `-O3` column of `union-box-branch-local` is not the box melting

`union-box-branch-local` DISCARDS the payload — it tests the tag and never reads field 1 —
so at `-O3` closed-world field removal deletes the anyref field from the box type outright
and the module's allocation count falls 4 → 2 for a reason that has nothing to do with
escape analysis. The `-O3` disassembly is explicit: the surviving type is
`(struct (field i32))`, a one-field, entirely frame-local, never-escaping struct, allocated
at two sites, and Heap2Local still declines it.

Pinned with the payload READ instead — `union-box-branch-local-read`, the same program as
the three sinkable spellings — the field cannot be removed and the shape reads **4/4/4**:
nothing melts at any rung, release profile included. **That is the row that states the
limit**, and it is the one to read; the older row's `-O3` fall is an artifact of DCE.

### 13.2 Which of the three candidate causes it is, settled on the disassembly

A hand-built WAT A/B of this exact function, run through the same binaryen and the same two
flag sets the host uses, isolates the variable to the number of allocation SITES reaching
the `(ref $uBox)` local. Every module is otherwise identical; `C` is the control that proves
Heap2Local is working at all here.

| module | uBox sites | payload read | none | `-O` | `-O3` |
|---|---:|---|---:|---:|---:|
| `C` control — one site, no branch | 1 | no | 2 | **0** | **0** |
| `A` — two sites (what VL emits) | 2 | no | 4 | 4 | 2 |
| `B` — one site, tag+payload in scalars across the branch | 1 | no | 3 | **0** | **0** |
| `A2` — two sites | 2 | **yes** | 4 | 4 | **4** |
| `B2` — one site, scalars across the branch | 1 | **yes** | 3 | **2** | **2** |

`A`/`A2` reproduce the VL fixtures' counts exactly (4/4/2 and 4/4/4), so the hand modules
are a faithful model. `B2` lands on 3/2/2 — the same numbers `union-box-payload-read`,
`union-sink-if-expression` and `union-sink-let-if` already read — with the two survivors
being the payload value boxes, the data.

That rules out the two other explanations and leaves one:

- **Not an escape.** The value never leaves the frame in any of the five modules; `B`/`B2`
  differ from `A`/`A2` only in site count and melt completely.
- **Not a missing control-flow marker in the emitter.** `ctrlEnter`/`ctrlLeave` count wasm
  frame DEPTH so a `br` operand can be computed (§10.6); they emit no bytes and binaryen
  cannot observe them. They are also, as of §10.6's closure, present at all four of
  `emitIfTail`, `emitUnionIfValue`, `emitVariantIfValue` and `emitNullableIfBinding` — so
  the omission the workboard filed as this item's anchor no longer exists in the tree.
- **It is Heap2Local's per-SITE, single-definition requirement.** An allocation is
  scalarized only when every local it flows into provably holds that one allocation. Two
  `struct.new` writing one local defeats that for both, and no marker or annotation the
  emitter can add changes it.

### 13.3 What routing around it would cost, and why it is not done here

`B`/`B2` is what the emitter would have to produce: hold the tag and the payload in two
scalar locals from the declaration to the first read of the binding, prove every write in
that window constructs and no read occurs inside it, and materialise the box at the
window's end. That is a LIVENESS WINDOW over a union-typed local — §6's candidate (c),
local scalarization — and it changes what a union-typed local IS between two program
points. It is Heap2Local's job done in the emitter, which is the thing this project's
standing rule says not to do, so it is escalated rather than attempted.

### 13.4 What the limit costs, per rung

The two spellings of one program, 100 M trips, interleaved A/B, **CPU milliseconds**
(`scripts/p7-time.sh`, min and median of 7, load 3.4–4.4). `A` is the two-statement
spelling, `B` the if-expression binding spelling. The optimizer's having run is asserted
structurally in each timed artifact per §10.7: `A` 4/4/4 allocation sites, `B` 3/2/2.

| build | A min/med | B min/med | ratio (min) |
|---|---:|---:|---:|
| plain `vl build` | 453 / 461 ms | **299 / 309 ms** | **1.52×** |
| `vl build -O` | 442 / 452 ms | **174 / 177 ms** | **2.54×** |
| `vl build -O3` | 420 / 423 ms | **168 / 173 ms** | **2.50×** |

The distributions do not overlap at any rung. **Quote either number with its rung.** The
`-O` ratio is the larger one precisely because `A` melts nothing: it is the only shape in
this document that the optimizer cannot help, so the optimizer's gains all accrue to `B`.

Module bytes on the same pair: `A` 311 / 175 / 161 B, `B` 324 / 158 / 137 B at
(none)/`-O`/`-O3`. The sinkable spelling is 13 B LARGER unoptimized and 17–24 B smaller at
both optimized rungs.

### 13.5 The population is small, and the corpus is the wrong denominator for it

A union-ANNOTATED `let` that is assigned again later occurs in **21 of 1,925** corpus files
(`tests/cases` + `std` + `bench` + `compiler`), out of 82 union-annotated `let` bindings
total. That is a syntactic lower bound — an inferred-union `let` is invisible to the scan —
and it badly over-counts in the other direction: **10 of the 18 buildable hits emit ZERO
union boxes**, because they are `T | null` nullable shapes on a different rep. Measured on
the emitted module, three files still hold union boxes past `-O`
(`literal-unions/atom-store-into-mixed-union` 24 → 17, `literal-unions/mixed-union-litunion-arm-floor`
25 → 4, `statements/tail-assign-if-arms` 6 → 4), and their survivors are not attributed to
this cause.

**The corpus does not size this item.** It is a compiler test corpus; the shape's home is a
per-tick simulation loop, which the corpus contains none of. The honest statement is that
the shape is cheap to AVOID — the if-expression spelling of the same program is available,
already melts, and is 2.5× faster at `-O` — and expensive to hit.
