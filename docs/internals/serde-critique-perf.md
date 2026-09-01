# The serde plan, attacked on performance — compile time and RUN TIME

> **Measured 2026-09-01 against seed `5380df1e`**, self-compiled in this worktree. Run time is
> the lens; compile time is the secondary. Every number below came out of a probe that is
> inlined in §Appendix so re-running it is a paste, not a paraphrase. Where a claim is a
> MODEL built from measured parts rather than a measurement, it says so in the sentence.
>
> Target: `docs/serde-design.md`. That document is unusually well measured for a design doc
> — its `(RUN)` claims hold. **What it has not measured is the cost of anything it proposes**,
> and five of the seven findings below are places where an unmeasured sentence points the
> wrong way.
>
> **The headline: the plan's ordering is right and its two biggest run-time risks are both
> unpriced.** Approach 2's binary form beats the text form by 4.5x on a scalar record and
> **96x once floats are in it** — the plan's own instinct, now with numbers. But (1) the cycle
> seen-set §Cycles calls "one hash-set insert per ref-typed node" **has no hash set to insert
> into** and degrades to O(n²), and (2) the static acyclic-shape skip that is supposed to make
> that free **does not exist in the compiler and has no reusable analogue**. Those two are one
> risk wearing two sentences, and it is the biggest one in the plan.

## Protocol, and what it does not support

