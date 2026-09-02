# Identity proposal — performance critique

**Cross-examination of `docs/identity-design.md` from ONE angle: performance and
implementation cost on WasmGC.** Measured 2026-09-01 against the live seed (self-compiled
from this worktree's `compiler/*.vl`; `refresh-compiler.sh` rc 0), binaryen 130
(`node_modules/.bin/`), the `vl` host (wasmtime 47), and Deno/V8 for in-process timing.
Every **(RUN)** fact names its program and command; the appendix has raw output. Everything
else is a source citation or analysis, and is labelled.

---

## Verdict

**Yes for `===`; no for P4 as specified — split the proposal in two.** The operator is
free, and §4.1's worry is unfounded in the best possible way: binaryen's Heap2Local does
not treat `ref.eq` as an escape — it *folds the comparison to a constant and deletes the
allocation anyway* (**RUN**, and the pass source says so in as many words). `===` costs
0.43 ns when it survives at all. P1/P2/P3/P5 are cheap and should proceed. **P4 — the
hidden serial field — is a different proposition than the proposal prices it at.** Three
facts, any one disqualifying as written. (a) `==` walks a **rep-level** field count
(`wasmEmit.vl:11802`, verified), so an injected serial **would be compared by `==`**,
silently converting structural equality into identity equality for exactly the types P4
touches — which refutes P2's "`==` is unchanged". (b) An i32 serial **wraps in 10.2
seconds** (**RUN**) — not "a long-running program", a loop you write by accident. (c) VL
has **no declared-vs-rep field split at all**: one table is the declaration record, the
WasmGC field list, the interner key and the diagnostics source, so injection lands on ~30
cited sites, one of which copies a serial from one object into another. Meanwhile P4's only
named customer — decision D's cycle seen-set — sits **below the crossover where a flat
`ref.eq` array beats a hashed identity table** (N ≈ 12–16, **RUN**), and that array needs
no serial at all. **Ship `===` now; ship `IdentitySet` as a flat `ref.eq` probe; defer the
serial until something demands more than ~16 identity keys.** If the serial is built
anyway it must be **lazy and i64** — strictly better than eager i32 on every axis measured,
including two the proposal does not consider.

---

## Findings, ranked by severity

### 1. An injected serial would be compared by `==`, refuting P2 — *cited, verified*

`compiler/wasmEmit.vl:11802`, in `emitStructEqRec` — the structural `==` walk — is
`const cnt = eqRowFieldCount(si)`, looping `fi` over `0..cnt` with **positional** reads
(`pathFi`, `wasmEmit.vl:11319`/`:11327`). And `compiler/emit_classify.vl:7837`:

```
export function eqRowFieldCount(row: i32) {
  if row < 0 { return uFieldCount[-1 - row] }
  sFieldCount[row]
}
```

That is the **rep** count. A serial field is therefore included in the comparison unless
explicitly excluded, and the consequence is exact: for any identity-keyed type, `a == b` on
two structurally equal but distinct objects stops being `true` — their serials differ — so
**`==` silently becomes `===`** for precisely the types the user asked to identity-key. The
proposal's own §1 witness (`a == b` → `true` for two separate `{x:1,y:2}`, re-run verbatim,
**RUN**) would flip to `false` merely because some *other* part of the program put that type
in an `IdentityMap`. Spooky action at a distance, check-clean, and invisible to any fixture
that does not construct two equal objects of a keyed type. Same walk backs the variant-arm
path (`wasmEmit.vl:5741`, positional `fbStructGet` at `:5747`/`:5749`).

**Recommendation:** P4 cannot proceed without a **declared-vs-rep field split** (finding 3)
and teaching `eqRowFieldCount` the declared count. Prerequisite, not follow-up. Add a
corpus cell: two structurally equal objects of a type identity-keyed elsewhere in the same
program must still compare `==` equal.

---

### 2. An i32 serial wraps in 10.2 seconds — **(RUN)**

§4.2 frames i32 wrap as something "a long-running program can reach". `overflow.vl`
performs exactly 2³² constructions of a keyed struct with an eager i32 counter (nested
65536×65536 loops, since an i32 loop counter cannot itself reach 2³²) and prints it:

