# String representation — Step 0 measurements, and the Step 2 migration map

> **What this is.** `docs/guide/strings-design.md` §Migration lists **Step 0 —
> measure the header cost** as the gate on the whole representation change, and
> **Step 2** as the storage+header swap itself. This document is Step 0's answer,
> plus a pre-scoping map of Step 2's blast radius. It changes no compiler
> behaviour; it is measurement and inventory only.
>
> **Tree state these numbers were taken at.** `adbd956d` ("docs(vl): strings
> reverses its own API ruling …"), seed `build/vl-compiler.wasm` refreshed from
> that source by `scripts/refresh-compiler.sh`, host `scripts/vl-host` rebuilt
> from the same tree (`cargo build --release`). Every count below is re-derivable
> at that commit. A count from an unverified tree is a count of the past.

**Environment.** 12th Gen Intel Core i9-12900KF, 24 threads, 32 GB RAM,
Linux 6.18 (WSL2), wasmtime **47.0.2** (pinned in `scripts/vl-host/Cargo.lock`),
`vl` release build.

---

## Summary of findings

1. **The crossover is 8–16 bytes**, and it depends on the collector. For a string
   that does **not** share a backing, `{header, array i8}` first stops losing to
   today's bare `(array i32)` at **8 bytes** (null and copying collectors) or
   **12 bytes** (DRC), and first strictly wins at **10 / 12 / 16** bytes
   respectively. Below that it loses by **+8 to +40 bytes per string**.

2. **The compiler's own strings are far below that crossover.** Measured by
   running the compiler's own `tokenize()` over all 27 `compiler/*.vl` — the lex
   half of a self-compile, exact, not a static approximation: **59.1 %** of the strings the lexer
   allocates are **1 byte long**; **74.8 %** are ≤ 4; **86.9 %** are ≤ 8. Mean
   8.44 B. Identifiers alone (n = 201 592) mean **5.28 B**, median 5, with 85 %
   at ≤ 8 bytes. The task's hypothesis — "the compiler's workload is exactly the
   strings that would get bigger" — **is correct**, and on the no-sharing
   accounting the identifier population costs **+26.3 % (null) / +38.3 %
   (copying) / +49.3 % (DRC)** more memory under the proposed rep.

3. **Sharing does not merely mitigate this — it is the entire verdict.**
   **100 %** of the 613 238 strings the lexer allocates are `gSrc.slice(a, b)`
   of one source string (`compiler/lexer.vl:472`, `mkTok`). Under a view rep the
   amortized object count per string is **1.00004**, not 2 (27 backings serving
   613 238 headers). With views the same identifier population goes from
   +26.3 % to **−32.1 %**.

4. **Net verdict for VL's own workload: a WIN, and a large one — 20.57 MB vs
   51.89 MB (39.6 % of today) under the collector the compiler actually runs.**
   But the win is **not** where the design doc says it is (see 5 and 6).

5. **The single biggest memory win is UTF-8 storage, not the header.** Today's
   `gSrc` arrays alone are **23.21 MB** of the 51.89 MB; UTF-8 makes them
   **5.85 MB**. That 17.4 MB is banked by the storage change and is completely
   independent of whether `string` gains a header.

6. **The header does not pay for itself in memory. It pays for itself in copies.**
   On this length distribution the fallback design — a bare `array i8` with
   copying slices, the option §Migration Step 0 says the measurement would decide
   — costs **20.30 MB** against the header+view design's **20.57 MB** under the
   null collector, and **30.12 MB** against **30.38 MB** under DRC. They are a
   **statistical tie on memory**. The header+view design wins on memory only
   under the copying collector (25.47 vs 29.18 MB, −13 %). Its real, large win is
   that `slice` stops copying — which is a *time* and *allocation-rate* argument,
   not the *memory* argument §Header currently makes.

7. **The verdict is robust but not unassailable.** It would take **1.24 M–3.37 M**
   additional constructed (own-backing) identifier-shaped strings — 2.0× to 5.5×
   the entire measured lexer population — to erase the saving. The
   runtime-constructed string population (concatenation results, mangled names,
   built map keys) was **not** measured; see §1.8 for why, and for the bound.

8. **Step 2's mechanical surface is much smaller than advertised, and much more
   concentrated.** The prior "359 `aTypeIdx` sites, 69 string-aware" does not
   survive re-derivation: 14 of the 359 lines are a *different identifier*
   (`raTypeIdx`), 178 of the remaining 346 are comments, and of the **168 real
   code sites** only **8** are shared between `string` and `i32[]` and must
   split. They cluster into four mechanisms: the string-op scratch frame (4), the
   `'a'` helper-signature descriptor char (1), `fromCodePoints` (2), and the
   chunked-literal slot kind (1). The 69 reproduces exactly under a stated
   definition but is a bad proxy in both directions — only 4 of the 69 are code.

9. **The wider gate is `aUsed`, not `aTypeIdx`** — 141 lines across 6 files —
   and its generic-application arm, `forceGenAppArgTypes`
   (`compiler/emit_collect.vl:3788`), **already has a verified missing arm for
   `u8[]`**, the newest packed rep. That is the single most likely place for the
   new string type to be forgotten.

10. **A pre-existing defect was found by mapping the ladders, and reproduced.**
    The lexer implements string line continuation (`\` before a newline drops
    both, `compiler/lexer.vl:650`); the emitter's `decodeStr`
    (`compiler/emit_base.vl:733`) has **no such arm** and emits a literal
    newline. `"ab\<newline>cd"` lexes to length 4 and emits at length 5, `vl
    check` is clean, and no fixture covers it. Step 2 forces exactly these two
    ladders further apart. (§2.7 L3.)

11. **`docs/guide/strings-design.md`'s "blast radius is zero" does not hold.**
    Re-derived by running the compiler's own tokenizer over every `.vl` file:
    the corpus has **11** non-ASCII string/char literals in 5 files, not 0, and
    **two fixtures observe code-point `.length` on non-ASCII strings** and will
    change output. Its compiler count is 105, not 97, and its "39K lines" matches
    no denominator at HEAD (73 879 non-blank non-comment; the figure is ~2 months
    stale). (§2.0.)

---

## Part 1 — Step 0: the two-object break-even

### 1.1 The two representations being priced

| | today | proposed (§Header) |
|---|---|---|
| a VL `string` | a **bare** WasmGC `(array mut i32)` of code points — no wrapper | `(struct $backing:(ref (array i8)) $start:i32 $len:i32 $hash:i32)` over a shared `(array i8)` of UTF-8 |
| objects per string | 1 | 2 — **or 1 amortized**, when the backing is shared |

**A `i32[]` is not a valid proxy for a string.** A VL `i32[]`/`u8[]` is a
`{backing, len, cap}` struct *plus* its backing array; a `string` is the bare
array with no wrapper. Every probe below prices the bare array separately from
the struct so this cannot contaminate the answer.

### 1.2 The GC object layouts — source, then measurement

Both methods were used and they agree.

**Method A — read from wasmtime's source** (vendored in the cargo registry at
`wasmtime-environ-47.0.2/src/gc.rs` and `src/gc/{null,copying,drc}.rs`; the
allocator side in `wasmtime-47.0.2/src/runtime/vm/gc/enabled/*.rs`):

| | header | align | array `base_size` | struct `{ref,i32,i32,i32}` | alloc rounding |
|---|---|---|---|---|---|
| `null` (`VL_GC=none`) | 8 | 8 | 8 + 4 (length field) = 12 | 8 + 16 = 24 | bump ptr aligned to 8 |
| `copying` (`VL_GC=auto`/`tracing`) | **16** | **16** | 16 + 4 = 20, `MIN_OBJECT_SIZE` 20 | 16 + 16 = 32 | `checked_next_multiple_of(16)` |
| `drc` (`VL_GC=refcount`) | 24 | 8 | 24 + 4 = 28 | 24 + 16 = 40 | bump / free-list, aligned to 8 |

so, with `a8`/`c16` meaning round up to 8/16:

```
                 array i32 of L        array i8 of L        struct{ref,i32,i32,i32}
  null           a8(12 + 4L)           a8(12 + L)           24
  copying       c16(20 + 4L)          c16(20 + L)           32
  drc            a8(28 + 4L)           a8(28 + L)           40
```

**Note the `$hash` field is free.** `{ref,i32,i32}` and `{ref,i32,i32,i32}` are
the *same size* under all three collectors — the fourth field lands in padding
the third already forced. Confirmed both from `common_struct_or_exn_layout`'s
final `align_up` and by measurement (§1.3 table B). The cached hash costs
nothing.

### 1.3 Method B — empirical, by peak RSS

Every probe is a generated VL program, **prebuilt to `.wasm`** so no compile time
or compiler allocation enters the measured process, then run under
`/usr/bin/time -v` with peak RSS read from `Maximum resident set size`. **N is
held at 2 000 000 across every length.** Because `VL_GC=none` never collects,
RSS delta over a matched no-allocation baseline is *exactly* total bytes
allocated — this is the precise instrument, and it is the collector the compiler
itself runs under.

```
# generate, build, run, read peak RSS  (the harness, verbatim)
python3 gen.py "$mode" "$n" "$l" "$f.vl"
vl build "$f.vl" -o "$f.wasm"
VL_GC=$gc /usr/bin/time -v vl run "$f.wasm" 2> "$f.time"
grep 'Maximum resident set size' "$f.time"
```

The measured loop body per mode (`nop` is the baseline; every mode does the same
`i % 8` arithmetic and the same accumulate so only the allocation differs):

```vl
// nop     : acc = acc + base.length + k
// str     : const s = base.slice(k, k + L);      acc = acc + s.length + k
// obj4    : const h = { backing: base, start: k, len: L, hash: 0 }
//                                                acc = acc + h.len + h.start
// obj3    : const h = { backing: base, start: k, len: L }
// u8      : const a: u8[] = []; while j < L { a.push(1); j = j + 1 }
// i32arr  : const a: i32[] = []; while j < L { a.push(1); j = j + 1 }
```

**Table A — the bare `(array i32)`, i.e. a VL string. `VL_GC=none`, N = 2 000 000.**

| L | `nop` kB | `str` kB | Δ kB | **B/string measured** | model `a8(12+4L)` | error |
|---|---|---|---|---|---|---|
| 1 | 15 740 | 47 404 | 31 664 | 16.21 | 16 | +1.32 % |
| 2 | 16 208 | 62 616 | 46 408 | 23.76 | 24 | −1.00 % |
| 4 | 16 220 | 78 864 | 62 644 | 32.07 | 32 | +0.23 % |
| 8 | 15 352 | 110 124 | 94 772 | 48.52 | 48 | +1.09 % |
| 16 | 15 900 | 172 508 | 156 608 | 80.18 | 80 | +0.23 % |
| 32 | 16 448 | 297 232 | 280 784 | 143.76 | 144 | −0.17 % |
| 64 | 15 568 | 546 964 | 531 396 | 272.07 | 272 | +0.03 % |
| 256 | 15 712 | 2 047 304 | 2 031 592 | 1040.18 | 1040 | +0.02 % |

Eight of eight points land on the source-derived layout. This also **proves
`slice` copies today**: the delta is exactly one freshly allocated `L`-element
array per call.

**Table B — the header struct alone** (the backing is shared, so the delta *is*
the struct):

| shape | L | measured | model | error |
|---|---|---|---|---|
| `{ref,i32,i32}` | 1 / 8 / 64 | 23.98 / 24.62 / 24.12 | 24 | −0.07 / +2.58 / +0.50 % |
| `{ref,i32,i32,i32}` | 1 / 8 / 64 | 24.00 / 24.15 / 24.23 | 24 | +0.02 / +0.64 / +0.97 % |

**Table C — `array i8`, recovered from `u8[]`.** A `u8[]` built by `L` pushes is
`struct3 + array-i8(0) + Σ_{c ∈ 4,8,…,L} array-i8(c)` (initial `cap = 0`, then
`cap == 0 ? 4 : cap * 2`, `compiler/emit_state.vl:802`) and under `VL_GC=none`
every intermediate is retained, so the whole chain is measured:

| L | measured B | model B | error |
|---|---|---|---|
| 4 | 55.86 | 56 | −0.26 % |
| 8 | 80.44 | 80 | +0.55 % |
| 16 | 112.13 | 112 | +0.11 % |
| 32 | 159.96 | 160 | −0.03 % |
| 64 | 240.14 | 240 | +0.06 % |

Five of five, which pins `array-i8(L) = a8(12 + L)` — element size 1, same
`base_size` as the i32 array. **Table D**, the same probe over `i32[]`
(72 / 120 / 200 measured vs 72 / 120 / 200 modelled at L = 4/8/16), closes the
loop on the wrapper struct.

**Table E — the other two collectors.** Here the probe retains everything in a
keep-alive array, and the baseline pushes the *same shared string* N times so the
keep-array growth cancels exactly:

| `VL_GC` | L | base kB | str kB | B/string measured | layout model | ratio |
|---|---|---|---|---|---|---|
| `none` | 1 / 8 / 64 | 32 496 / 32 116 / 32 480 | 63 044 / 126 212 / 563 476 | 15.64 / 48.18 / 271.87 | 16 / 48 / 272 | **0.98 / 1.00 / 1.00** |
| `tracing` | 1 / 8 / 64 | 32 356 / 32 936 / 32 444 | 147 784 / 278 548 / 1 064 824 | 59.10 / 125.75 / 528.58 | 32 / 64 / 288 | **1.85 / 1.96 / 1.84** |
| `refcount` | 1 / 8 / 64 | 33 164 / 32 872 / 33 292 | 91 684 / 153 548 / 590 836 | 29.96 / 61.79 / 285.46 | 32 / 64 / 288 | **0.94 / 0.97 / 0.99** |

`none` and `refcount` land on their layout models directly. `tracing` lands at
**1.84–1.96×**, which is the copying collector's two semispaces — peak RSS
touches both halves of the heap. Critically, the *ratios between lengths* reject
the other collectors' models: at L = 1 vs L = 8, `tracing` measures 2.13× where
its own model says 2.0 and the null model would say 3.0. All three headers are
confirmed.

**What is measured vs derived, stated plainly:** the null-collector numbers are
*measured to the byte*; the DRC numbers are *measured to within 1–6 %*; the
copying-collector numbers are *source-derived from the same layout functions,
with the derivation validated empirically under all three collectors* — its peak
RSS carries a semispace factor that makes byte-exact extraction from RSS
impossible without a host change, which was out of scope.

### 1.4 The crossover — one string, **not** sharing a backing

`today(L) = arr_i32(L)` against `proposed(L) = struct + arr_i8(L)`. For ASCII,
byte length equals code-point length, so both sides take the same L.

| L | null | copying | drc |
|---|---|---|---|
| 1 | 16 → 40 (**+24**) | 32 → 64 (**+32**) | 32 → 72 (**+40**) |
| 2 | 24 → 40 (+16) | 32 → 64 (+32) | 40 → 72 (+32) |
| 4 | 32 → 40 (+8) | 48 → 64 (+16) | 48 → 72 (+24) |
| 6 | 40 → 48 (+8) | 48 → 64 (+16) | 56 → 80 (+24) |
| **8** | 48 → 48 (**0**) | 64 → 64 (**0**) | 64 → 80 (+16) |
| 10 | 56 → 48 (−8) | 64 → 64 (0) | 72 → 80 (+8) |
| **12** | 64 → 48 (−16) | 80 → 64 (**−16**) | 80 → 80 (**0**) |
| **16** | 80 → 56 (−24) | 96 → 80 (−16) | 96 → 88 (**−8**) |
| 32 | 144 → 72 (−72) | 160 → 96 (−64) | 160 → 104 (−56) |
| 64 | 272 → 104 (−168) | 288 → 128 (−160) | 288 → 136 (−152) |
| 256 | 1040 → 296 (−744) | 1056 → 320 (−736) | 1056 → 328 (−728) |

| collector | first length with **no loss** | first **strict win** |
|---|---|---|
| `null` — what the compiler runs under | **8 B** | **10 B** |
| `copying` — what `vl run` defaults to | **8 B** | **12 B** |
| `drc` | **12 B** | **16 B** |

The quantization is not monotone (L = 4 loses 8 B under `null` but L = 5 loses
16 B) because the two sides round to different granularities; the table above is
the ground truth, not a formula fit.

### 1.5 The mitigating factor — how much backing sharing actually happens

`compiler/lexer.vl:472`, inside `mkTok`, is `text: gSrc.slice(start, gPos)`, and
the comment-trivia path at `compiler/lexer.vl:743` is the same shape. **Every
string the lexer produces is a slice of one source string.** Under a view rep
those 613 238 strings would share **27 backings** — one per file:

> **amortized objects per string across a realistic parse = 1.000044**, not 2.

This is the design doc's own escape clause, and the measurement says it is not a
hedge — it is load-bearing, and it decides the whole question (§1.7).

**The histogram undercounts, in the conservative direction.** The identifier path
slices the source *twice* — once at `compiler/lexer.vl:756` to feed
`keywordKind(text)`, then again inside `mkTok` at `:472` — so a self-compile
actually allocates ~201 592 more short slices than the 613 238 counted here, and
the quoted-literal scanner adds three more `gSrc.slice` sites
(`compiler/lexer.vl:568`, `:671`, `:679`), each of them a *concatenation* of
slices. Every one of those extras is a slice of `gSrc`, so counting them would
move the verdict further toward the view rep, not away from it. They are excluded
because the histogram measures `tokenize()`'s *output*, which is the population
with a clean denominator.

### 1.6 The real length distribution — measured, not assumed

A **runtime** histogram, taken by importing the compiler's own lexer from a VL
program and tokenizing all 27 `compiler/*.vl` files. No compiler modification and
no static approximation: this is the actual `tokenize()` output.

```vl
import { tokenize } from "./compiler/lexer"
import { readTextFile } from "./std/fs"
// for each of the 27 compiler/*.vl: tokenize(readTextFile(f)) and bucket
//   tokens[i].text.length by tokens[i].kind, plus comments[c].text.length
```

**Denominators.** 27 files; **5 849 731 bytes** on disk; **5 802 668 code
points** (the 47 063-byte gap is the compiler's non-ASCII comment glyphs — UTF-8
is 0.81 % larger than the code-point count here, not 4× smaller, because that is
the *source*, not the storage); **613 238** strings allocated by the lexer;
**5 175 507** bytes of text in them.

| class | n | share | mean B | median |
|---|---|---|---|---|
| punctuation / operators | 207 857 | 33.9 % | 1.06 | 1 |
| **identifiers + keywords** | **201 592** | **32.9 %** | **5.28** | **5** |
| NEWLINE / EOF | 124 950 | 20.4 % | 1.00 | 1 |
| comment trivia | 50 368 | 8.2 % | 72.59 | 81 |
| numbers | 19 617 | 3.2 % | 1.14 | 1 |
| string literals (lexeme) | 8 151 | 1.3 % | 10.41 | 5 |
| char literals (lexeme) | 703 | 0.1 % | 3.09 | 3 |
| **all of the above** | **613 238** | 100 % | **8.44** | **1** |

Cumulative, over all 613 238:

| ≤ length | 1 | 2 | 4 | 6 | **8** | 12 | **16** | 32 |
|---|---|---|---|---|---|---|---|---|
| share | **59.1 %** | 67.9 % | **74.8 %** | 83.6 % | **86.9 %** | 89.7 % | **91.3 %** | 92.5 % |

Identifiers alone (n = 201 592) — the "short interned identifiers" the design
doc names as the weak case:

| ≤ length | 2 | 4 | 5 | 6 | **8** | 12 | 16 |
|---|---|---|---|---|---|---|---|
| share | 29.9 % | 49.9 % | 61.7 % | 75.7 % | **85.0 %** | 93.0 % | 97.4 % |

**So the hypothesis under test is confirmed on its own terms:** 85 % of the
compiler's identifiers are at or below the 8-byte no-loss point, and 50 % are at
or below 4 bytes, where the loss is +8 to +24 B per string.

### 1.7 The verdict for VL's own workload

Per-string, **with no sharing**, priced over the *measured* distribution:

| class | n | mean B | null t → p | copying t → p | drc t → p |
|---|---|---|---|---|---|
| identifiers/keywords | 201 592 | 5.28 | 35.3 → 44.6 (**+26.3 %**) | 47.1 → 65.1 (**+38.3 %**) | 51.3 → 76.6 (**+49.3 %**) |
| punctuation | 207 857 | 1.06 | 16.5 → 40.0 (+143 %) | 32.0 → 64.0 (+100 %) | 32.5 → 72.0 (+122 %) |
| NEWLINE/EOF | 124 950 | 1.00 | 16.0 → 40.0 (+150 %) | 32.0 → 64.0 (+100 %) | 32.0 → 72.0 (+125 %) |
| numbers | 19 617 | 1.14 | 16.8 → 40.0 (+138 %) | 32.2 → 64.0 (+99 %) | 32.8 → 72.0 (+120 %) |
| string lexemes | 8 151 | 10.41 | 55.7 → 49.8 (−10.7 %) | 67.5 → 69.7 (+3.4 %) | 71.7 → 81.8 (+14.0 %) |
| comment trivia | 50 368 | 72.59 | 304.5 → 112.1 (−63.2 %) | 316.3 → 132.2 (−58.2 %) | 320.5 → 144.1 (−55.0 %) |

**Whole-parse accounting**, source backing included, all 613 238 strings:

| | null (**the compiler's own collector**) | copying (`vl run` default) | drc |
|---|---|---|---|
| **today** — `array i32` source + `array i32` per string | 23.21 + 28.68 = **51.89 MB** | 23.21 + 37.28 = **60.49 MB** | 23.21 + 38.49 = **61.70 MB** |
| **proposed** — UTF-8 backing + header **views** | 5.85 + 14.72 = **20.57 MB** (**39.6 %**) | 5.85 + 19.62 = **25.47 MB** (42.1 %) | 5.85 + 24.53 = **30.38 MB** (49.2 %) |
| header + **copying** slices (no view) | 5.85 + 29.17 = 35.02 MB (67.5 %) | 5.85 + 42.96 = 48.81 MB (80.7 %) | 5.85 + 48.80 = 54.65 MB (88.6 %) |
| **fallback**: bare `array i8`, copying slices, **no header** | 5.85 + 14.46 = **20.30 MB** (39.1 %) | 5.85 + 23.33 = **29.18 MB** (48.2 %) | 5.85 + 24.27 = **30.12 MB** (48.8 %) |

**Read that table carefully, because it says three different things.**

1. **Net win, and a big one.** For VL's own workload the proposed rep is
   **39.6 % of today's bytes** under the collector the compiler actually runs.
   The answer to Step 0's question is *ship it*, not *don't*.

2. **But most of the win is UTF-8, not the header.** Row 1's 23.21 MB source
   arrays become 5.85 MB purely from 1-byte-per-ASCII-char storage. That
   17.36 MB is 55 % of the total 31.32 MB saving and is banked by *either* of
   the two candidate designs.

3. **And the header is a memory wash.** Compare the last two rows: header+view
   **20.57** vs bare-array fallback **20.30** (null), **30.38** vs **30.12**
   (drc). Those are ties — the fallback is very slightly *ahead*. The reason is
   arithmetic: on the mass of this distribution (90 % at ≤ 12 bytes),
   `a8(12 + L)` is *also* 24 bytes, exactly what the header costs. The header
   only pulls ahead under the copying collector (25.47 vs 29.18, −13 %), where
   its 16-byte object granularity punishes the copy design harder.

   **This is a genuine correction to §Header's argument.** §Header defends the
   two-object rep on the grounds that "for very short strings the second object
   header can exceed the byte savings" and that sharing rescues it. Sharing does
   rescue it — but what sharing rescues it *to* is parity with the design that
   has no header at all. The header's case must be made on the *other* axis:
   with views, tokenizing 5.8 MB of source performs **zero** element copies and
   613 238 *fixed-size* allocations, against 613 238 variable-size allocations
   **plus 5 175 507 `i32` element copies** today. That
   is the argument that survives measurement. The memory argument does not.

4. **Row 3 is the warning.** A header *without* a view — which is what you get if
   Step 2 lands the struct but `slice` still copies — costs 67.5 % / 80.7 % /
   88.6 %, i.e. it throws away most of the win and, on the per-string population
   alone, is a **net loss** (28.68 → 29.17 MB, +1.7 % under null; +15.2 %
   copying; +26.8 % drc). If the migration has an intermediate state where the
   struct exists but slicing still copies, that state is worse than either
   endpoint. Do not ship it, and do not measure the migration there.

**One caveat on retention, for programs that are not the compiler.** Under
`VL_GC=none` nothing is collected, so today's 27 `gSrc` arrays all accumulate —
that is the compiler's real situation and the table is exact for it. Under a
*collecting* collector, today's `gSrc` is garbage the moment a file is tokenized
(tokens are independent copies), whereas under the view rep the backing is
**retained by every live token**. Re-priced that way under `copying` — only the
largest file's source live at once (`compiler/emit_classify.vl`, 1 409 640 B →
≈ 5.6 MB as `array i32`) — today is ≈ 42.9 MB against the proposal's 25.47 MB.
Still a 41 % win, but the margin narrows, and this is exactly the
`s.compact()` / OQ-4 hazard showing up in the compiler's own numbers rather than
in the abstract.

### 1.8 What was NOT measured, and the bound on it

**Not measured: the runtime-constructed string population** — results of `+`
concatenation, mangled symbol names, type spellings, diagnostics assembled at
error time, and map keys built rather than sliced. These would get their **own**
backing (2 objects, no sharing) and take the full +26 % … +49 % hit from §1.7's
first table.

**Why it was not measured:** these strings are created inline at hundreds of
sites (`compiler/*.vl` has **735 lines** containing a string-literal
concatenation, 1 217 occurrences of `" +` / `+ "`), not behind one chokepoint the
way `mkTok` is. A runtime histogram would need either per-site instrumentation of
the compiler source or a counting hook injected into the emitter's `+` lowering —
both are compiler modifications, and the second is deep emitter surgery. Neither
is cheap. **No estimate is offered in its place.**

**One constructed sub-population *was* measured, as a calibration point.** The
lexer's decoded string/char literal *values* are built by concatenation
(`compiler/lexer.vl:568`, `:671`, `:679` — `value = value + gSrc.slice(...)`), so
they are genuinely constructed, not sliced, and they would take the own-backing
penalty in full:

| | n | mean B | median | today | own-backing | Δ |
|---|---|---|---|---|---|---|
| null | 8 854 | 7.81 | 3 | 399.9 kB | 417.5 kB | **+4.4 %** (+2.0 B/string) |
| copying | 8 854 | 7.81 | 3 | 511.6 kB | 608.2 kB | **+18.9 %** (+10.9 B/string) |
| drc | 8 854 | 7.81 | 3 | 541.6 kB | 700.9 kB | **+29.4 %** (+18.0 B/string) |

It is 1.4 % of the lexer population by count and its whole penalty is under
160 kB, so it does not move the verdict — but it is a real, measured sample of
exactly the population §1.8 says is otherwise unmeasured, and its shape (mean
7.8 B, median 3) matches the identifier shape rather than being longer.

**The bound that can be stated.** The measured saving is 31.33 MB (null) /
35.02 MB (copying) / 31.33 MB (drc). The per-string penalty for a constructed,
identifier-shaped string is 9.3 / 18.0 / 25.3 bytes. So the verdict flips only if
a self-compile constructs:

| collector | constructed strings needed to erase the win | as a multiple of the whole measured lexer population |
|---|---|---|
| `null` | 3.37 M | **5.50 ×** |
| `copying` | 1.94 M | **3.17 ×** |
| `drc` | 1.24 M | **2.02 ×** |

For scale, a whole self-compile (`vl build compiler/entry.vl`, warm) peaks at
**697 388 / 697 748 / 698 168 kB** RSS over three runs (2.05–2.09 s) under the
null compile engine — which, because that engine never collects, is close to the
compile's *total* GC allocation. The entire measured lexer population under
today's rep is 51.89 MB of that — about **7 %**. The margin is real
but it is a factor of 2–5, not a factor of 100; **if the design wants this
number nailed down, the follow-up is an instrumented self-compile, and it is a
separate piece of work.**


---

## Part 2 — the Step 2 migration surface

> Everything in this part is a **re-derivation at `adbd956d`**, not a re-quote.
> Where a number here disagrees with `docs/guide/strings-design.md`, the
> disagreement is stated rather than smoothed over.

> **STATUS — the HEAP-TYPE SPLIT (Stage 2a) HAS LANDED.** `string` no longer shares
> `aTypeIdx` with the i32 list's backing: it has its own index, `sTypeIdx`
> (`compiler/emit_state.vl`, minted in `emit_collect.mAssignTypeIndices`, emitted
> immediately after `aTypeIdx` in `emit_sections.emitTypeSection`). Both types are still
> `(array (mut i32))` of code points, so **nothing about the emitted semantics changed** —
> `s[i]` is a code point, `.length` a code-point count, the corpus buckets are
> file-for-file identical. Everything §2.3–§2.6 says about UNITS is still ahead.
>
> What that means for a reader of the rest of Part 2: **every `aTypeIdx` line number below
> is pre-split**, and the string-side ones now name `sTypeIdx`. §2.2's eight sites are
> **all closed** (see the note at the end of it), so §2.2 is now a record of how they were
> closed, not a to-do list. §2.7's ladders are untouched and still the working brief —
> except L1, whose reachability was RUN and is recorded there.
>
> The one thing that did NOT split is the **presence flag**: both indices are minted from
> the single `aUsed`, deliberately, for the reason given at the end of §2.2.

### 2.0 Two of the design doc's own denominators do not reproduce

`strings-design.md` opens its case with a "blast radius is zero" table. Two of
its three rows are wrong at this commit.

| claim in `strings-design.md` | re-derived at `adbd956d` | method |
|---|---|---|
| "Corpus: 2 075 `.vl` files — **0** non-ASCII string literals outside comments" | **11** non-ASCII string/char literals, in **5** files, out of 8 849 literals across 2 238 `.vl` files under `tests/ std/ bench/ reference/` | ran the compiler's own `tokenize()` over every `.vl` file and tested each `STRING`/`CHAR` token's **decoded value** for a code point > 127 |
| "Compiler: 27 `.vl` files — **97** non-ASCII string literals" | **105**, out of 8 854 literals across 27 files | same probe |
| "`compiler/*.vl` — 39K lines" | **124 923** physical / 121 847 non-blank / **73 879** non-blank non-comment | `cat compiler/*.vl \| wc -l`, `… \| grep -c '[^[:space:]]'`, `… \| sed 's\|//.*\|\|' \| grep -c '[^[:space:]]'` — **no denominator yields 39K**; the figure is stale |

The corpus row is the one that matters, because §"The blast radius of the change
is zero" concludes from it that "every corpus fixture keeps working
**unchanged**". It does not. The 11 literals are:

| file | n | what it asserts | survives byte-indexing? |
|---|---|---|---|
| `tests/cases/std/utf8-roundtrip.vl` | 5 | `encodeUtf8("é").length` etc. — all `u8[]` lengths | yes |
| `tests/cases/std/utf8-lossy.vl` | 2 | `decodeUtf8Lossy(twoBad).length` == 4, with the comment *"A VL string IS a code-point sequence, so `.length` counts characters, not the 8 bytes"* (`:27`) | **NO — prints 8** |
| `tests/cases/chars/literals.vl` | 2 | `print('é')` == 233 — a char literal stays a code point | yes |
| `tests/cases/strings/escapes.vl` | 1 | `"é".length` == 1 (`:72`) and `.charCodeAt(0)` == 233 (`:73`) | **NO — 2, and 195** |
| `tests/cases/lexer/string-escape-runs.vl` | 1 | `@log start🙂midA end` — printed, never indexed | yes |

So the fixture blast radius is **two files and three assertions**, not zero. That
is still small — but it is not zero, and one of the two is a fixture whose
*prose comment* states the invariant the change removes. Both must be updated in
the same PR as the rep change or the corpus sweep will report a spurious
regression.

`std/utf8.vl` (259 lines) is the other user-facing casualty, and it is not a
casualty so much as an inversion: `utf8Length(self: string)` becomes `s.length`,
`encodeUtf8(self: string): u8[]` becomes `s.bytes()` — the O(1) zero-copy view
§Byte view promises — and `decodeUtf8(self: u8[]): string | Utf8Error` becomes a
header construction plus an optional validity scan. The module does not go away
(the `Utf8Error`/maximal-subpart semantics of `decodeUtf8Lossy` still need code),
but four of its six exports change from O(n) transcoders to O(1) wrappers, and
`tests/cases/std/utf8-*.vl` are its only fixtures.

### 2.1 The `aTypeIdx` census, re-derived

`aTypeIdx` (`compiler/emit_state.vl:794`, assigned at `compiler/emit_collect.vl:3300`)
is the emitter's index for the `(array mut i32)` heap type that `string` and an
`i32[]`'s **backing** share today. Splitting it is what Step 2 mechanically *is*.

**The prior census's 359 / 69 do not survive contact.** 359 was a *substring*
count, and 14 of those lines are a different identifier — `raTypeIdx`, the
ref-array backing type at `compiler/emit_state.vl:838`. No line contains both, so
the subtraction is clean:

```
grep -ohP '(?<![A-Za-z0-9_])aTypeIdx(?![A-Za-z0-9_])' compiler/*.vl | wc -l   # 368 occurrences
grep -hP  '(?<![A-Za-z0-9_])aTypeIdx(?![A-Za-z0-9_])' compiler/*.vl | wc -l   # 346 lines
grep -h 'raTypeIdx' compiler/*.vl | wc -l                                     #  14 (zero overlap)
grep -oh 'aTypeIdx' compiler/*.vl | wc -l                                     # 382 (the substring count)
grep -hc 'aTypeIdx' compiler/*.vl | paste -sd+ | bc                           # 360 (the prior 359)
```

**And 346 is still the wrong denominator for cost, because 178 of those lines are
prose.** A line is code if `aTypeIdx` survives `sed 's|//.*$||'`:

```
grep -hP '(?<![A-Za-z0-9_])aTypeIdx(?![A-Za-z0-9_])' compiler/*.vl \
  | sed 's|//.*$||' | grep -cP '(?<![A-Za-z0-9_])aTypeIdx(?![A-Za-z0-9_])'    # 168 code lines
```

**168 code sites, not 359.** Bucketed by reading each with its enclosing
function (denominator 346 lines = 168 code + 178 comment):

| bucket | code | comment | total | share |
|---|---:|---:|---:|---:|
| **A — string-only** | 61 | 105 | 166 | 48.0 % |
| **B — `i32[]`-only** (never sees a string) | 79 | 45 | 124 | 35.8 % |
| **C — shared / ambiguous: the actual migration surface** | **8** | 6 | **14** | **4.0 %** |
| **D — infrastructure** (type section, declaration, index bookkeeping) | 20 | 22 | 42 | 12.1 % |
| **total** | **168** | **178** | **346** | 100 % |

The C bucket is small for a *structural* reason worth recording, because it is
the good news in this whole map: **at the value level, `string` and `i32[]` do
not meet.** An `i32[]` value is `lTypeIdx` — the `{backing,len,cap}` wrapper —
and `aTypeIdx` appears only as its backing; a `string` value *is* `aTypeIdx`
directly. `fbValtype`'s `"list"` arm writes `lTypeIdx` and its `"str"` arm writes
`aTypeIdx` (`compiler/emit_bytes.vl:1817–1828`), so the two partition cleanly
almost everywhere. 50 of the 79 B-bucket code lines are the hash map's raw
`live`/`index`/`hashes` arrays, which do not move at all.

**"String-aware = 69" reproduces exactly**, under this definition — the line's own
text (code plus trailing comment) contains `string`, case-insensitively:

```
grep -hP '(?<![A-Za-z0-9_])aTypeIdx(?![A-Za-z0-9_])' compiler/*.vl | grep -ci 'string'   # 69
```

**but 69 is a bad proxy for migration cost in both directions.** Only **4 of the
69 are code lines** — the other 65 are comments. And it *under*-counts: bucket A
alone is 166 lines, because a site like `fbArrayGet(aTypeIdx)` inside
`emitStrLessCore` never spells "string" on its own line. Calibration:

| definition | count |
|---|---:|
| same line contains `string` (ci) — **the 69** | 69 |
| same line contains `str` (ci) | 80 |
| ±5-line window contains `str` (ci) | 248 |
| ±20-line window contains `str` (ci) | 324 |
| **read with the enclosing function: A + C** | **180** |

### 2.2 The eight sites that MUST split — **all eight are closed**

Every C-bucket code site must split; none can stay shared. They cluster into four
mechanisms. **All four mechanisms landed in Stage 2a**; how each was closed is recorded
in the last column of the table below and at the end of this section.

| # | site | what it is | why it must split |
|---|---|---|---|
| 1–2 | `compiler/emit_bytes.vl:1266`, `:1267` | `fbRefRun(aTypeIdx)` declaring locals `strScrA` / `strScrB` of the string-op scratch frame | the frame is documented as "3 non-null `(ref $aTypeIdx)` **string** refs" (`emit_bytes.vl:1263`, `emit_state.vl:619`) but `i32[]` **field equality** stashes two *list backings* into those exact slots — `compiler/wasmEmit.vl:9252`,`:9257` set them, `:9272`,`:9275` read them with `fbArrayGet(aTypeIdx)`. Under the new rep `strScrA/B` become `(ref $strStruct)` and **cannot hold an `(array mut i32)`.** |
| 3 | `compiler/emit_bytes.vl:1470` | `"i32" => fbRefNullRun(aTypeIdx)` — the destination slot type for a chunked long literal | the slot type is keyed on a kind string, and **both** callers pass `"i32"`: `wasmEmit.vl:4955` for a long **string** literal and `wasmEmit.vl:5577` for a long **`i32[]`** literal. One `match` arm, two reps. |
| 4 | `compiler/emit_sections.vl:3541` | `if c == 'm' { wSLEB(mkArrIdx) } else { wSLEB(aTypeIdx) }` in `helpValtype` | the descriptor char `'a'` is documented at `emit_sections.vl:3515` as *"a non-null `(ref $aTypeIdx)` **string/i32-array** ref"*. `helpFuncType("iaaama", "i")` for `__map_probe__` (`emit_sections.vl:4343`) has, **inside one descriptor string**, three `'a'` slots that are `index`/`hashes`/`live` (i32 arrays) and one that is the probed **key** (a string). |
| 5–6 | `compiler/wasmEmit.vl:11010`, `:11019` | `fbArrayNewDefault(aTypeIdx)` then `fbArrayCopy(aTypeIdx, aTypeIdx)` — `fromCodePoints(xs: i32[])` | today this is a **memcpy only because the two heap types are one index**. Under the new rep the dest is a struct over `(array i8)` and the src stays `(array mut i32)`: it stops being a copy and becomes a **UTF-8 encode loop** with a width pre-pass or a grow. This is the largest semantic change in the bucket. |

`strScrOut` (`emit_bytes.vl:1268`) is *not* affected — its only non-string user
(`wasmEmit.vl:11011`) already holds a string.

**How each closed (Stage 2a):**

| # | closed by |
|---|---|
| 1–2 | `strScrA`/`strScrB` are `(ref $sTypeIdx)` now, and the `i32[]` field-equality arm stopped borrowing them: it mints **two fresh `(ref null $aTypeIdx)` slots of the lazy list frame** per compare (`wasmEmit.listBackStashSlot`, `liBack` 1 typing, no emitted instructions). The i32 counters it also takes from the string-op frame stayed — they carry no rep. |
| 3 | a new `liBack` code **5**, "the raw string backing", written by `arrLitChunkStart`'s new `strBack` argument. The `MfKind` vocabulary is untouched: the kind of a long string literal genuinely IS `"i32"` (the elements are i32 code points), so the discriminant belongs on the destination, not on the element kind. |
| 4 | a new descriptor char **`'s'`** in `helpValtype`. `__map_probe__` is `helpFuncType("iaaams", "i")` — three `'a'` i32 arrays, the `'m'` keys backing, the `'s'` key; `__str_hash__`/`__str_eq__`/`__str_concat__` became `"s"→"i"`, `"ss"→"i"`, `"ss"→"s"`. `__map_resize__` (`"aaaii"→"a"`) and `__map_probe_i32__` (`"aaaai"→"i"`) are all-i32-array and did not move. |
| 5–6 | `array.new_default $sTypeIdx` + **`array.copy $sTypeIdx $aTypeIdx`**. It stays a memcpy: `array.copy`'s validation rule is on the *storage* types (`i32 ≤ i32`), not on heap-type identity, so a cross-type copy is legal and the encode loop is genuinely Stage 2b's problem. |

**THE GATES CAN SEE A MISSED SITE, which was not obvious in advance.** The emitter puts
every heap type in ONE rec group (`emit_sections.emitTypeSection` writes `0x4e` then
`n + typeOffset + hasStart` entries), and iso-recursive type identity is *(canonical rec
group, position)* — so two structurally identical entries at different positions are
**different types**, not canonicalized together the way two singleton groups would be. A
site left naming the wrong index is invalid wasm. Verified, not assumed: a one-line
sabotage of `emitStrSlice` back to `aTypeIdx` made `"hello".slice(0,5)` fail
`vl check --codegen` with `type mismatch: expected (ref $type), found (ref $type)`. That
is why the completeness evidence for this stage is *1 617 corpus files codegen-validated*
rather than an argument about how the sites were enumerated.

**The wider gate is `aUsed`, not `aTypeIdx`** — and it was DELIBERATELY NOT SPLIT.
`compiler/emit_collect.vl:3300` was
`if aUsed { aTypeIdx = mAllocType() } else { aTypeIdx = mNextType }`, and `aUsed`
is forced by *both* string usage (`emit_collect.vl:4067` `fromCodePoint`, `:4069`
`toString`, `:4199` "string backing + vals backing") and `i32[]` usage. `grep -c 'aUsed'
compiler/*.vl` totals **141** occurrences over 6 files (upper bound: the count includes
`raUsed` as a substring) — a **larger** secondary surface than the C bucket itself.

Stage 2a mints **both** indices from that one flag. The argument for it is not economy,
it is the governing hazard: `aUsed` is *already* true wherever a string type index is
needed (every string lowering guards on it today, and the program would not compile
otherwise), so the string index is available exactly where it was — **provably, without
classifying 64 flag-writes**. Forking the flag would add a second usage ladder whose
fallthrough is "the program does not use X", which turns off a family of downstream
classifiers at once with no diagnostic; that is the shape §2.7 opens by naming. The cost
of not forking is **one unused 3-byte type** in a module that uses a list but no string,
or the reverse. Splitting the flag is a separate change with its own measurement, and
Stage 2b does not need it: an unused string type is 3 bytes, a missing one is invalid wasm.

### 2.3 Where the element is assumed to be a code point

The rep identity is stated in the source in three places, and all three read false
after Step 2: `compiler/emit_state.vl:912` ("a string IS the raw `(array i32)` at
`aTypeIdx`"), `compiler/emit_collect.vl:3837` ("A VL string IS the same
`(array (mut i32))` an array is"), `compiler/emit_bytes.vl:1263`.

**Element reads/writes that change unit:**

| site | today |
|---|---|
| `compiler/wasmEmit.vl:8160` `emitIndex` string arm | `s[i]` → bare `fbArrayGet(aTypeIdx)`, "indexed directly (no unwrap)" |
| `compiler/wasmEmit.vl:9580` `emitStrCharCode` | `charCodeAt` — an independent copy of the same lowering |
| `compiler/wasmEmit.vl:8181` `emitArrLen` | string `.length` → `fbArrayLen()`, "the code-point count" |
| `compiler/wasmEmit.vl:9341` `emitStrSlice` | `array.new_default $aTypeIdx` + `array.copy $aTypeIdx $aTypeIdx` (verified at `:9384`, `:9392`) |
| `compiler/wasmEmit.vl:9450` `emitStrIndexOf` | element-granular scan; byte search is *semantically* safe on UTF-8 (self-synchronizing) but the loop is not |
| `compiler/wasmEmit.vl:8502` `emitStrLessCore` | "Compares code points (unsigned)" — byte order == code-point order for UTF-8, so this survives semantically |
| `compiler/emit_sections.vl:1891` `fbStrHashStep`, `:2040` `emitStrEqFnCode`, `:2165` `emitStrConcatFnCode` | FNV-1a / 4-wide `==` / concat, all per element |
| `compiler/wasmEmit.vl:15579` `emitForInStmt` | `for cp in s` — `fbArrayGet(aTypeIdx)` with the cursor increment **hard-coded to 1** |
| `compiler/wasmEmit.vl:16226` `emitPrintStrFromScratch` | one `__print_char__` host call per code point |
| `compiler/wasmEmit.vl:4936` `emitStr`, `compiler/emit_sections.vl:4570` | string literal → one `i32.const` per code point + `array.new_fixed`; the second is the **pooled** twin of the first |

**`for cp in s` is the only construct whose *shape* changes, not just its unit** —
a UTF-8 decode needs a variable stride, and the increment is currently `1` in a
loop body shared with the `i32[]` / `u8[]` / map walks.

**The idiom that breaks loudly and silently is `read elements into an i32[], then
`fromCodePoints`.** Under bytes, each byte is re-encoded as its own code point →
mojibake. It is live today, because the compiler has **105 non-ASCII string/char
literals** (§2.0), all diagnostic text, and these walk exactly that text:
`compiler/typecheck.vl:5590` `demangleMsg` (walks diagnostic messages),
`compiler/cli_util.vl:280` `cliJsonEscape` (the `--json` channel),
`compiler/cli_util.vl:47` `cliDetab`, `:36` `cliUpper`,
`compiler/fmt_util.vl:162` `collapseWs`. `grep -oh 'fromCodePoints(' compiler/*.vl std/*.vl | wc -l` gives **35**
occurrences: **32 call sites** (`cli.vl` 10, `cli_util.vl` 6, `driver.vl` 6,
`format.vl` 3, `fmt_util.vl` 3, `typecheck.vl` 2, `lint.vl` 1, `std/utf8.vl` 1)
plus 3 emitter-side recognitions of the intrinsic name (`wasmEmit.vl`,
`emit_collect.vl`, `emit_classify.vl`).

`compiler/emit_base.vl:847` `strToCps` is the purest statement of the assumption:
its comment is *"`s[i]` already yields the i32 code point (strings ARE
code-point arrays in this representation), so this is a straight element copy."*
Its whole premise is the old rep.

**Lexer cursor primitives all become byte-valued** — `peek`/`peek2`/`peekN`
(`compiler/lexer.vl:235–253`), `advance` (`:255`) — and because `gCol` increments
per element, **source columns become byte columns**. `isDigit`/`isIdStart`/
`isIdPart` (`:178–190`) are ASCII-only, so a non-ASCII source character is
already an error token today; under bytes it becomes *N* error tokens.

### 2.4 Where `.length` means a code-point count

Most `.length` uses pair with `s[i]` in the same unit and only compare against
ASCII — `lexer.vl` (13 sites), `cli_util.vl`, `emit_bignum.vl`, `tyname.vl` — and
are rep-independent. The ones whose **meaning** changes:

- **`compiler/cli_util.vl:69` `cliVisualWidth`** — `cliDetab(raw.slice(0, m)).length`
  is the diagnostic **caret column**. A non-ASCII character before the error
  column pushes the caret right by its UTF-8 width. This is a user-visible
  regression in exactly the file that renders errors.
- **`compiler/emit_base.vl:1515` `isConstInit`** (`strText.length <= NEW_FIXED_MAX + 2`)
  and **`compiler/emit_sections.vl:2650` `collectStrPool`**
  (`decodeStr(strToCps(...)).length <= NEW_FIXED_MAX`) — the **same threshold
  decided twice, in two files, on two different quantities** (raw lexeme vs
  decoded form). `NEW_FIXED_MAX` becomes an operand budget in *bytes*, so a
  non-ASCII literal now needs up to 4× the `array.new_fixed` operands.
- **`compiler/fmt_util.vl:214` `joinLinesRange`** and its hand-copied twin at
  **`compiler/format.vl:722`** — both size a buffer from `Σ parts[i].length`,
  then copy per element, then `fromCodePoints`. Sizing and copy must switch unit
  together, in both copies.
- Every host-facing `<name>Len(i)` export is `someString.length` and its
  `<name>At(i,j)` partner is `someString[j]` — `driver.vl:620, 1370, 1458, 1685,
  1697`; `check_query.vl:256, 429, 525`; `cli.vl:400`; `std/test.vl:320, 360`.
- `std/utf8.vl:101` `utf8Length` and `:113` `encodeUtf8` become identity/no-op.

### 2.5 `slice`, and what a view costs

Two independent lowerings, with two independent scratch frames:

| | string slice | array slice |
|---|---|---|
| classify | `emit_classify.vl:5776` `exprIsStrSlice` | `emit_classify.vl:27582` `callIsArrSlice` |
| reserve | `emit_classify.vl:5837` (in `exprHasStrOp`) → `strScratchBase` | `emit_collect.vl:3036` (`mfScan`) → `mfScratchBase` |
| dispatch | `wasmEmit.vl:16808` | `wasmEmit.vl:16812` |
| lower | `wasmEmit.vl:9341` `emitStrSlice` | `wasmEmit.vl:13668` `emitArrSlice` |
| checker | `typecheck.vl:16646` — **2 args required** | `typecheck.vl:16545` — **1 or 2 args** |

**Making the string slice a view is a deletion, and a small one.** `emitStrSlice`
collapses to: eval receiver, clamp both bounds against `$len`,
`struct.new $str (backing, start+a, b-a, 0)`. What goes away is
`fbArrayNewDefault(aTypeIdx)` at `wasmEmit.vl:9384` and
`fbArrayCopy(aTypeIdx, aTypeIdx)` at `:9392`.

**Nothing in the tree blocks aliasing**, which is the genuinely good news:

1. **No string element store exists.** `emitAssign`'s `Index` target
   (`wasmEmit.vl:12097`) dispatches on map / ref-array / string-array / scalar
   list / `u8[]` — there is **no raw-string arm** — and the checker gives a
   string only `.length` as a member (`typecheck.vl:28029`). Aliasing is safe by
   construction, not by convention.
2. **No identity comparison on strings.** `==` is element-wise everywhere
   (`emit_classify.vl:5707` → core 5 → `wasmEmit.vl:8871`); map keys go through
   `__str_eq__` (`emit_sections.vl:2262`). There is no `ref.eq` on a string, so a
   view and a copy are indistinguishable to every existing comparison.
3. The remaining `array.copy` sites that must become header-aware are
   `wasmEmit.vl:9392` (slice), `emit_sections.vl:2165` (`__str_concat__`), and
   `wasmEmit.vl:11460` (`__array_copy__`, currently reachable with a string
   operand *because* a string is `$aTypeIdx`).

**The one non-obvious cost: the reservation scan must SHRINK.** A view needs zero
scratch temps, so `exprHasStrOp`'s `.slice` arm (`emit_classify.vl:5837`) and
`blockHasStrOpScan`'s `Member` arm — which exists *only* for
`s.slice(a,b).length` (`emit_classify.vl:6043`) — must be **removed** in the same
change, or every function containing a slice over-reserves. Removing an arm from
a reservation ladder is the *un-drilled direction* of this family's failure mode:
every recorded defect in it was a **missing** arm, never a stale one.

**And the retention hazard is already live in the compiler.** `mkTok`
(`lexer.vl:472`), the comment path (`:743`), `scanQuoted`'s runs
(`:568/671/679`), and `format.vl:596` would each hold a view of a whole source
file. §1.7's last paragraph prices this: good for the compiler under its null
collector, a real narrowing of the win under a collecting one.

### 2.6 Host boundaries

**`__print_string__` does not exist at this commit.** The design doc's §Context
description of the boundary is stale. What exists:

| channel | guest | host | today |
|---|---|---|---|
| `print(<string>)` | `wasmEmit.vl:16033` → `wasmEmit.vl:16226` | `scripts/vl-host/src/main.rs:1841` — `__print_char__` pushes a `u32` into a `Vec<u32>`; `__print_str_flush__` does `filter_map(char::from_u32).collect()` | **one host call per code point**, then a flush |
| import decls | `emit_sections.vl:4368` — `__print_i32__`(0), `__print_bool__`(1), `__print_char__`(2), `__print_str_flush__`(3) | — | fixed indices, hardcoded in call lowering |
| source in | `driver.vl:161–206` `srcReset`/`srcPush`/`srcLoad` | `main.rs:668` `StrIn::send` | bulk path stages **UTF-32LE, one code point per i32 word**; `srcLoad` does `__load_i32__(i*4)` per code point |
| byte read-back | `driver.vl:517` `rbyteStore` | `main.rs:734` `BytesOut` | already **packs 4 bytes per i32 word** — the shape the string paths would adopt |
| CLI results | `cli.vl:421` `cliCmdDataStore` | `main.rs:797` `StrOut` + `push_cp` (`main.rs:840`) | UTF-32LE, 1 code point per word |
| `std:fs` | `typecheck.vl:2936` over `u8[]` | `main.rs:1601`, and `main.rs:1510` **already uses `ArrayRef::new_from_i8_slice`** | already bytes |

**What Step 2 changes here.**

- `__print_char__`/`__print_str_flush__` become byte-oriented: the host's
  `Vec<u32>` becomes `Vec<u8>` + `String::from_utf8_lossy`, and the guest side
  becomes one bulk copy instead of a per-element loop.
- **`StrOut` becomes structurally identical to `BytesOut`** (`main.rs:797` vs
  `main.rs:734`) and the two Rust structs can merge; `push_cp` (`main.rs:840`)
  and its `debug_assert!` disappear. `driver.vl`'s own comment at `:509` already
  notes the byte path "quadruples the chunk to a whole 65 536-byte page, so the
  self-compile's read-back is 17 calls instead of 68" — the intake gets the same
  4× the moment its element is a byte.
- **`srcLoad` stays a loop.** `driver.vl:180` states the constraint correctly and
  it is *still true* for `array i8`: WasmGC has no runtime memory→GC-array copy
  (`array.new_data` reads a build-time passive segment). What the change buys is
  4× fewer words, not a memcpy.
- **`ArrayRef::new_from_i8_slice` is real and present in wasmtime 47.0.2**
  (`wasmtime-47.0.2/src/runtime/gc/enabled/arrayref.rs:575`), and `std:fs`
  already uses it (`main.rs:1510`). The roadmap's "lands free the moment strings
  are `(array i8)`" is accurate — but note it is a *host*→guest memcpy for a
  freshly allocated array, so it serves `readTextFile`, not `srcLoad`'s
  chunked-window protocol.
- **`__store_string__` / `__log_string__`** (`typecheck.vl:2858`) are declared and
  deliberately dead; `typecheck.vl:3166` gives the reason: *"would have to copy a
  GC `(array i32)` into linear memory with no byte encoding decided."* **Step 2
  decides it.** Both become implementable and must move from
  `nameIsUnimplementedIntrinsic` (`typecheck.vl:3169`) to
  `nameIsEmitterIntrinsic` (`typecheck.vl:2973`) *and* into `builtinScan`'s
  completion list (`driver.vl:1129`) — three places, and the third is an LSP
  surface no test covers.
- **Five hand-copied per-element read loops in the host** each do
  `char::from_u32(at(i,j))` independently: `StrOut::read` (`main.rs:797`),
  `render_diags` (`:1119`), `read_test_str` (`:2444`), `read_cli_str` (`:2746`),
  `report_rep_shadow`'s `read_str` (`:1822`), plus inline copies at `:223`,
  `:268`, `:292`, `:918`. All five change together or diagnostics render mojibake.

### 2.7 The parallel ladders — the risk sites, named in advance

This is the part of the map worth the most. This emitter's recurring defect is
**a ladder with an arm its sibling ladder lacks**, and the failure signature is
specific: `vl check` returns 0 and the module is invalid or silently wrong. Every
family below is a place where one fact is written twice.

**Ranked by risk to Step 2.**

---

**L1 — the type-minting ladders (`collectA` / `forceGenAppArgTypes`). HIGHEST
RISK, and it already has a proven missing arm.**

| role | site | arms |
|---|---|---|
| whole-arena usage scan | `compiler/emit_collect.vl:3878–4700` `collectA` | `StrLit`→`aUsed`; `fromCodePoint`/`toString`→`aUsed`; `fromCodePoints`→`aUsed`+`lUsed`; `.keys()`; `Map`/`Set`; `__array_new__` family; a TypeRef walk incl. `nameIsU8Array`→`ba8Used` (`:4424`) |
| generic-application twin | `compiler/emit_collect.vl:3788–3830` `forceGenAppArgTypes` | **10**: `nameIsStringArray`, `nameIsF64Array`, `nameIsI64Array`, `nameIsF32Array`, `nameIsBareMap`, `nameIsNulI32List`, `arrElemIs i32/boolean`, `nameIsString`/`nameIsNulString`, `nulScalarListKind`×4 |

**Verified asymmetry: `forceGenAppArgTypes` has no `nameIsU8Array` arm.**
`ba8Used = true` is set at exactly three sites in the tree
(`emit_collect.vl:4424`, `emit_sections.vl:3077`, `emit_classify.vl:18375`) and
none is in the generic-application path. `u8[]` is the *newest* packed rep and
it was already missed in this ladder. `string` becoming a struct over a packed
`(array i8)` needs a new `*Used` flag and a new type index, and **this is where
it will be forgotten** — because the fallthrough of a usage detector is
"the program does not use X", which turns off a whole family of downstream
classifiers at once with no diagnostic.

**THE REACHABILITY WAS RUN (2026-08-23, Stage 2a) AND IT IS A NEGATIVE: the missing
`nameIsU8Array` arm CANNOT fire today.** The asymmetry is real; the hole is unreachable,
because everything upstream of it refuses first. `forceGenAppArgTypes` only ever sees the
ARGUMENTS of a `Head<…>` spelling, and VL has exactly one kind of generic alias — a struct
shape:

| witness | result |
|---|---|
| `type Box<T> = { v: T }` + `Box<u8[]>` (param, return, and array-of positions) | **loud reject**: `emitProgram: only i32 / boolean / string / array struct fields are supported` — a `u8[]` cannot be a struct field at all |
| `type Pair<A, B> = { a: A, b: B }` + `Pair<i32, u8[]>` | same loud reject |
| `type Id<T> = T` (a non-struct alias) | `unknown type 'T' in union 'Id<T>'` — the alias form does not exist |
| `type Opt<T> = T \| null` + `Opt<u8[]>` | type error, same reason |
| **control**: `Box<i32[]>`, `Box<string>` | both compile and run — the sibling arms this one lacks DO fire |

So the arm was left alone, per "a precise negative result is worth more than a speculative
fix". Two things follow for whoever revisits this. First, the arm becomes reachable the day
a `u8[]` struct field is supported, and it should land in the SAME change. Second, the
`string` arm the analogous Stage-2b flag would need (`nameIsString` / `nameIsNulString`,
`emit_collect.vl:3818`) **is present and does fire** — `Box<string>` was the control above.

**A DIFFERENT `u8[]` GENERIC DEFECT DID REPRODUCE while running these witnesses, and it is
NOT this one.** Binding a bare `T` to `u8[]` is check-clean invalid wasm:

```vl
function id<T>(x: T) { x }
const q: u8[] = [1, 2]
print(id(q).length)
```

`vl check` rc 0 · `vl check --codegen`: `type mismatch: expected (ref $type), found (ref
$type)` · `vl run` exits 0 having printed a wasm translation error. It is **not** a
`*Used` reservation miss — adding a bystander `for v in q` elsewhere in the same program
does not rescue it, so the type IS minted and the monomorphized body lowers the packed
list with the i32-list machinery. `tests/cases/arrays/error-u8-not-generic.vl` refuses the
`T[]` spelling for exactly this reason and documents the refusal as two halves
(`bindGenWalk` declines to bind, the argument seam reports); the **bare-`T`** binding
reaches neither half. Pre-existing, unrelated to the string rep, not fixed here.

---

**L2 — the string-op scratch-frame triple. The vein the tree itself calls its
richest.**

| role | site |
|---|---|
| reserve (expression) | `compiler/emit_classify.vl:5818` `exprHasStrOp` — 13 node kinds; within `Call`: strSlice, atom-widen ×3, strIndexOf, `print` (4 sub-predicates), `__trap__`, `toString`, `fromCodePoints` |
| reserve (statement) | `compiler/emit_classify.vl:6018` `blockHasStrOpScan` — 16 statement kinds |
| reserve (if-chain) | `compiler/emit_classify.vl:6094` `ifChainHasStrOp` |
| emit | `wasmEmit.vl:8390` concat, `:8427` eq, `:8460` order, `:9341` slice, `:9450` indexOf, `:8257` toString, `:16033` printStr, `:16264` atomToStr — **8** |

Not 1:1, partly by design (`emitStrCharCode` at `wasmEmit.vl:9580` deliberately
has no reservation arm — `emit_classify.vl:5845`). `blockHasStrOpScan`'s
`Member`, `Index` and `ArrayLit` arms each carry a comment saying they were added
*after* the missing arm produced check-clean invalid wasm
(`emit_classify.vl:6041–6058`). **Step 2 pushes this family in the untested
direction: making `slice` a view REMOVES an arm** (§2.5), and every recorded
defect here was a missing arm, never a stale one.

Two live notes for whoever touches it: `exprHasStrOp` has **no `OptMember` arm**,
while `OptMember` is live in `wasmEmit.vl` (8 sites) — *a candidate missing arm,
not verified by a witness*. And `wasmEmit.vl:11095` carries a 40-line
"FILED, NOT FIXED" comment about `exprHasStrOp`'s print arm lacking
`exprNullableString`; it **was** fixed (`emit_classify.vl:5886` asks it now) and
the comment is stale one-directionally.

---

**L3 — the escape decoders. THIS ONE IS ALREADY BROKEN, and I reproduced it.**

| copy | site | arms |
|---|---|---|
| lexer | `compiler/lexer.vl:551` `scanQuoted` + `:447` `decodeSimpleEscape` | 10 simple, `\xXX`, `\u{…}`, `\uXXXX`, **line continuation** (`:650`), unknown-verbatim, plus diagnostics |
| emitter | `compiler/emit_base.vl:733` `decodeStr` | 10 simple, `\xXX`, `\u{…}`, `\uXXXX`, unknown-verbatim — **no line-continuation arm** |

`decodeStr`'s own header claims it resolves escapes "consistently with the
lexer's `scanQuoted`" (`emit_base.vl:728`). It does not. A backslash immediately
before a newline falls into `decodeStr`'s `else` ("Unknown escape: keep the char
after the backslash verbatim", `emit_base.vl:833`) and pushes code point 10,
while the lexer drops both characters.

```vl
function main() {
  const s = "ab\
cd"
  print(s.length)
  print(s)
}
main()
```

```
$ vl run cont.vl
5          <- the emitter: "ab\ncd"
ab
cd
```
and driving the compiler's own lexer over the same file returns
`tokens[i].value.length == 4`, value `abcd`. **The two ladders disagree at HEAD,
there is no fixture covering string line continuation, and `vl check` is clean.**
This is a pre-existing defect, not one Step 2 introduces — but Step 2 forces
these two ladders *further* apart, because `decodeStr` must start emitting
**bytes** while `emitCharLitNode` (`wasmEmit.vl:16528`, which hard-errors unless
`cps.length == 1`) must keep counting **code points**. They currently share
`decodeStr` + `strToCps` and must stop.

A **third** consumer decodes nothing at all: `litTyOfExpr`
(`typecheck.vl:4619`) peels the quotes off the *raw* lexeme to mint a `TyLit`,
and `internAtom(e.strText)` (`wasmEmit.vl:9654`), `quoteLex`
(`emit_base.vl:1129`) and `litLexIsMember` (`emit_base.vl:1137`) key
literal-union atoms on the raw lexeme — so a literal-union member spelled with an
escape is compared un-decoded.

---

**L4 — `for cp in s`: the only construct whose SHAPE changes.**

| role | site | arms |
|---|---|---|
| element kind | `emit_classify.vl:10135` `forInElemKind` | ~24 |
| temp kind (string) | `emit_classify.vl:10302` `forInStringSrc` | 1 |
| temp kind (bytes) | `emit_classify.vl:10319` `forInU8Src` | 1 |
| declare locals | `emit_collect.vl:1983` `declareForInLocals` | 13 kind arms + the two temp-kind overrides |
| emit | `wasmEmit.vl:15430` `emitForInStmt` | 5 wrapper/backing groups + `strSrc` + `u8Src` |

Currently 1:1 — and `forInU8Src`'s own header (`emit_classify.vl:10313`) is the
clearest statement of the hazard anywhere in the tree: *"three list backings hand
the loop var an i32 (`i32[]`, a string, `u8[]`), so the element kind cannot tell
them apart and the `#l` TEMP's kind is where they differ… Without this the temp
was declared `(ref $list)` and the iterable assigned to it was `(ref $bl8)` —
`vl check` rc 0, 'type mismatch'."* `declareForInLocals`' header
(`emit_collect.vl:1975`) records the same defect found again in a second copy.

Under Step 2, `for cp in s` stops being "a string whose element kind is i32" and
becomes a **decode loop with a variable stride** — a new temp kind *and* a new
cursor discipline, landing in four places at once.

---

**L5 — `.length`: an 8-arm gate over a 5-arm ladder whose FALLTHROUGH is the
string case.**

- gate: `wasmEmit.vl:16972` `emitMemberNode` — **8** predicates (`exprArray`,
  `exprString`, `exprRefArray`, `exprStringArray`, `exprF64Array`,
  `exprI64Array`, `exprF32Array`, `exprU8Array`)
- ladder: `wasmEmit.vl:8181` `emitArrLen` — **5** arms: refArray, stringArray,
  scalar (f64/i64/f32/u8list), i32-list, **else `fbArrayLen()`**
- checker: `typecheck.vl:28015` — TyArray, TyMap, TyPrim("string"), TyVar hole

Anything the gate admits but the ladder does not enumerate silently gets
`array.len`. Today that fallthrough *is* the string arm and it happens to be
right. After Step 2 it must become `struct.get $str 2` — and then the fallthrough
is a `struct.get` applied to whatever else falls through.

---

**L6 — the string method surface, written out four times (five after Step 1).**

| copy | site | arms |
|---|---|---|
| checker type arm | `typecheck.vl:16643` | `slice`, `indexOf`, `includes`, `charCodeAt` |
| LSP completion table | `check_query.vl:516` `memcPush` | the same 4 |
| emitter classifiers | `emit_classify.vl:5776`, `:5789`, `:5803` | 3 predicates covering the 4 |
| emitter dispatch | `wasmEmit.vl:16808` | 3 |

Asymmetries **today**: `memcPush` offers no `.length` on a string though
`typecheck.vl:28031` types it (completion never suggests it); `symMemberScanAt`
(`check_query.vl:482`) handles only `TyObj` and `TyPrim("string")` — no `TyArray`
and no `TyMap` arm, against 7 array methods and 7 map methods in the checker;
`holeArrMethod` (`typecheck.vl:14368`) has 4 arms against the array arm's 7. And
**there is no `holeStrMethod` at all** (`typecheck.vl:14372` says string methods
are deliberately disjoint), so §Migration **Step 1** — `split`/`trim`/`join`/
`replace`/`startsWith`/… — has to mint a fifth ladder from nothing, and every
method it adds must land in all of them. Step 1 multiplies this ladder before
Step 2 stresses it.

---

**L7 — `heapIsPacked`: a one-line predicate that decides `array.get` vs
`array.get_u`.**

`compiler/emit_bytes.vl:719` is
`function heapIsPacked(heapIdx) { ba8Used && heapIdx == ba8TypeIdx }`, and
`fbArrayGet` (`:721`) is its only consumer — `fbArraySet` and `fbArrayCopy`
correctly need no packed branch. **If the string backing gets its own heap index
rather than sharing `ba8TypeIdx`, this single predicate is the only thing between
`array.get` and `array.get_u` on a packed array**, and a missing arm is invalid
wasm at every string index in the program.

---

**L8 — the rest, mechanical but each a "one fact, two writings":**

- **`repSigTokOfKind` / `repKindOfSigTok`** (`emit_rep.vl:170` / `:256`) — 21 arms
  each, exactly 1:1, with a header that says *"an encoder arm without its decoder
  twin (or vice versa) cannot exist"*. `S`'s valtype changes from
  `(ref $aTypeIdx)` to `(ref $strStruct)`, and `helpFuncType`'s `'a'` for
  `__str_hash__`/`__str_eq__`/`__str_concat__` (`emit_sections.vl:4338–4340`)
  must become a new letter or all three helpers get the wrong functype (this is
  C-bucket site #4 from §2.2). **The letter half is DONE** — it is `'s'`, and the three
  helpers are `"s"→"i"`, `"ss"→"i"`, `"ss"→"s"`. `S`'s valtype rides `fbValtype`'s
  `"str"`/`"nulstr"` arms, which point at `sTypeIdx`, so Stage 2b changes them in one
  place; neither ladder in `emit_rep.vl` needed an arm.
- **String literal interning vs runtime construction** — **three independent
  decodes of the same lexeme** (`emit_sections.vl:2650`, `:4570`,
  `wasmEmit.vl:4950`) and **two independent length thresholds**
  (`emit_base.vl:1515` on the raw lexeme, `emit_sections.vl:2650` on the decoded
  form). Under UTF-8 both change unit *and* the constexpr path must build a
  packed `array i8` wrapped in a `struct.new` — a constexpr shape that does not
  exist today.
- **The import table emitted twice** — `emitImportSection`
  (`emit_sections.vl:4368`) and `emitNameSection` (`:2511`) both name
  `__print_char__`/`__print_str_flush__` at the same indices; the helper functype
  table (`:4337`) is a third naming and helper-index assignment (`:2722`) a
  fourth. Replacing `__print_char__` touches all four.
- **The host's five hand-copied per-element read loops** (§2.6) — all five change
  together or diagnostics render mojibake.
- **The name-driven / arena-driven `*OfTy` twin family** — `nameIsString` /
  `nodeTyIsStringPrim`, `nameIsStringArray` / `nodeTyArrayElemRepName`,
  `rlSlotByName` / `rlSlotOfTy`, `structIndexOfTypeName` / `structIndexOfTy`,
  `repOfTy` / `repOfTyFlat`. The string-relevant seam is `exprString`
  (`emit_classify.vl:25732`, ~14 arms) vs `exprNullableString`
  (`emit_classify.vl:1770`), which its own caller documents as **strictly wider**
  (`emit_classify.vl:5864`) — an asymmetry that produced check-clean invalid wasm
  once and is patched, not eliminated.

### 2.8 Gates, and one sequencing warning

The gates for Step 2 are already non-negotiable in `strings-design.md`
(`deno task test`, the native align suites, `scripts/native-fixpoint.sh`,
`scripts/lint-self.sh`, `scripts/rep-fuzz-check.sh`). Three additions this map
implies:

1. **`scripts/rep-fuzz-check.sh` is the only gate that can see a
   REJECT→MISMATCH**, and its header says soundness is never baselineable. It is
   the gate for L1/L2/L4/L7 — every one of which fails *check-clean*.
2. **The fixture blast radius is not zero (§2.0).** `tests/cases/std/utf8-lossy.vl`
   and `tests/cases/strings/escapes.vl` must be updated in the same PR, and
   `tests/cases/std/utf8-*.vl` are the only fixtures `std/utf8.vl` has.
3. **There is no fixture for string line continuation at all** (§2.3 L3), which
   is why that ladder has been divergent without anyone noticing. Add one
   *before* Step 2 touches `decodeStr`, so the fix and the migration are
   separable.

**The sequencing warning, from §1.7 row 3.** A migration state in which the
header struct exists but `slice` still copies costs **67.5 % / 80.7 % / 88.6 %**
of today's bytes and, on the per-string population alone, is a **net loss**
(+1.7 % null, +15.2 % copying, +26.8 % DRC). It is worse than either endpoint.
`strings-design.md` already rules "one migration, not two" on defect-exposure
grounds; the measurement gives the same ruling a second, independent reason.

---

## Appendix — re-deriving every number

Setup (a clean worktree at the commit under test):

```
git worktree add <wt> -b <branch> origin/master && cd <wt>
(cd scripts/vl-host && cargo build --release)
./scripts/refresh-compiler.sh
git log --oneline -1        # print this at the top of any census you quote
```

**A. The GC layouts (§1.2).** Read from the vendored crate sources:
`~/.cargo/registry/src/*/wasmtime-environ-47.0.2/src/gc.rs`
(`common_array_layout`, `common_struct_or_exn_layout`,
`byte_size_of_wasm_ty_in_gc_heap`) and `src/gc/{null,copying,drc}.rs`
(`HEADER_SIZE`, `ALIGN`); the alloc-time rounding in
`~/.cargo/registry/src/*/wasmtime-47.0.2/src/runtime/vm/gc/enabled/{null,copying}.rs`
(`fn alloc`, `fn alloc_raw` — copying does `checked_next_multiple_of(ALIGN)`).

**B. The allocation probes (§1.3).** One generated VL file per (mode, N, L),
prebuilt then run; the loop bodies are listed in §1.3. The measurement is
`peak RSS(mode) − peak RSS(nop)` at the same L, divided by N = 2 000 000:

```
vl build probe.vl -o probe.wasm
VL_GC=none    /usr/bin/time -v vl run probe.wasm 2>t; grep 'Maximum resident' t
VL_GC=tracing  ... ;  VL_GC=refcount ...
```

Under `VL_GC=none` nothing is collected, so the delta is exactly total bytes
allocated. Under `tracing` peak RSS carries a ~2× semispace factor; under
`refcount` it lands within 1–6 % of the layout.

**C. The length histogram (§1.6).** No compiler modification — the program
imports the compiler's own lexer and `std:fs`, tokenizes all 27 `compiler/*.vl`,
and buckets `tokens[i].text.length` by `tokens[i].kind` plus
`comments[c].text.length`:

```vl
import { tokenize } from "./compiler/lexer"
import { readTextFile } from "./std/fs"
// hist[cls * 130 + min(len,129)] += 1  for every token and comment of every file
```

Note VL has no `string + i32`, so each histogram cell is emitted as three
separate `print` calls and reassembled by the analysis script.

**D. The non-ASCII literal census (§2.0).** The same driver, walking
`compiler/ tests/ std/ bench/ reference/` with `listDir`/`pathKind`, testing each
`STRING`/`CHAR` token's **decoded `value`** (not the raw lexeme, and not a
regex over the file, which would also match comments) for a code point > 127.

**E. The `aTypeIdx` census (§2.1).** Every command is inline in that section. The
word-boundary form is the one to use; the substring form silently includes
`raTypeIdx`.

**F. The line-continuation defect (§2.7 L3).** The four-line program is inline in
that section; `vl run` it, then run the §C driver over the same file to read the
lexer's `tokens[i].value.length` and see the two answers.