| | |
|---|---|
| host | `scripts/vl-host/target/release/vl`, wasmtime, `--compiler build/vl-compiler.wasm` |
| seed | refreshed in-worktree from `compiler/*.vl` at `5380df1e` (see §Instrument notes — the shared cached seed was STALE) |
| std | `VL_STD=$PWD/std` on **every** invocation (CLAUDE.md: a worktree probe without it measures the wrong `std`) |
| execution | **always a prebuilt module** — `vl build`, then `vl run x.wasm`. Never `vl run <src>`. |
| pinning | `taskset -c 2-5` |
| statistic | **interleaved min-of-9**: every rep runs every arm of a comparison once, in order, so a load excursion lands on all arms rather than on one |
| control | house style — N iterations minus the same program with the body removed (`std/fmt.vl`'s `f64 ↔ TEXT` header protocol) |
| `-O3` | `VL_WASM_OPT=./node_modules/.bin/wasm-opt`, with the `cmp` against the default module that perf-landscape §2.4 requires. **Zero probes raised `O3-NOOP`.** |
| startup | empty program, min-of-9: **3 ms**, subtracted or controlled out everywhere |

**Noise floor: 1.7%.** Explicit repeat probe — the same module bytes under two names,
interleaved: `a1` 175 / 178 ms, `v1` 51 / 51, `c3` 81 / 81. **Differences under 2% are not
differences.**

**This box was not quiet and the reading is the same as perf-landscape §2.3's.** Load average
ranged 0.8 to 57 across the session (other agents). One non-interleaved measurement read `g1`
at 1,890 ms where the interleaved passes read 634–675 ms on **identical bytes** — a 2.9x swing,
inside the 2.5–4x band that document measured. **Read the RATIOS. The absolutes drift.** Every
ratio quoted below was taken interleaved; the headline sets were re-taken on an idle box
(load 0.76–1.17) and agreed with the loaded passes to within 5%.

---

# Ranked findings

## 1. The cycle seen-set is O(n²), because VL has no reference-keyed set — and this is the single biggest run-time risk in the plan

`docs/serde-design.md` §Cycles: *"The walk carries an identity seen-set… Cost: one hash-set
insert per ref-typed node visited."* **There is no hash set it can insert into.**

Measured, one line, `vl check` refusing at the type level:

```
A Node-keyed Set isn't supported yet — `Map`/`Set` keys must be `string` or `i32`
```

So the userland spelling does not exist. Neither does an emitter-side one, for the reason
perf-landscape's P7b already established for a different feature: **WasmGC has `ref.eq` and no
instruction that derives an integer from a reference identity**, so an identity-keyed table
degenerates to a linear scan. And the fallback a user would reach for is worse than useless —
`==` on VL structs is *value* equality, which on a cyclic value diverges, as §Cycles itself
notes.

That leaves a scan. Priced, with an i32 `id` compare standing in for `ref.eq` — **strictly
cheaper** than the real thing (no null check, no cast), so this is a **lower bound**:

| ref-typed nodes | seen-set scan | vs previous |
| --- | --: | --: |
| 1,000 | 5 ms | — |
| 2,000 | 8 ms | 1.6x |
| 4,000 | 19 ms | 2.4x |
| 8,000 | 55 ms | 2.9x |
| 16,000 | **204 ms** | 3.7x |

Approaching 4x per doubling: quadratic, as the algorithm says. The per-comparison cost is
**1.57 ns**, and the walk makes N²/2 of them.

**Put beside the thing it is protecting.** Encoding 16,000 records as VLB costs 16,000 ×
0.180 µs = **2.9 ms** (finding 3). The seen-set over the same 16,000 ref nodes costs
**204 ms — 70x the encode itself.** The bookkeeping is not a tax on the walk; at any
interesting size it *is* the walk.

Where it stops being free: the scan stays under 1 ms of overhead to about **1,100 ref nodes**,
costs 80 ms at 10,000, and extrapolates to **~8 seconds at 100,000** — a size a snapshot of an
application state tree reaches without trying.

**Remedy, in the order they should be tried.**
1. **Make the static acyclic-shape skip load-bearing and build it first** (finding 2). It is
   the only thing that makes the common case cost zero, and the design doc already says so —
   it just files it as an optimisation rather than as the mechanism.
2. **`serializeUnchecked<T>` is not "deferred until measured" any more. This is the
   measurement.** §Cycles says *"if the static acyclic-shape skip already covers the hot
   callers… the unsafe variant may have no customer, and per std review discipline it then
   should NOT ship."* The skip covers shapes that hold **no ref at all** — no string, no
   array, no map, no nested struct. That is a much smaller set than "message-passing payloads
   are usually trees of records": a record with one `string` field is ref-bearing. So the
   unchecked variant's customer is *every* ref-bearing acyclic shape, which is nearly all of
   them, and it is the difference between O(n) and O(n²).
3. **If a checked default over ref-bearing shapes is wanted, it needs an identity integer**,
   which means a slot on the object — the same representation problem P7b hit for the string
   hash, and the same answer: the string header already grew one (finding 8). An emitter that
   can stamp a walk-ordinal into a spare slot turns the seen-set from O(n²) into O(n). That is
   a representation change and should be priced as one, not assumed.

**Accepted cost, if none of that happens:** say in the doc that `serialize<T>` over a
ref-bearing shape is quadratic in the ref-node count, and give the threshold (~1,000 nodes).
An unstated quadratic is how this bites someone at 3 a.m.

## 2. The static acyclic-shape skip does not exist, and no existing per-shape machinery makes that judgment

§Approach 2: *"A shape whose transitive fields hold no ref… skips the cycle seen-set entirely,
decided at compile time."* §Cycles: *"the emitter knows that statically per monomorphized
shape, so acyclic-by-construction shapes skip the bookkeeping at compile time and pay
nothing."*

Audited against the compiler. **Nothing in `compiler/*.vl` answers "this shape's fields,
recursively, contain no reference type."** There is no `isScalar` / `allScalar` / `refFree` /
`containsRef` / `isPlainData` / `isValueType` predicate at any level. The four nearest things
each miss for a different reason:

| what exists | file:line | why it is not the judgment |
| --- | --- | --- |
| `repTyScalarMask` | `compiler/emit_rep.vl:3862` | fully transitive, memoized per arena index, cycle-guarded — but it asks "does this type MENTION an i64/f64/f32 leaf", the wrong polarity and the wrong question |
| `isEquatable` | `compiler/typecheck.vl:15518` | transitive over every struct field, cycle-safe via an ancestor stack — but it classifies *comparability*, and deliberately calls `string`, arrays and closures (all heap refs) fine |
| `tyPrintsAsRef` | `compiler/typecheck.vl:27851` | genuinely about ref-ness — but **one level deep**: a `TyObj` returns `true` immediately rather than descending |
| `flat`'s layout resolver | `compiler/typecheck.vl:12555` | transitive by fixpoint and memoized per declaration — but keyed on the declared NAME, admits nesting only through a spelling that names another `flat` type, and rejects `boolean` and `string` outright |

`flatWhyNot` (`typecheck.vl:12726`) is the only place that enumerates ref-ness per arena
variant at all ("an array is a heap reference", "a map/set is a heap reference", "a function
value is a reference", "a union is boxed on the heap") — and it returns a **string**, not a
bit, and is only called on an already-rejected field.

**So fact 2 of the design doc — "the compiler already walks shapes and generates per-shape
machinery… a derive is one more resident of that neighborhood" — is true about the WALK and
false about this particular JUDGMENT.** The neighborhood has the walking machinery; it has
never had to ask this question.

**Remedy: cheap, and the template is already written.** A sibling of `repTyScalarMask` in
`emit_rep.vl` — the same `repSeenGen` generation stamps, the same root-only memo discipline
(interior nodes of a cycle deliberately not memoized), the same `repReset` hook, the same
exhaustive `_`-less `match` so a twelfth `Ty` variant breaks the self-compile rather than
silently answering "ref-free". One function, one parallel array. **Build it before the walk,
not after** — finding 1 is what happens if it is late.

**One correctness note the design doc should carry:** the derived `==` emitter this derive
would sit beside (`emitStructEqRec`, `compiler/wasmEmit.vl:11793`) has **no memo and no
recursion guard at all**. It terminates only because `isEquatable` refuses `T | null` and map
fields upstream, which incidentally makes a self-referential struct unreachable. That is an
*accidental* bound. The derive cannot copy that structure, because §Approach 2 explicitly
wants *"recursion in the type becomes recursion in the generated functions"* — it must carry
its own bound, by design and by fixture.

## 3. Binary beats text by 4.5x on a scalar record and 96x once floats are in it — the plan's ordering is right, and here are the numbers it was missing

Same 10-field record throughout, 200,000 encodes, interleaved min-of-9, control subtracted
(a loop with the same struct write and the same sink, no encoding). All five encoders were
asserted to produce **byte-identical output totals** (26,888,890 code points) before any ratio
was taken.

| encode | ms | µs / record | vs the template | wire size |
| --- | --: | --: | --: | --: |
| control (loop + sink only) | 16 | — | — | — |
| **one big template**, 10 holes | 179 | **0.815** | 1.00x | 134 chars |
| `+` accumulator, 21 appends | 177 | 0.805 | 0.99x | 134 chars |
| nested per-field templates | 353 | 1.685 | **2.07x** | 134 chars |
| `u8[]` code-point builder + `fromCodePoints` once | 339 | 1.615 | **1.98x** | 134 chars |
| **VLB-shaped binary** (LE scalars, u32-prefixed UTF-8) | 52 | **0.180** | **0.22x** | **81 bytes** |

And with three `f64` fields in the same record, 20,000 encodes:

| encode | ms | µs / record | wire |
| --- | --: | --: | --: |
| JSON text | 675 | **33.6** | 159 chars |
| VLB, floats as their 8 bit-pattern bytes | 10 | **0.35** | **71 bytes** |
| | | **96x** | 2.2x smaller |

At `-O3` the same pair reads 666 / 9 ms — **74x**, so this is not an optimizer artifact.

**The doc should say the thing this measures: the text-float cost is why VLB exists.** §OQ-3
already argues bits-verbatim from *fidelity* (−0, NaN payloads, the 14-of-50,000 cross-host
tie-break bug). It is also a **96x** run-time argument, and that is the one a reader schedules
against. `docs/serde-design.md` §Approach 2's wire bullet should carry it.

## 4. Float rendering cost swings 8.7x with the value's MAGNITUDE, and `std/fmt.vl`'s header quotes one end of that range without naming the population

`std/fmt.vl`'s `f64 ↔ TEXT` header: *"rendering a random double ~25 µs (the 17-digit case)"*.
Re-measured on the header's own protocol — 100,000 iterations, wall clock, minus the same
program with the loop body removed:

| population | 100,000 renderings | µs each | avg chars |
| --- | --: | --: | --: |
| ordinary magnitude (~0.3, 17 significant digits) | 262 ms | **2.59** | 18.4 |
| accumulating over 1 … 1e5 | 288 ms | 2.85 | 17.2 |
| **uniformly random 64-bit patterns** | 1,439 ms | **14.4** | 22.4 |
| ~1e308 | 2,261 ms | **22.6** | 23.0 |
| subnormal, ~1e-308 | 2,269 ms | 22.7 | 22.5 |

**The header is not wrong; it is under-scoped, and the difference is 8.7x.** A *uniformly
random* 64-bit pattern is overwhelmingly at an extreme exponent, and Burger–Dybvig holds the
value as exact big integers, so a huge exponent is a long limb vector. The header measured
that end. **JSON documents do not carry uniformly random doubles** — they carry prices, ratios,
coordinates, timestamps — so the number a `std:json` author should plan against is **2.6 µs**,
not 25.

This is CLAUDE.md's own rule one level down: *name the population in the sentence.* "25 µs per
rendering" and "2.6 µs per rendering" are both true and they are about different populations,
and only one of them is about a config file.

The rest of the float ladder, same protocol:

| operation | measured | note |
| --- | --: | --- |
| `parseF64`, fast path (`"0.1"`-class) | **0.19 µs** | header says < 1 µs — holds |
| `parseF64`, exact path (17 digits) | **5.66 µs** | header says ~22 µs — that is the extreme-exponent end again |
| `toString(i32)` | **0.137 µs** | 1,000,000 iterations |

**One consequence worth its own line: `toString(i32)` is HALF of a float-free JSON encode.**
The 10-field record above renders three integers at 0.137 µs each = 0.41 µs, against a total
encode cost of 0.815 µs. So on a record with no floats, **integer text conversion is ~50% of
the bill** — which makes perf-landscape §4.8's `strings/int-format` row (the pure-VL renderer
at 5.3x the retired builtin, *now the only path*) a direct `std:json` throughput item, not a
library curiosity. That row's own header asks for a re-run; this is a second reason to do it.

**Where the crossover lands, for the doc to state plainly.** At 2.6 µs a rendering, a document
of 1,000 ordinary floats costs **2.6 ms** of pure text conversion, 10,000 costs 26 ms, 100,000
costs 260 ms. Read against the design doc's own split: **(a) config — fine, and not close;
(b) messaging — no, and not close.** VLB's 0.35 µs whole-record cost is the answer for (b),
and that is exactly where the plan already puts it.

## 5. A `u8[]`-based lexer buys NOTHING, because a VL string already IS a `u8[]` — and the byte-side spellings are all slower

The brief's premise — *"is a `u8[]`-based lexer (bytes, not string indexing) the right call?"*
— rests on a fact that has moved. Measured from `wasm-dis` of the probes' own modules:

```
(type $0 (array (mut i32)))
(type $1 (array (mut i8)))     ;; <- `string`'s backing
(type $2 (struct (field (ref $1)) (field i32) (field i32) (field (mut i32))))   ;; <- `string`
(type $6 (array (mut i8)))     ;; <- `u8[]`'s backing
```

**`string` and `u8[]` have the same storage type**, and both element reads lower to the same
instruction, `array.get_u`. Confirmed at the language level: for `const s = "aé€"`, `s.length`
is **6** (bytes, not code points), `s[0]` is **97** and `s[1]` is **195** — `s[i]` is a BYTE —
and `s.bytes()[1]` is the same 195. The compiler calls this Stage 2c
(`compiler/emit_sections.vl:5100`, *"0x78 i8 storagetype — PACKED UTF-8 bytes"*).

So the measurement can only come out one way, and it does. 200 passes over a 104,399-byte JSON
source = 20,879,800 character positions, control = the identical loop and the identical
comparison chain over a synthetic character:

| lexer inner loop | ms | ns / position | over control |
| --- | --: | --: | --: |
| control (no read at all) | 34 | 1.49 | — |
| **`s[i]` on a `string`** | 44 | 1.96 | **+0.48** |
| `b[i]` on a hand-built `u8[]` | 46 | 2.06 | +0.57 |
| `b[i]` on `s.bytes()`, hoisted per pass | 49 | 2.20 | +0.71 |
| **lexer OBJECT — `at()`/`bump()`/`more()` per character** | 84 | 3.88 | **1.98x the string loop** |
| the same lexer object at `-O3` | 37 | — | the gap CLOSES |
| `s[i]` at `-O3` | 39 | — | |

**Three findings, in decreasing order of how much they change the plan.**

**(a) The `u8[]` lexer is refuted — it is 5% slower, which is inside noise, and it is slower
for a structural reason, not a measurement accident.** Both are WasmGC arrays; per-access
overhead (Cranelift's `array_elem_addr`, perf-landscape §4.5) dominates the element width
entirely. There is nothing to win. `std:json` should lex over the `string` directly.

**(b) `s.bytes()` COPIES, and calling it per token is a 4.7 µs-per-call trap.** Swept against
string length, 20,000 calls each: 1 KB → 0.40 µs, 4 KB → 0.50, 16 KB → 0.70, 64 KB → 3.00 —
length-proportional at ~24 GB/s plus ~0.35 µs fixed. A probe that called `.bytes()` once per
character took **99 seconds** where the hoisted spelling took 49 ms. The emitter comment calls
it a "view" (`compiler/emit_sections.vl:3033`); at the measured cost it is a copy, and a
`std:json` author reading that comment will write the 99-second loop.

**(c) The lexer-object shape costs 1.98x, and it is a DEFAULT-BUILD-ONLY cost.** `-O3` inlines
`at`/`bump`/`more` and the penalty vanishes (84 → 37 ms, level with the flat loop's 39). But
**`vl run` has no `-O` flag at all** (perf-landscape §6), so every user of a stage-1 `std:json`
pays the 2x that `wasm-opt` would delete. §Approach 1's sketch is exactly this shape.

**Remedy for (c), and it is a one-line rule rather than a feature:** the stage-1 lexer should
keep `pos` in a *local* inside one scanning function, not in a struct field read back through
a call per token. That is free, it is what the derive will emit anyway, and it does not wait on
P9 (inlining in the default build), which is the real fix and is filed at L.

## 6. `slice` is a zero-copy VIEW and `decodeUtf8At` is a full transcode — so on the STRING half, text decoding is architecturally faster than binary decoding today

This one inverts the expectation, and it is the finding most likely to change stage 2's
schedule.

**`slice` is O(1).** 1,000,000 slices, swept against the source string's length: 1 KB → 13 ms,
4 KB → 11, 16 KB → 11, 64 KB → 12. **Flat.** ~9 ns per slice regardless of size — the string
header is `{backing, offset, length, hash}` and `slice` builds a new header over the same
backing. A text decoder gets every string field for free.

**`decodeUtf8At` is not.** `std/utf8.vl:292`'s `decodeCore` walks the bytes into an `i32[]` of
code points and then calls `fromCodePoints`, which **re-encodes them to UTF-8** — a full
transcode round trip into a representation the bytes were already in.

Measured on the same 10-field record, 200,000 decodes:

| decode | ms | µs / record |
| --- | --: | --: |
| **JSON text**, pull-lexer + `slice` per string field (optimistic path) | 112 | **0.545** |
| **VLB binary**, LE scalars + `decodeUtf8At` per string field | 178 | **0.875** |
| VLB binary, **bytes→string ablated** (the step replaced by a constant) | 36 | **0.165** |

**The ablation is decisive: the bytes→string step is 142 ms of 175, i.e. 81% of the VLB
decode** — about **101 ns per string field** on fields of 3–12 bytes. Strip it and VLB's
scalar half is **3.3x faster than the JSON decode**, which is what the plan's premise
predicts. Leave it in and **VLB decode is 1.6x SLOWER than JSON decode.**

**This is the cheapest large win on the board and it is not in the plan.** VL strings are
UTF-8 bytes with an offset+length view; `u8[]` is UTF-8 bytes. Making a string from a
validated byte range is constructing a header, not copying — the same move `slice` already
makes. What is missing is the primitive. A `fromUtf8(b, off, len)` that **validates in place
and then builds a header** (no `i32[]`, no re-encode) recovers ~5x on VLB decode by
construction.

**Recommendation: file it as a stage-2 prerequisite, beside the `f32` remainder in stage 0.**
Without it, stage 2's decode ships slower than the stage 1 it is supposed to retire, on the
half of the record that is usually most of it — and the plan's headline claim for use case (b)
does not hold on its own numbers.

## 7. `u8[]` cannot be a struct field — the VLB decoder's own cursor shape is `vl check`-clean invalid… loud, and it is a clause-2 violation on the critical path

Six lines, `vl check` **rc 0**, then:

```vl
type Cur = { b: u8[], p: i32 }
const bs: u8[] = [1, 2, 3]
const c: Cur = { b: bs, p: 0 }
print(c.b[c.p])
// vl check: "Checked 1 file, no errors."  (rc 0)
// vl run:   emit error: emitProgram: struct field type `u8[]` has no struct-field rep
```

That is the **exact shape** of §Approach 1's `Lex = { src: string, pos: i32 }`, which runs —
the byte-cursor twin of the working text cursor. Every VLB decoder wants it.

**Scoped by ablation, not by the message** (CLAUDE.md): `u8[]` is the **only** element type
refused as a struct field. `i32[]`, `i64[]`, `f64[]`, `string[]` and `boolean[]` all declare,
build and read in one program. The refusal site is `fieldTypeRefusalMsg`
(`compiler/emit_classify.vl:19833`), whose own header records that the two `u8[]` fixtures pin
this sentence word for word — so it is a known, fixture-pinned gap, not a discovery. What is
new is **where it sits**: on the critical path of the format the plan's use case (b) depends on.

Per CLAUDE.md, *every loud emit reject is a clause-2 violation by construction*, since `check`
returned 0 to reach the emitter. The workaround exists (carry the position in a one-element
`i32[]`, which is what the V2 probe does), and it is exactly the kind of contortion §6 of
perf-landscape says users must not need.

**Remedy: this belongs in stage 2's prerequisite list**, next to finding 6's `fromUtf8`. Both
are small, both are on the same path, and both are invisible until someone writes the decoder.

## 8. The per-shape derive cost is LINEAR and cheap — and the superlinearity a naive sweep finds belongs to STATEMENT count, not shape count

The brief asked for the marginal compile cost per shape, modelled on the existing derived-`==`
machinery. The first sweep looked alarming and **the first reading was wrong**; the ablation is
what settles it.

**The clean per-shape number.** K distinct struct shapes, each declared, built once and read
once:

| shapes | build | module |
| --: | --: | --: |
| 40 | 13 ms | — |
| 640 | 165 ms | 55,494 B |

→ **0.25 ms per shape, and it is linear.** Module size: **85 bytes per shape** with no
generated function; **220 bytes** with a generated `==`. So **a generated per-shape function
costs ~135 bytes of module**, which is the number to multiply. A derive emitting
encode + decode × (VLB + JSON) is four functions per shape ≈ **540 bytes and ~1 ms per shape**,
as a same-order estimate — an encoder body is comparable in size to a compare body, and this is
stated as a model, not a measurement.

**What looked like a per-shape cliff, and was not.** Sweeping shapes-with-`==` reads 17 / 31 /
76 / 398 / **2,539 ms** at K = 40 / 80 / 160 / 320 / 640 — 6.4x per doubling, sharply
superlinear. Four arms, interleaved min-of-5, separate it:

| K | K shapes, 1 literal | K shapes, 2 literals, **no compare** | K shapes + field `==` | K shapes + struct `==` | **ONE shape** + K `==` |
| --: | --: | --: | --: | --: | --: |
| 80 | 18 | 31 | 55 | 31 | **26** |
| 160 | 30 | 57 | 126 | 76 | **63** |
| 320 | 63 | 128 | 499 | 398 | **331** |
| 640 | **165** | **352** | 2,741 | 2,539 | **2,503** |

Read the last column against the second-to-last: **one shape with 640 comparisons costs
2,503 ms; 640 shapes with 640 comparisons costs 2,539 ms.** The shape count contributes
essentially nothing. **The axis is the top-level statement count**, and the derived-`==`
codegen is innocent — the field-wise `==` arm, which generates no per-shape function at all,
is the *worst* of the four.

**And it is much milder inside a function**, which is where derive output lives: the identical
640 comparisons in one function body build in **513 ms** against the top level's 2,445 — a 4.8x
difference.

**So the honest compile-time verdict is: the derive is cheap and linear, ~0.25 ms and ~135
bytes per generated function per shape, and there is no per-shape cliff.** The cliff that
exists is a separate compiler finding about top-level statement density, recorded here because
it is what a sweep of this shape finds first — and because a critique that reported it as a
derive risk would have been wrong.

**Against the gate budget** (CLAUDE.md: `scripts/gate.sh` at 68 s, ≤ 5 min the standing bar):
a derive over a program with 100 distinct serialized shapes adds ~0.1 s of build and ~54 KB of
module. That is not a gate concern. **The module-size concern is real but belongs elsewhere:**
`std/fmt.vl`'s header already records that importing one `toString` pulls **17,062 bytes**
because there is no cross-module dead-code elimination. A `std:serde` whose generation is
driven by USE (OQ-1's recommendation (b)) is the right shape precisely because it does not
inherit that.

## 9. Concat is fine at config scale; DOCUMENT assembly by `+=` is quadratic and the fix already ships

The brief asks whether a `StringBuilder` is needed before stage 1. **No — but a rule is.**

**Per record, concat is a non-issue.** From finding 3's table: a single 10-hole template and a
21-append `+` accumulator are within 1% of each other (0.815 vs 0.805 µs), and **both beat
the `fromCodePoints`-once builder by 2x**. §Approach 1 calls that idiom the way to avoid
quadratic append; at this size it is a **2x pessimization**, and the design doc's own updated
sentence ("now an optimisation rather than a necessity") is still one step too generous.
Nested per-field templates — the shape a derive emits naturally, one encoder call per field —
also cost **2.07x**, because each intermediate is a real allocation.

**Per DOCUMENT it is a cliff, and the numbers are large.** N records into one JSON array:

| records | document | `doc = doc + rec` | `parts.push` then `join` once | ratio |
| --: | --: | --: | --: | --: |
| 1,000 | 133 KB | 25 ms | 25 ms | 1.0x |
| 2,000 | 267 KB | 48 ms | 30 ms | 1.6x |
| 4,000 | 535 KB | 128 ms | 44 ms | 2.9x |
| 8,000 | 1.07 MB | 517 ms | 72 ms | 7.2x |
| 16,000 | 2.15 MB | **2,233 ms** | **140 ms** | **16.3x** |

The `+=` column quadruples per doubling at the top (4.0x, 4.3x) — textbook O(n²), the same
`__str_concat__` behaviour perf-landscape §3.1 and P8 record. The `join` column doubles.

**Remedy: no new API. `join` is already `std:str`'s export and is already the linear one** —
its own header records it was rewritten off an `out = out + parts[i]` accumulator for exactly
this reason. What stage 1 owes is a **documented rule in `std:json`'s header**: a writer
accumulates `string[]` and joins once; it never appends to a running document. Then the
per-record spelling can stay the template, which is both the fastest and the most readable.

**Where the crossover is, for the doc to state:** the two are equal at ~130 KB of output and
diverge fast above ~500 KB. Config files never reach it. A log dump or a message batch does.

## 10. WasmGC allocation is CHEAP, and that is a load-bearing fact for the decode path

The brief asks for a per-allocation ballpark. Slopes taken over N = 10M → 40M, which cancels
startup entirely; every arm passed the N-vs-2N linearity check.

| loop body, 10,000,000 iterations | slope | per allocation |
| --- | --: | --: |
| i32 sum (allocation-free control) | 0.200 ns/iter | — |
| `struct.new`, 10 scalar fields, non-escaping | 3.33 ns/iter | **3.13 ns** |
| `struct.new`, 10 scalar fields, **escaping** (stored to an array) | 4.37 ns/iter | **4.17 ns** |
| fresh `string` via `slice` | 3.87 ns/iter | **3.67 ns** |

`struct.new` is present in the disassembly, so the allocation is real. **The escaping arm is
the honest one for a decoder**, because decode materializes a value that outlives the frame —
and at `-O3` the distinction shows up exactly as expected: the non-escaping loop is
**scalarized away entirely** by binaryen's Heap2Local (37 → 5 ms, 255 → 97 bytes), while the
escaping loop survives (50 → 29 ms). Emit uniform WasmGC and let Heap2Local do its job; do not
hand-roll SROA in the derive.

**What this means for the decode model.** A 10-field record with 5 string fields costs, in pure
allocation: 1 struct (4.2 ns) + 5 strings (3.7 ns each) = **~22.6 ns**. Against the measured
whole-record decode of 545 ns (JSON) or 875 ns (VLB), **allocation is 3–4% of the bill.**

**So the answer to "what does WasmGC make expensive?" is: not this.** No write barriers are
visible in the numbers (perf-landscape §4.4 measured the same thing from the other side —
`VL_GC=auto/tracing/refcount/none` moved a closure benchmark by 3%), and
`collections/struct-alloc` sits at **0.42x of `rustc -O`** because wasmtime's bump allocator
beats malloc. **§Approach 2 should stop hedging about allocation and hedge about the string
conversions instead** (findings 5, 6) — that is where the decode path's money actually goes.

## 11. OQ-5's "one form per format" is confirmed on performance grounds — index form is ~100x cheaper per union field than value form

No measurement is possible without the derive, so this is a **MODEL built from measured
parts**, and it is labelled as one.

For a union field, per value:
- **Index form** (VLB): write one byte; decode reads one byte and branches. From the C family's
  element-read cost, ~**1 ns**.
- **Value form** (JSON, and a literal union like `"file" | "dir"`): write a length prefix plus
  the literal's bytes; decode must *materialize* the string and compare it against each member.
  Materializing costs **101 ns** today (finding 6's measured per-field bytes→string), or ~9 ns
  if a slice-view primitive existed (finding 6's `slice`), plus the member compares.

→ **~1 ns against ~110 ns today, or ~15 ns after finding 6's fix.** Two orders either way.

That confirms OQ-5's resolution rather than challenging it: **VLB → index form** is right
because its constituency (message passing, both ends the same build) is the throughput one,
and **JSON → value form** is right because its constituency is not. The doc reaches this
conclusion from evolution and test-matrix arguments; it also happens to be the fast answer, and
saying so costs nothing.

**The one thing to add:** §OQ-5 keeps "a reserved mode bit" open as cheap insurance for a
future value-form binary. Priced here, that mode would be the **~100x-slower** path in the
format built for speed. Keep the reserved bit; state in the doc that value-form binary is a
compatibility affordance and never a default.

---

# The run-time summary — operation, today, the plan's path, the risk

| operation | measured TODAY (2026-09-01) | the plan's projected path | the risk |
| --- | --: | --- | --- |
| encode a 10-field scalar record, JSON text | **0.815 µs** | stage 3 `toJson<T>` over the same walk | the derive emits per-field encoders → the nested-template shape, **2.07x**. Emit ONE builder per shape, not one per field. |
| encode the same record, VLB binary | **0.180 µs** | stage 2 `serialize<T>` | none measured. This is the plan working. |
| encode a record holding 3 `f64`, JSON text | **33.6 µs** | stage 3 | float text is 97% of it. Unavoidable in JSON; the doc should say so. |
| the same record, VLB (bits verbatim) | **0.35 µs** | stage 2 | **96x** — the plan's strongest unstated argument. |
| decode a 10-field record, JSON text | **0.545 µs** | stage 1 hand codecs, then stage 3 | the pull-lexer OBJECT shape costs **1.98x** at the default rung, and `vl run` has no `-O`. |
| decode the same record, VLB binary | **0.875 µs** | stage 2 | **SLOWER than JSON today.** 81% is `decodeUtf8At`. Needs finding 6's primitive or the headline claim fails. |
| … VLB with bytes→string removed | **0.165 µs** | — | this is what stage 2 is actually buying: **3.3x**. |
| lexer inner loop, per character | **1.96 ns** (`s[i]`) | stage 1 `JsonLexer` | a `u8[]` rewrite buys **nothing** — same instruction, same storage type. |
| `.bytes()` on a 104 KB string | **4.7 µs per call** | — | it COPIES. Called per token it is a 99-second loop. The emitter comment says "view". |
| `slice` | **9 ns, flat in length** | — | none — it is a view, and text decoding exploits it. |
| `toString(f64)`, ordinary magnitude | **2.59 µs** | stage 0, done | ~50% of a float-bearing JSON encode. |
| `toString(f64)`, extreme exponent | **22.6 µs** | stage 0, done | 8.7x the ordinary case. Snapshot of arbitrary f64 state hits this; config does not. |
| `toString(i32)` | **0.137 µs** | stage 0, done | **~50% of a float-free JSON encode.** perf-landscape §4.8 wants a re-run; this is why. |
| `parseF64` fast / exact | **0.19 / 5.66 µs** | stage 0, done | a document of round-tripped 17-digit VL floats forces the exact path, 30x the fast one. |
| escaping `struct.new`, 10 fields | **4.17 ns** | stage 2 decode | none. Allocation is 3–4% of a decode. |
| fresh string allocation | **3.67 ns** | stage 2 decode | none. |
| **cycle seen-set, per ref node** | **1.57 ns × N/2** — O(n²) | §Cycles "one hash-set insert" | **THE BIG ONE.** No hash set exists. 204 ms at 16,000 nodes, 70x the encode it protects. |
| the static acyclic-shape skip | **does not exist** | §Cycles "pays nothing" | no reusable analogue in the compiler; `repTyScalarMask` is the template. |
| document assembly by `+=` | **O(n²)** — 2,233 ms at 2.15 MB | stage 1 writer | the fix (`join`) already ships; it needs a rule in the header, not an API. |
| per-shape derive codegen | **0.25 ms, ~135 B per generated fn** | stage 2 emitter | linear, cheap, no cliff. Not a risk. |

## The single biggest run-time risk, and the cheapest instrument to watch it

**The risk: `serialize<T>` over any ref-bearing shape is quadratic in the ref-node count,
because the cycle seen-set has no hash set to be, and the static skip that was supposed to make
it moot is not built and has no analogue to copy.** It is unpriced in the design doc, it is
invisible on a small fixture (5 ms at 1,000 nodes reads as "fine"), and it degrades smoothly
rather than failing — the worst combination. Findings 1 and 2 are the same risk seen from the
run-time and the compiler side.

**The cheapest instrument: a capability probe that is a TIMING assertion, one file, ~10 lines.**
`scripts/capability-probes/run.py` already grades one program per gap as
`RUNS` / `check refuses` / `emit refuses` / `SILENT`. Add one probe that walks a ref-bearing
shape at two sizes — N and 4N — and **fails unless the ratio is under 6x**. A linear walk reads
~4x and passes; a quadratic one reads ~16x and fails, loudly, on the day the seen-set lands.
It costs under a second, it needs no new harness, and it is the only instrument in the tree
that can tell a linear walk from a quadratic one before a user does.

Second-cheapest, for finding 6: the same runner, one probe asserting that a VLB-shaped decode
of a string-bearing record is **faster** than the JSON decode of the same record. That is the
plan's own headline claim for use case (b), and today it is **false by 1.6x**.

---

# What is already fast enough — DO NOT OPTIMIZE

House rule, and the point of the section: an unmeasured optimisation is a cost with no
counterparty. Each of these was measured *in order to* propose something, and the measurement
said not to.

- **Template-literal string building, per record. 0.815 µs for a 134-char 10-field JSON
  object.** No `StringBuilder`, no rope, no `u8[]` writer. The `fromCodePoints`-once idiom
  §Approach 1 recommends is **2x SLOWER**, and the plain `+` chain is **within 1%** of the
  template. A config file of 1,000 records encodes in 0.8 ms. **Do not build a string builder
  for stage 1.** (What *is* needed is the `join`-not-`+=` rule at document level — finding 9 —
  and that is one sentence in a header, not code.)
- **WasmGC allocation.** 4.17 ns for an escaping 10-field struct, 3.67 ns for a fresh string —
  3–4% of a whole-record decode. Do not pool, do not free-list, do not hand-roll scalar
  replacement: binaryen's Heap2Local already deletes non-escaping allocations outright
  (measured: 37 → 5 ms, and the module shrinks 255 → 97 bytes). Emit uniform WasmGC.
- **`u8[]` vs `string` for the lexer.** Same storage type, same `array.get_u`, **5% apart and
  inside the noise floor**. There is no rewrite here worth the fixtures it would need.
- **`slice`.** 9 ns and flat from 1 KB to 64 KB. It is already a view. Nothing to do.
- **`parseF64` on the fast path.** 0.19 µs. A config file of 1,000 short numbers parses in
  0.19 ms. Ryū-class work on the *parse* side has no customer. (The *render* side at extreme
  exponents is 22.6 µs and would benefit — but only for a population JSON does not carry, so it
  still has no customer. `std/fmt.vl`'s own header already says Ryū drops in behind the same
  signature if one appears; nothing here names one.)
- **Per-shape codegen cost.** 0.25 ms and ~135 bytes per generated function. A 100-shape
  program pays 0.1 s of build and 54 KB. There is no memoization or sharing scheme worth
  designing here, and the derive should NOT be made lazier or more clever to avoid a cost this
  size. (The real module-size lever is whole-program DCE, which `std/fmt.vl`'s header already
  names and which is not serde's to fix.)
- **The `-O3` rung, as a plan input.** It moved every probe here by 1.1–1.3x except the two
  cases already named (Heap2Local on non-escaping allocation, inlining the lexer object), and
  it raised **zero** `O3-NOOP` flags. It is not where any of these findings live, and no
  recommendation above is contingent on it. The one place it matters is finding 5(c), and the
  fix there is to write the loop differently rather than to wait for the optimiser.

---

# Instrument notes, and corrections owed to other documents

Recorded because each cost time here and will cost the next person the same.

1. **The shared cached seed at `/home/verit/vl/build/vl-compiler.wasm` was STALE** — it refused
   `\{…}` interpolation in a plain string, which landed at `1d62689f`, two commits before
   `HEAD`. A probe run against it would have measured a compiler that no longer exists, and
   silently: the refusal was a parse error in *my* file, which reads as a typo. `compiler/`
   and `std/` were byte-identical to the main checkout, so `diff -rq` gave a false all-clear.
   **`scripts/refresh-compiler.sh` in the worktree** (~40 s) is the fix, and it should be the
   first command of any measurement session, not a step you reach for after something looks odd.

2. **`for i in 0 to n` is INCLUSIVE of `n`.** Every loop here originally ran N+1 times, and one
   probe read `s[s.length]` and trapped `out of bounds array access` — which looked exactly
   like a compiler defect for about ten minutes. It is not one; it is the range's semantics.
   Worth a line in whatever the loop documentation is.

3. **`docs/internals/perf-landscape.md` is stale on the string representation, and it is the
   load-bearing fact of three of its own sections.** §4.1 states *"VL strings are
   `(array (mut i32))`, UTF-32, one WasmGC element per code point — 4 bytes of traffic per ASCII
   char"*. Measured today: `string`'s backing is `(array (mut i8))`, **packed UTF-8**
   (`compiler/emit_sections.vl:5100`, "Stage 2c"), `.length` is bytes, and `s[i]` is a byte.
   So P12 ("UTF-8 bytes in linear memory for `string`") has had its UTF-8 half land while its
   linear-memory half has not, and §4.1's 4-bytes-per-char arithmetic no longer describes the
   compiler. **Additionally, P7b's premise has moved**: the string header now carries a mutable
   hash field (`compiler/emit_sections.vl:5134`, *"field 3 hash"*, with the prologue returning
   the cached value at `:2143`), so "VL recomputes a string's hash on every map/set probe" is no
   longer true. That document's §4.6, §5 P7b and §7 all reason from the old rep. **Re-run before
   quoting any of them** — which is that document's own standing instruction, now pointed at
   itself.

4. **`std/fmt.vl`'s `~25 µs a rendering` needs its population named** (finding 4). It is the
   uniformly-random-bit-pattern figure; ordinary-magnitude doubles render in **2.59 µs**. Both
   are right; only one is about a JSON document. Suggested edit: keep the number, add the
   population and the ordinary-case figure beside it.

5. **`docs/serde-design.md` §Approach 1's `fromCodePoints`-once recommendation should be
   retired outright**, not softened. It is measured **2x slower** than both the template and
   the plain `+` chain at record scale, and the document's current wording ("now an
   optimisation rather than a necessity") still reads as an endorsement.

---

# Appendix — the probes

All were run as:

```sh
VL_STD=$PWD/std scripts/vl-host/target/release/vl build p.vl -o p.wasm \
  --compiler build/vl-compiler.wasm
VL_STD=$PWD/std taskset -c 2-5 scripts/vl-host/target/release/vl run p.wasm
# the -O3 rung, with wasm-opt off PATH (CLAUDE.md):
VL_WASM_OPT=./node_modules/.bin/wasm-opt VL_STD=$PWD/std \
  scripts/vl-host/target/release/vl build p.vl -O3 -o p.O3.wasm --compiler build/vl-compiler.wasm
cmp p.wasm p.O3.wasm && echo "O3-NOOP — the -O3 column is a re-run of the unoptimised module"
```

**The record every encode/decode probe uses**, and the shared control:

```vl
type Rec = {
  id: i32, name: string, kind: string, tag: string, note: string,
  a: string, b: string, c: string, count: i32, level: i32
}
const r: Rec = {
  id: 0, name: "widget", kind: "circle", tag: "alpha", note: "a short note",
  a: "aaa", b: "bbbb", c: "ccccc", count: 17, level: 3
}
let total = 0
for i in 0 to 199999 {          // NOTE: `to` is INCLUSIVE — this is 200,000 laps
  r.id = i                      // varies the value so nothing is loop-invariant
  total = total + r.name.length // A0, the control: loop + struct write + sink, no encoding
}
print(total)                    // 16 ms. Every A-family arm replaces the middle line.
```

All five encoders were asserted to print the identical total (`26888890`) before any ratio was
taken.

**A1 — one big template** (0.815 µs/record). The middle line becomes:

```vl
function enc(r: Rec): string {
  "{\"a\":\"\{r.a}\",\"b\":\"\{r.b}\",\"c\":\"\{r.c}\",\"count\":\{toString(r.count)},\"id\":\{toString(r.id)},\"kind\":\"\{r.kind}\",\"level\":\{toString(r.level)},\"name\":\"\{r.name}\",\"note\":\"\{r.note}\",\"tag\":\"\{r.tag}\"}"
}
const s = enc(r) ; total = total + s.length
```

**A2 — nested per-field templates** (1.685 µs, 2.07x): ten `fs(k,v)` / `fi(k,v)` calls building
one string each, then one joining template. **A3 — the `+` accumulator** (0.805 µs): 21
`out = out + piece` appends. **A4 — the `fromCodePoints`-once builder** (1.615 µs): every code
point pushed into one `i32[]`, then `fromCodePoints(buf)` once.

**V1 — the VLB-shaped encode** (0.180 µs/record, 81 bytes):

```vl
function wI32(buf: u8[], v: i32) {
  buf.push(v & 255) ; buf.push((v >> 8) & 255)
  buf.push((v >> 16) & 255) ; buf.push((v >> 24) & 255)
}
function wStr(buf: u8[], s: string) {
  wI32(buf, s.length)
  for i in 0 to s.length - 1 { buf.push(s[i]) }
}
function enc(r: Rec): u8[] {           // fields in SORTED NAME order, per fact 3
  const buf: u8[] = []
  wStr(buf, r.a) ; wStr(buf, r.b) ; wStr(buf, r.c)
  wI32(buf, r.count) ; wI32(buf, r.id) ; wStr(buf, r.kind)
  wI32(buf, r.level) ; wStr(buf, r.name) ; wStr(buf, r.note) ; wStr(buf, r.tag)
  buf
}
```

**G1 / G2 — the float tax in situ.** The same record with `x, y, z: f64` set to
`0.30000000000000004`, `-2.718281828459045`, `1.7976931348623157e308`, 20,000 laps, `r.x`
advanced each lap. G1 renders them through `toString`; G2 writes `f64bits(v)` as 8 LE bytes.
**675 ms vs 10 ms.**

**E1 — the JSON decode** (0.545 µs/record): §Approach 1's pull-lexer shape —
`type Lex = { src: string, pos: i32 }`, `skipTo(lx, ch)`, `strVal` taking `lx.src.slice(s, lx.pos)`,
`numVal` slicing then `parseF64`. Optimistic path only (no key checking, no reordering, no
unknown keys), so it is a **lower bound** on a real decoder.

**V2 — the VLB decode** (0.875 µs/record) and **V2b — its ablation** (0.165 µs). V2's natural
cursor is refused, which is finding 7:

```vl
type Cur = { b: u8[], p: i32 }   // vl check rc 0, then
// emit error: emitProgram: struct field type `u8[]` has no struct-field rep
```

so the position rides in a one-element `i32[]` instead. V2b replaces
`const s = decodeUtf8At(b, c[0], n)` with `const s = "widget"` (a 6-char constant, chosen so
the printed total is unchanged) — that one line is **81% of the decode**.

**The scope grid for finding 7**, one program, all five run and print:

```vl
type A = { xs: i32[] }    type B = { xs: string[] }   type C = { xs: f64[] }
type D = { xs: i64[] }    type E = { xs: boolean[] }
// all five declare, build and read.  Only `u8[]` is refused.
```

**C family — the lexer inner loop.** Source is 1,800 copies of a 58-char JSON object joined
with `,` = 104,399 bytes; 200 passes = 20,879,800 positions. C0 is the control
(`const ch = i & 127`); C1 reads `src[i]`; C2 reads a hand-built `u8[]`; C4 reads
`src.bytes()` hoisted per pass; C3 goes through `at(lx)` / `bump(lx)` / `more(lx)`. C5 called
`.bytes()` per character and took **99,010 ms**, which is how the copy was found.

**The string-semantics probe** behind finding 5:

```vl
const s = "aé€"     // 1 + 2 + 3 = 6 UTF-8 bytes, 3 code points
print(s.length)     // 6      — BYTES
print(s[0])         // 97     — a BYTE
print(s[1])         // 195    — the first byte of é, not a code point
print(s.bytes()[1]) // 195    — the same byte
```

**`slice` vs `.bytes()`.** 1,000,000 `s.slice(0, s.length - 1)` at source lengths 1/4/16/64 KB:
**13 / 11 / 11 / 12 ms** — flat, a view. 20,000 `s.bytes()` at the same lengths:
**10 / 12 / 16 / 62 ms** — length-proportional at ~24 GB/s, a copy.

**B family — allocation.** Slopes over N = 10M → 40M, each arm passing the N-vs-2N linearity
check (b0 4/6/10 ms, b1 36/69/136, b2 49/93/180, b3 45/85/161). `struct.new` confirmed present
via `wasm-dis`.

**F family — float text.** 100,000 laps each, controls with the loop body removed. The
uniformly-random arm draws from an LCG and clears the all-ones exponent so no NaN/Inf appears;
the ordinary arm walks `0.30000000000000004` upward by `1e-15`; the extreme arms sit at
`1.7976931348623157e308` and `2.2250738585072012e-308`.

**S1 — the seen-set** (finding 1), whose `id` compare stands in for `ref.eq`:

```vl
type Node = { id: i32, v: i32, next: Node | null }
const seen: Node[] = []
for i in 0 to N - 1 {
  const n = nodes[i]
  let j = 0 ; let found = false
  while j < seen.length {
    if seen[j].id == n.id { found = true ; j = seen.length } else { j = j + 1 }
  }
  if found { hits = hits + 1 } else { seen.push(n) }
}
```

and the refusal that forces it:

```vl
const seen: { [Node]: boolean } = Set()
// type error: A Node-keyed Set isn't supported yet —
//             `Map`/`Set` keys must be `string` or `i32`
```

**The compile-time arms** (finding 8) are generated by four Python scripts differing in one
line each — K shapes with a whole-struct `==`, with a field-wise `==`, with two literals and no
compare, and with one literal — plus a fifth arm holding the shape count at **one** while
varying the `==` count, which is what separates the axes. The generators are ~20 lines apiece;
the shape is:

```vl
type S<i> = { a<i>: i32, b<i>: string, c<i>: f64, d<i>: boolean, e<i>: i32 }
const p<i>: S<i> = { … } ; const q<i>: S<i> = { … }
if p<i> == q<i> { hits = hits + 1 }        // the arm under test
```

**Not measured, and marked as such in the text:** the union index-vs-value cost (finding 11) is
a model assembled from measured parts, because neither form exists to run. Everything else in
this document was executed on the 2026-09-01 seed.