```
min-of-3, taskset -c 2-5, vl run overflow.wasm
  10 234 953 us = 10.23 s      counter printed: 0     ← exact wrap
```

Two live objects now carry serial 0. Under a table comparing serials rather than references
that is a **silent wrong answer**; under `ref.eq`-checked lookup it is a
correctness-preserving slowdown. The proposal does not say which `IdentityMap` does, and
that omission is the whole difference. Context, both **(RUN)**: 2.28 ns/allocation dead on
arrival, 70.5 ns fully retained — at the *retained* rate 2³² is still only **~5 minutes**.
Finding 4 makes the counter advance faster than objects exist, so 10.2 s is an upper bound.

**Recommendation: i64.** Measured free in time — 2.547 ns/alloc vs 2.533 for i32 on
wasmtime (+0.014, inside noise); on V8 the i64 arm was *faster* (4.275 vs 4.312). Entire
cost: **4 bytes per keyed object**. There is no measured argument for i32.

---

### 3. There is no declared-vs-rep field split, so injection lands on ~30 sites — *cited*

§4.2 says injection "changes the WasmGC struct type, which is fine whole-program". The
first half is true; "fine" is doing a great deal of work.

**One flat table in `emit_state.vl:1016–1046` is simultaneously the declaration record, the
WasmGC field list, the interner input and the diagnostics source.** Its header
(`emit_state.vl:903`) states the identity: *"declaration order = wasm struct field index"*.
There is **no precedent for a rep-only field on a user struct type** — the one hidden rep
field (the string header's hash memo, `emit_state.vl:1123`) sits on a non-user heap type no
name-keyed resolver scans.

The affected sites, cited in full in **appendix A11**, and the four that decide the design:

* **13 exact-arity sites** compare `sFieldCount[si]` against a declared field-list length
  and would silently miss; a miss returns `-1` → a wrong row, or the loud `emitProgram:
  object literal field count does not match struct` (`wasmEmit.vl:2796`).
* **No `struct.new_default` exists anywhere in `compiler/*.vl`** (verified: zero
  occurrences), so a hidden field cannot be defaulted by the instruction — and `emitObj`
  resolves every operand **by name** (`wasmEmit.vl:2804`), so a serial with no `objFields`
  entry takes a loud refusal.
* **`emitStructExprAsVariantBox` (`wasmEmit.vl:3416–3456`) copies field-for-field between
  two independently-injected rows.** Both outcomes wrong: source has a serial → it is
  **copied into the new object**, two distinct objects sharing one identity; source has
  none → loud refusal on a program that used to compile.
* **`slotCanonId` cannot see the injection** — it reads the arena (`emit_rep.vl:2886`) or
  re-parses the declared spelling (`:2904`), never `sFieldCount`, so it and
  `structFieldCodesEq` (`:3044`, first line is the count gate) **disagree by construction**;
  `buildStructTwins` (`:3387`) is the conjunction of exactly those two.

Also affected: D622 width subtyping (ranks by count), the row-identity hash (takes the
field count as its *first* component), global union tag numbering, the monomorphizer's
instance keys, and flat records' documented "the compiler never inserts a byte" ABI. A11
has the line numbers.

**And the twin relation makes "is this type identity-keyed?" the wrong question.**
`repStructSlotsTwin` (`emit_rep.vl:3110`) merges structurally identical declared types onto
one heap type and the emitter relies on it (`repSlotOfTy`'s structural→nominal bridge,
`:1429–1462`: the claimants "are ONE WasmGC heap type and there is no answer to choose
between"). The relation is **pairwise over the whole module**, so identity-keying `Circle`
must inject into `Circle`'s entire twin equivalence class — including `Dot`, never
identity-keyed. Either P4's "zero for every other type" is false, or the twin splits and
you have re-created the D280/D621/D623/D624/**D627** family on purpose. (D627 is filed
**open**, `docs/internals/silent-class-inventory.md:18555`, not in `DECISIONS.md`.)

**What I could not show.** All the above is cited, not inferred — but I tried to *witness* a
behaviour change from a field-count split and **failed**: `twin.vl` (Circle and Dot as exact
twins, resolved through a structural annotation) and `twin_split.vl` (the same with Circle
carrying one extra i32 field) **both run correctly, rc 0** (**RUN**). A large cited surface
with no witness yet; reported as that.

**Recommendation:** P4's prerequisite is a declared-vs-rep field split in `emit_state.vl`'s
table with every site above audited against it. Note the repo's own established answer to
"we need one more word per value" is a **wrapper heap type** (the union box,
`emit_sections.vl:5053`) — which does not work here, because identity must be intrinsic to
the object the user already holds. That leaves the split, or finding 6's alternative.

---

### 4. An EAGER serial survives Heap2Local as pure waste — **(RUN)**

`serial_b.vl` is a 20M-iteration loop constructing a 3-field struct with an eager i32
serial. Under `wasm-opt -O3` the `struct.new` is **entirely deleted** — Heap2Local
scalarises it, as for the 2-field control. What remains:

```wat
(loop $label (if (i32.lt_s (local.get $0) (i32.const 20000000)) (then
  (global.set $global$0 (i32.add (global.get $global$0) (i32.const 1)))   ← survives
```

20,000,000 increments tagging **zero** allocations. A `global.set` is a side effect;
binaryen cannot remove it. The eager serial costs most exactly where the proposal's model
says least — and worse, **the counter names construction-site executions rather than heap
objects**, a strictly larger population, which is why finding 2's 10.2 s is an upper bound.

| | wasmtime (VL host) | V8 |
|---|---|---|
| 2-field control | 2.284 ns/alloc | 3.611 ns/alloc |
| 3-field, serial written as constant `0` (**lazy**'s alloc cost) | **2.233** (−0.05, free) | 4.003 (+0.392) |
| 3-field, eager i32 from a counter | 2.533 (+0.249, **+10.9%**) | 4.312 (+0.701, **+19.4%**) |

Keying side, 10M keyings: `keyEager` 0.540 ns vs `keyLazy` (load, test-for-zero, assign on
first use) 0.530 ns — **−0.011 ns**, the branch is perfectly predicted and free. A
scalarised object is never keyed (it did not escape), so under lazy it never takes a serial
at all — the waste and the counter inflation both disappear.

**Lazy needs nothing new from the GC type.** Every user struct field VL emits is already
mutable: `emit_sections.vl:5048` writes `wU8(1) // mutable` per field, and the disassembly
agrees (`(struct (field (mut i32)) (field (mut i32)))`, **RUN**). The only immutable struct
fields are the union box's two (`emit_sections.vl:5055–5058`) and the per-rep value boxes —
where identity is wrong anyway (finding 7).

**Recommendation: lazy, i64, `0` = unassigned.** Better than eager on allocation cost,
keying cost, overflow, Heap2Local interaction and counter semantics. Its only costs are a
`struct.set` on first keying and a note that it is not thread-safe in a future with threads.

---

### 5. `ref.eq` does not pin an allocation — §4.1 answered, cost zero — **(RUN)**

**binaryen 130 `src/passes/Heap2Local.cpp`**, escape analyzer, then optimizer:

```cpp
void visitRefEq(RefEq* curr) {
  // The reference is compared for identity, but nothing more.
  escapes = false;
  fullyConsumes = true;
}
// If our reference is compared to itself, the result is 1. If it is
// compared to something else, the result must be 0, as our reference does
// not escape to any other place.
```

`a_base.wat` (allocate, read two fields) and `b_refeq.wat` (the same plus a `ref.eq`
against an incoming param) both reduce under `-O3` to a bare `i32.add` of the two params —
`struct.new` gone in both, B's `ref.eq` folded to 0. `c_cases.wat` puts six shapes through
the same mill; raw and `-O3` modules both run under Deno/V8, **all seven assertions
identical before and after, all correct**:

| shape | want | raw / -O3 | what `-O3` did |
|---|---|---|---|
| self-alias `p === q` where `q = p` | 1 | 1 / 1 | folded to `1`, allocation deleted |
| two fresh, structurally equal | 0 | 0 / 0 | folded to `0`, both deleted |
| conditional alias `c ? p : fresh` | c | ✓ / ✓ | **kept** — genuinely escapes |
| escape via a global, compare back | 1 | 1 / 1 | **kept** |
| fresh vs an incoming param | 0 | 0 / 0 | folded to `0`, deleted |
| identity through an array slot | 1 | 1 / 1 | array deleted, `ref.eq` folded |

Precise in both directions. `===` on a value Heap2Local would otherwise scalarise costs
**nothing** — it does not merely survive, it disappears; cost when it does survive is
**0.430 ns**. **Green light for P1 and P5's `===` rule**; §4.1 needs no change but deleting
the worry. (Cosmetic: one `-O3` pass leaves a dead `struct.new` in the array case; a second
clears it.)

---

### 6. Decision D's seen-set is below the crossover — P4 may have no v1 customer — **(RUN)**

`set.wat` races a real open-addressed identity table (serial for bucket selection, `ref.eq`
for equality, VL's own linear probe) against a flat `ref.eq` array scan, per successful
lookup:

| N (ns per lookup) | 2 | 4 | 8 | 16 | 32 | 128 | 1024 |
|---|---:|---:|---:|---:|---:|---:|---:|
| hashed, raw hash | 0.92 | 0.84 | 0.90 | 0.93 | 0.95 | 0.80 | 0.73 |
| hashed, VL's mix | 1.99 | 1.98 | 1.93 | 2.35 | 1.74 | 1.92 | 1.98 |
| flat `ref.eq` scan | **0.80** | **0.88** | **1.45** | 2.35 | 4.36 | 15.93 | 136.12 |

**Crossover against a correctly-mixed identity table: N ≈ 12–16.** Below that a flat array
of refs with a linear `ref.eq` probe wins — no hash, no table, no resize, and **no serial
field**, which is the entire cost of findings 1–4.

Whether that matters turns on an ambiguity in the proposal: a *cycle* seen-set needs only
the **ancestor path** (depth, typically well under 16); a DAG-sharing seen-set needs **all
visited nodes** (O(graph)). §P5 says "cycle seen-set".

**Recommendation:** settle which D means, in D's own text, before P4 is scheduled. If it is
the path, **ship `IdentitySet` as a flat `ref.eq` probe and defer the serial entirely** —
that buys the proposal's whole user-visible surface at zero compiler risk. If a later
customer needs thousands of keys, make the container **adaptive**: flat array to 16,
promoting to a serial-keyed table beyond. Adaptive composes with lazy (finding 4) — a
program whose identity sets stay small never assigns a serial, so the counter never advances
and finding 2's overflow never arrives.

---

### 7. `ref.eq` on a union box silently answers `false` for `a === a` — **(RUN)**

§4.7 asks whether `===` across union arms compares the box or the payload. Not a toss-up —
one arm is a silent wrong answer. `box.wat` builds two `{tag, payload}` boxes wrapping the
**same** struct:

```
ref.eq on the BOX     = 0     ← a === a is FALSE
ref.eq on the PAYLOAD = 1     ← correct
```

Since a narrowed union re-boxes at some positions and not others (D972/D973), "compare the
box" makes `===` **position-dependent** — the same two expressions answering differently
depending on where the compiler boxed. Check-clean, wrong at runtime. The proposal already
states the right rule ("compare the *object*, never the box") but as a preference in an
open-questions list. **It is a correctness invariant and belongs in P1**, with the unboxing
spelled out as part of the lowering. The box's fields are emitted **immutable**
(`emit_sections.vl:5055`), so there is nowhere to put a serial on a box even if one wanted
to — which independently forces payload semantics for P4.

---

### 8. P3 has no rule for container-bearing struct keys — **(RUN)**

For a flat struct P3 is cheap: a 3×i32 key costs 0.679 ns to hash and 0.742 ns to compare
against 0.578 / 0.430 for identity — **1.4× per lookup**. But the shape walk has no depth
bound. `deep.wat` keys on `{ i32, i32[] }`:

| array length | 4 | 16 | 64 | 256 | 1024 | 4096 |
|---|---:|---:|---:|---:|---:|---:|
| structural ns/hash | 1.88 | 6.92 | 33.93 | 181.46 | 778.06 | **3304.04** |
| identity ns/hash | 0.50 | 0.51 | 0.52 | 0.58 | 0.96 | 0.70 |
| ratio | 3.8× | 13.5× | 65.8× | 311× | 806× | **4697×** |

Linear at ~0.79 ns/element. A lookup on a 4096-element key costs **3.3 µs**, every time —
nothing amortises, the key is walked fresh per lookup.

**The mutable-key hazard is worse than the cost.** §1's witness re-run verbatim (**RUN**,
prints `true / 9 / false`) establishes that VL structs are mutable and `==` is structural. A
structurally-hashed key mutated after insertion is **lost** — the classic Java/Python bug,
silent, and P3 introduces it without mentioning it.

**Recommendation, in order:** (1) **refuse container-bearing keys in v1** with a message
naming the limitation, as P5 does for arrays and functions — the only option that closes the
mutation hazard rather than pricing it; (2) cache the hash in a hidden field — but that is
the *same* injection machinery as P4 and inherits findings 1 and 3; (3) cap key depth —
arbitrary and unjustifiable. At minimum the module header owes the mutation rule.

---

### 9. The container must mix, and VL's map already does — **(RUN)**

`set.wat` fills a 4096-key table at 50% load with serials at various strides:

| serial stride | 1 (dense) | 16 | 256 | 1024 | 65536 |
|---|---:|---:|---:|---:|---:|
| raw modulo, probes/key | **1.00** | 4.50 | 64.50 | 256.50 | **2048.50** |
| VL's `fmix32`, probes/key | 1.49 | 1.49 | 1.51 | 1.49 | 1.50 |

At stride ≥ capacity every key lands in one bucket and the table *is* a linear scan
(2048.5 = (N+1)/2 exactly); "every 1024th object is keyed" sits at **256 probes per key**.
Note the honest converse, which is why someone would skip the mix: at stride 1 the raw
modulo is a **perfect** hash and mixing makes it *worse*. The proposal's "a plain modulo
over sequentially allocated keys is sequential and fine" is exactly right and exactly the
trap. Price of mixing: +0.49 probes/key in the friendly case, ~1.1 ns/lookup — against a
2048× cliff, a rounding error.

**Already solved if `IdentitySet` reuses the existing container**: `wasmEmit.vl:7627
emitMapHashOf` routes i32 keys through `emit_bytes.vl:643 fbI32HashMix` — the **murmur3
`fmix32` finalizer**, a full avalanche mix, and the 1.49–1.52 row above is that exact
function. VL's map is FNV-1a + tombstone-aware linear probe with a per-entry cached hash
(`wasmEmit.vl:7612`, `:7648`). **Recommendation:** state in P4 that
`IdentityMap`/`IdentitySet` are the **i32-keyed map rep with the serial as key and `ref.eq`
as the equality check**, not a new table; with an i64 serial (finding 2), add an i64→i32
finalizer next to `fbI32HashMix`.

---

## Cost table

wasmtime = the `vl` host (wasmtime 47), min-of-9 over 5M ops minus a measured empty-module
startup floor, `taskset -c 2-5`. V8 = Deno, in-process `performance.now()`, min-of-11.

| operation | wasmtime | V8 | bytes |
|---|---:|---:|---:|
| `===` (`ref.eq`), non-escaping operand — folded away | **0** | **0** | 0 |
| `===` (`ref.eq`), escaping operand | — | 0.430 ns | — |
| allocate 2-field struct, dead on arrival | 2.284 ns | 3.611 ns | — |
| allocate 2-field struct, retained | 70.5 ns | — | — |
| + serial field written as constant 0 (**lazy**) | **−0.05 ns** | +0.392 ns | +19 |
| + eager i32 serial (field + counter) | +0.249 ns | +0.701 ns | +19 |
| + eager i64 serial (field + counter) | +0.263 ns | +0.664 ns | +48 |
| lazy serial branch at keying time | — | **−0.011 ns** | — |
| identity hash raw / murmur `fmix32` | — | 0.515 / 0.578 ns | — |
| structural hash, 3×i32 key | — | 0.679 ns | — |
| structural hash, `{i32, i32[64]}` / `[4096]` | — | 33.93 / 3304 ns | — |
| serial compare (`struct.get` + `i32.eq`) | — | 0.538 ns | — |
| structural compare, 3×i32 | — | 0.742 ns | — |
| `IdentitySet` lookup, mixed, any N | — | ~1.95 ns | — |
| flat `ref.eq` scan lookup, N=8 / N=1024 | — | 1.45 / 136.12 ns | — |
| **2³² eager increments (i32 wrap)** | **10.23 s** | — | — |

Module size, one construction site: 239 B baseline → 258 B (+i32 serial) → 287 B (+i64);
post-`-O3` on the escaping variant 248 → 267 → 267.

---

## What this angle cannot see

* **Whether `===` is a footgun.** §3 is about human reflex and error messages. My numbers
  say the operator is cheap; nothing about whether people reach for it wrongly.
* **Whether the "is this type identity-keyed?" analysis is sound.** I priced its
  consequences, not its correctness. Finding 3 shows the question is malformed as posed (it
  must be asked of a twin equivalence class, not a declaration), but a correct version could
  still be too broad or narrow and nothing here detects either.
* **Compile-time cost.** Not measured: the injection pass, the extra whole-program
  traversal, or what a struct-layout-changing analysis does to LSP latency — and the
  compiler core is dual-runtime, recompiling on every keystroke.
* **Liveness and retention.** §4.6 notes identity keys keep objects alive. I measured
  allocation and lookup, never GC pressure or peak RSS under a large live `IdentityMap`.
  The 2.3 vs 70.5 ns spread on retention hints retention dominates everything here.
* **Generics (§4.3), newtypes (§4.4), the two-names question (§4.5)** — checker and
  std-review questions with no runtime cost to weigh.
* **Real programs, and one engine's numbers.** All microbenchmarks on an idle-ish box; the
  allocation rate alone moved 30× on retention policy, and wasmtime and V8 agreed on
  direction everywhere but differed up to 3× in magnitude (the extra field was free on
  wasmtime, +0.392 ns on V8). Treat the *ratios* as durable and the absolute nanoseconds as
  this-box, this-day; re-run on the engine any decision targets.

---

## Appendix — programs, commands, raw output

Programs are under `scratchpad/id/`; reproduce with a seed from `scripts/refresh-compiler.sh`
(rc 0). `VL_STD=$PWD/std` on every host invocation — a worktree probe otherwise reads the
main checkout's std.

**Toolchain.** `wasm-opt --version` → `wasm-opt version 130 (version_130)`. Host:
`scripts/vl-host/target/release/vl`, wasmtime 47 (`scripts/vl-host/Cargo.toml:32`).
`which wasmtime` finds nothing — there is no standalone CLI, the host is the embedding.

### A1 — Heap2Local vs `ref.eq`
```
wasm-opt -O3 --enable-gc --enable-reference-types --print a_base.wat  -o /dev/null
wasm-opt -O3 --enable-gc --enable-reference-types --print b_refeq.wat -o /dev/null
```
Both reduce to `(i32.add (local.get $0) (local.get $1))`; no `struct.new` survives; B's
`ref.eq` is gone.
```
wasm-as --enable-gc --enable-reference-types c_cases.wat -o c_cases.wasm
wasm-opt -O3 --enable-gc --enable-reference-types c_cases.wasm -o c_cases.O3.wasm
deno run -A run.mjs c_cases.wasm        # and c_cases.O3.wasm
```
Both print identically: `alias=1 two=0 cond(1)=1 cond(0)=0 viaglobal=1 vsparam=0
viaarray=1`. Source citation fetched from
`raw.githubusercontent.com/WebAssembly/binaryen/version_130/src/passes/Heap2Local.cpp`.

### A2 — serial cost, VL host (wasmtime)
`wt_a/wt_z/wt_b/wt_c.vl`, 5,000,000 constructions stored to a module global (escapes, dies
immediately). `vl build`, then `time.sh 9 <wasm>` (min-of-9, `taskset -c 2-5`,
`vl run <prebuilt.wasm>`).
```
empty.wasm   3306 us   ← startup floor, subtracted
wt_a.wasm   14727 us → 2.284 ns/alloc      wt_z.wasm  14472 us → 2.233 (3 fields, const 0)
wt_b.wasm   15970 us → 2.533 (eager i32)   wt_c.wasm  16043 us → 2.547 (eager i64)
```
Retained variant (`esc_a/b/c.vl`, 4M objects pushed into an array), min-of-7:
`esc_a 285616 us → 70.5 ns/alloc; esc_b 279480; esc_c 278212`. The serial arms measured
*faster* than the control; spread here is ~6%, so the correct reading is "the serial's cost
is below the noise floor at the retained rate", not "negative".

### A3 — eager serial survives Heap2Local
`wasm-opt -O3 … --print serial_b.wasm` — `struct.new` absent,
`(global.set $global$0 (i32.add (global.get $global$0) (i32.const 1)))` present inside the
20M-iteration loop. The `serial_a.wasm` control has neither.

### A4 — in-process microbenchmark (V8)
`micro.wat` → `micro.wasm` (`wasm-as`), driven by `micro.mjs`, min-of-11, 3 warmups.
```
loop_base 0.221   loop_inc32 0.244   loop_inc64 0.224            (ns/iter, N=20M)
alloc2 3.611  alloc3z 4.003  alloc3 4.312  alloc3L 4.275         (ns/alloc, N=5M)
keyEager 0.540   keyLazy 0.530                                   (ns/keying, 10M)
hashSerialRaw 0.515  hashSerialMix 0.578  hashStruct(3xi32) 0.679
probeEq 0.430  probeSerial 0.538  probeStruct(3xi32) 0.742
```

### A5 — i32 overflow
`overflow.vl`, 65536×65536 = 2³² constructions, `time.sh 3`:
`overflow.wasm min 10234953 us out=0`. The trailing `0` is the counter after 2³²
increments — an exact wrap.

### A6 — hash quality and crossover
`set.wat` → `set.wasm`, driven by `set.mjs`. `$hmix` transcribes `emit_bytes.vl:643
fbI32HashMix` (murmur3 `fmix32`, masked non-negative). Probe counts are exact (the fill loop
counts them); lookup timings min-of-9 over ~4M lookups per configuration. Tables in findings
6 and 9.

### A7 — deep structural keys
`deep.wat` → `deep.wasm`, driven by `deep.mjs`. 2000 keys of shape `{i32, i32[len]}`, FNV-1a
over the i32 field then every array element; identity arm reads one field and mixes. Table
in finding 8.

### A8 — union box identity
`box.wat` → `box.wasm`, driven by `box.mjs`: `ref.eq on the BOX = 0`,
`ref.eq on the PAYLOAD = 1`.

### A9 — proposal §1 witness, verbatim
`s1.vl` is §1's program character for character. `vl run s1.vl` → `true`, `9`, `false`.
`mapkey2.vl` reproduces the struct-key refusal verbatim: ``A P-keyed Map isn't supported
yet — `Map`/`Set` keys must be `string` or `i32` ``.

### A10 — layout twins
`twin.vl` (Circle and Dot exact twins, structural annotation) → `3`, `30`, rc 0.
`twin_split.vl` (Circle carrying one extra field) → `30`, `1`, rc 0. Both compile and run;
the twin-split did **not** reproduce a behaviour change. See finding 3.

### A11 — field-injection site inventory (finding 3)

All read-only citations, `compiler/`. **The table**: `emit_state.vl:1016–1046` (`sNames`,
`sRowDecl`, `sFieldNames`, `sFieldStart`, `sFieldCount`, `sFieldTypes`, `sHeapIdx`, …);
header at `:903` — *"declaration order = wasm struct field index"*. Union arms mirror it at
`:1811–1816`. The only hidden rep field in the compiler is the string header's hash memo
(`emit_state.vl:1123`, accessors `emit_bytes.vl:724–733`), on a non-user heap type.

**Exact-arity matches against a declared field-list length** — `emit_classify.vl:10710`
(`structIndexOfObjCtxGo`), `:5611` (`mvValRowOfShape`), `:15958` (`tyHasStructRowShallow`),
`:16274` (`structRowOfObjFieldSetK`), `:16443` (`shapeRowScanK`), `:21623`
(`repRowOfTyLenientRow`), `:23307` (`annShapeWiderRowOf`), `:23364` (`anonLeafServingRow`),
`:23418` (`anonLeafFoldBlocked`), `:24066` (`annShapeIndexOf`), `:30928`
(`objNestedFieldCompat`); variants `:16038` (`variantRowOfObjFieldSetK`), `:16821`
(`variantIndexOfTypeName`).

**Rep-row-to-rep-row count gates** — `emit_rep.vl:3044` (`structFieldCodesEq`),
`emit_classify.vl:25238` (`variantStructHeapTwinAt`), `:24982` (`variantFieldLayoutEq`),
`emit_collect.vl:10946` (`variantFieldTysEq`), `emit_classify.vl:31051`
(`structIdxMatchesVariantIdx`).

**`struct.new` arity sites** (one encoder, `emit_bytes.vl:695` `fbStructNew`, which takes no
operand count — arity is implicit in what the caller pushed): `wasmEmit.vl:2787` `emitObj`
(`cnt` at `:2801`, name-keyed operands `:2804`, `emitOmittedFieldNull` `:2745`, `fbStructNew`
`:2966`); `:3235` `emitVariantStruct` (`:3237`, `:3352`); `:3416`
`emitStructExprAsVariantBox` (`:3423`, `:3438`, `:3450`, `:3453`). Type-section writers that
must agree: `emit_sections.vl:4995–5014` (structs), `:5035–5050` (variants).

**Positional (non-name-lookup) field indices** — `wasmEmit.vl:5747`/`:5749`
(`emitVariantArmEq`), `:11319`/`:11327` (`emitStructEqChain`, `pathFi` pushed at
`:11842`). No site computes a field index arithmetically (grepped; zero matches).

**Fingerprints / interner keys** — `repCanonKey` `emit_rep.vl:394–448`; `slotCanonId`
`:2854–2915`; `buildStructTwins` `:3387–3411`; `structFieldCodesEq` `:3043–3103`;
`repStructSlotsTwin` `:3110–3117`; `shapeFieldSetIdOf` `emit_classify.vl:3905–3946` with
the count as component 0 (`:23934`), documented at `:23880`; `variantSig` `:5258–5269` →
`assignTags` `emit_collect.vl:10977–10994` (global union tag = sig sort rank); `rlSig`
`emit_collect.vl:5410–5462`. Monomorphizer keys on pinned type *spellings*, not fields
(`emit_mono.vl:3170–3184`).

**Width subtyping (D622)** — `emit_sections.vl:4874` `structRowIsProperPrefix`, `:4923`
`buildStructSupers` (longest proper prefix wins), `emit_classify.vl:9207`
`structRowPrefixCheap`.

**Shape walks a hidden field must be excluded from** — `==`: `wasmEmit.vl:11793`
`emitStructEqRec` via `eqRowFieldCount` (`emit_classify.vl:7837`), arm path `wasmEmit.vl:5729`
`emitVariantArmEq`; gates `:5709` `variantFieldsComparable`, `emit_classify.vl:8177`
`eqgStructElemFlat`. **No struct printing walk** (print of a struct is a domain refusal,
D711, `typecheck.vl:27797`), **no struct hashing**, **no derive** — so `==` is today the
only consumer, and a future deriver would be the second.

**Flat records** — second field table `typecheck.vl:12579–12583`; ABI guarantee
`docs/internals/flat-records-design.md:156`. Flat types also get an ordinary `sNames` row
(`emit_collect.vl:10619–10719`).

**D627** is filed **open** at `docs/internals/silent-class-inventory.md:18555` (not in
`DECISIONS.md`); D624's pin is `tests/cases/soundness/map-field-arm-shares-its-layout-twins-heap.vl`.
