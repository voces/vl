# strings/substr-search — root cause

**Verdict: compiler-fixable.** VL's `String.indexOf` builtin is lowered as a *naive
O(n·m) scan that re-loads the needle character from its GC array on every candidate
position*. It is the only one of the four runtimes with no skip heuristic at all, and
it is the only one that spends two bounds-checked loads per position where one would
do. A hand-patched Boyer-Moore-Horspool in the emitted module — same source, same
representation, no language change — takes the benchmark from **1103 ms to 352 ms
(3.13x)**. The residual gap to deno/CPython after that is representation + engine
(WasmGC has no bulk find/compare, so no SIMD is reachable), which is a separate,
smaller finding.

Site to change: `emitStrIndexOf`, **`compiler/wasmEmit.vl:7437`** (dispatched from
`compiler/wasmEmit.vl:13555`, classified in `compiler/emit_classify.vl:4730`).
Its own doc comment concedes the point: *"Mirrors the host's `__string_index_of__`
naive O(n\*m) scan."*

---

## 1. Reproduced

min-of-7, `taskset -c 2-5`, exclusive use of the box, VL measured from a **prebuilt**
module (`vl run <f.wasm>`) so no compile time is inside the number.

| runtime | total | vs VL |
| --- | ---: | ---: |
| rust -O | **41 ms** | 26.9x faster |
| deno 2.9 | **142 ms** | 7.8x faster |
| python3 3.11 | **142 ms** | 7.8x faster |
| VL `-O0` | **1103 ms** | 1.00x |
| VL `-O3` | **1152 ms** | **0.96x — `-O3` is 4.4% WORSE, reproducibly** |

All eight configurations print `3173880`. Matches the flagged numbers; the benchmark
is not void:

| PASSES | VL total |
| --- | ---: |
| 0 (setup only) | 41 ms |
| 60 | 1265 ms |
| 120 | 2514 ms |

2.0x for 2x work — nothing was folded. Setup (build the 1 M-char text + 16 needles)
is 41 ms of which ~11 ms is `vl run` startup, so **the search itself is ~1062 ms**.
The workload is 60 passes × 16 needles = 960 searches, of which 480 miss and force a
full 1 M-character scan; the other 480 hit within the first ~15 k characters. So the
useful unit is **ns per scanned character over 480 × 1 M = 480 M characters**.

| | search ms | ns/char |
| --- | ---: | ---: |
| rust `str::find` | 39 | **0.081** |
| deno `String.indexOf` | 127 | 0.265 |
| python `str.find` | 130 | 0.271 |
| VL `indexOf` | 1062 | **2.213** |

---

## 2. What the emitter actually emits

`vl build` produces a 1916-byte module; `indexOf` is **inlined**, not a call. Hot loop
verbatim from `wasm-dis` (func `$1`, `$12` = text, `$13` = needle, `$15` = i, `$16` = j,
`$17` = n, `$18` = m):

```wat
(loop $label1
 (if (i32.gt_s (local.get $15) (i32.sub (local.get $17) (local.get $18)))
  (then)                                    ;; past last start -> fall out -> -1
  (else
   (local.set $16 (i32.const 0))
   (loop $label2
    (if (i32.ge_s (local.get $16) (local.get $18))
     (then (br $block3 (local.get $15))))   ;; full match -> yield i
    (if (i32.ne
          (array.get $0 (local.get $12) (i32.add (local.get $15) (local.get $16)))
          (array.get $0 (local.get $13) (local.get $16)))   ;; <-- SECOND LOAD
     (then (local.set $15 (i32.add (local.get $15) (i32.const 1)))
           (br $label1)))
    (local.set $16 (i32.add (local.get $16) (i32.const 1)))
    (br $label2)))))
```

Three things are wrong with this, in order of cost:

1. **No skip heuristic.** Every one of the n candidate positions is visited. Rust's
   `str::find` runs a memchr'd first-byte skip ahead of a two-way match; V8 escalates
   to Boyer-Moore-Horspool with a bad-character table; CPython runs Crochemore-Perrin
   two-way with a Bloom-filter skip. VL runs the textbook naive loop.
2. **`needle[j]` is re-loaded from the GC array every iteration.** On the overwhelmingly
   common `j == 0` path the loop performs *two* bounds-checked `array.get`s to compare
   one character. Hoisting `needle[0]` into a local is a ~10-line change (§4).
3. Nothing is hoisted out of the outer loop: `i32.sub n m` is recomputed per position.
   Minor next to (1) and (2), and `-O3` does not fix it either.

There is no allocation, no `global.get`, no `ref.cast` and no boxing in the loop — the
scratch slots are wasm **locals** (`strScratchBase + 0..6`, `compiler/emit_state.vl:467`).
So this is *not* a "VL emits sloppy glue" defect. The loop body is about as tight as a
naive search can be. **The algorithm is the defect.**

---

## 3. Bisection — one change at a time

### 3a. Is the builtin worse than user code? No — it is the same code.

Hand-written VL, identical algorithm, using `charCodeAt`:

| VL spelling | total |
| --- | ---: |
| builtin `s.indexOf(needle)` | 1103 ms |
| hand-written naive loop (`probe/A.vl`) | 1225 ms |

The builtin is 11 % *faster* than the userland transcription (it is inlined and skips
the call). So the emitter's lowering quality is fine; only its choice of algorithm is not.

### 3b. What does a better algorithm buy, in pure VL source?

| VL spelling | total | vs builtin |
| --- | ---: | ---: |
| builtin (naive) | 1103 ms | 1.00x |
| first-char skip loop, `c0` hoisted (`probe/B.vl`) | 758 ms | 1.46x |
| Boyer-Moore-Horspool, 256-entry `i32[]` (`probe/C.vl`) | 423 ms | **2.61x** |

**A VL user today gets 2.6x by abandoning the builtin and hand-writing Horspool.**
That is the "users must not need hacks" line being crossed — but it is crossed by a
*builtin*, so the fix belongs in the emitter, not in the user's source.

### 3c. Is the representation the limit? Measured — no, not at this level.

The naive loop costs 2.21 ns/char. VL's floor for **one** bounds-checked `array.get`
per character:

| probe | 480 × 1 M chars | ns/char |
| --- | ---: | ---: |
| VL `charCodeAt` scan-and-count (`probe/D.vl`) | 595 ms | **1.15** |
| deno `charCodeAt` scan-and-count (`probe/D.js`) | 827 ms | 1.69 |
| hand-written WAT, `(array (mut i32))` | 792 ms | 1.65 |
| hand-written WAT, `(array i8)` + `array.get_u` | 630 ms | 1.31 |

Two results here:

- **2.21 / 1.15 = 1.92x — the naive loop costs almost exactly two loads per character**,
  which is the prediction from §2 point (2). The model is confirmed at the
  instruction level.
- **VL's per-character scan is 1.5x FASTER than V8's** (1.15 vs 1.69 ns/char).
  WasmGC `array.get` is not the problem. V8 beats VL on `indexOf` *only* because
  `String.indexOf` drops out of the JS element-at-a-time world into a byte-oriented
  C++ search; VL's `indexOf` never leaves the element-at-a-time world.
- Narrowing the element from i32 to i8 is worth **1.26x** and nothing more (630 vs
  792 ms) — real, but a fraction of the 3.1x the algorithm is worth, and a far larger
  project.

---

## 4. Prototype of the emitter fix — measured

I did **not** edit `compiler/**`. I disassembled the shipped module, replaced *only*
the inlined `indexOf` sequence in func `$1` with new WAT, reassembled with `wasm-as`,
and ran it. Everything else — the text, the needles, the driver loops — is byte-identical
to what `vl build` produced. Both prototypes print `3173880`.

| prototype (patched into the real module) | total | vs shipped | vs deno |
| --- | ---: | ---: | ---: |
| shipped naive | 1103 ms | 1.00x | 7.8x slower |
| **P1** hoist `needle[0]` into a local + first-char skip loop | **653 ms** | **1.69x** | 4.6x |
| **P2** Boyer-Moore-Horspool, `(array (mut i32))` 256-entry table, `& 255` index | **352 ms** | **3.13x** | 2.5x |

P1 is the cheap one and it is **allocation-free**: keep the naive structure, `local.set`
the needle's first character before the outer loop, and make the outer loop's fast path
a single `array.get` + compare + increment. That is ~10 emitted instructions changed in
`emitStrIndexOf` and needs one extra i32 scratch slot.

P2 is the real fix. Shape (WAT, as measured):

```wat
(local.set $tbl (array.new $0 (local.get $18) (i32.const 256)))   ;; fill with m
(loop $tb  ;; for p in 0..m-1: tbl[needle[p] & 255] = m-1-p
 ...)
(local.set $lastc (array.get $0 (local.get $13) (i32.sub (local.get $18) (i32.const 1))))
(loop $sc
 ;; c = text[i+m-1]; if c == lastc verify text[i..i+m-1]; i += tbl[c & 255]
 ...)
```

`& 255` is what makes it sound for VL's code-point strings without a range check: two
distinct code points aliasing one slot can only ever produce a *smaller* shift, which
is always safe. The table can reuse the existing `strScratchBase + 2` ref slot
(`strScrOut`, already type `$0` and unused by `indexOf`), so only **one** new i32
scratch slot is needed beyond `I0..I3`; the frame width is set in
`compiler/emit_sections.vl:689` / `compiler/emit_bytes.vl:854`.

### The one hazard, measured

P2 allocates and fills a 256-entry table **per call**. Measured cost of exactly that
(3 M iterations of `array.new $a 256` + 11 `array.set`, hand-written WAT): **88 ns per
table**. And a short-haystack `indexOf` costs, today, only 28 ns per call:

| probe | 3 M calls | per call |
| --- | ---: | ---: |
| `"the quick brown fox!".indexOf("own")`, shipped naive | 95 ms | 28 ns |
| BMH table build alone (WAT) | 275 ms | 88 ns |

So an unconditional BMH would be a **~4x regression on short strings**. The fix must
be gated: run P1's skip loop always, and escalate to P2 only when
`len(s) >= ~64 && len(sub) >= 2` (88 ns of table build amortizes after ~40 characters
of naive scan at 2.2 ns/char). V8 gates the same way, and for the same reason.

---

## 5. Where the remaining 2.5x goes (after the fix)

At 352 ms VL would still be 2.5x deno and 8.6x rust. That residue is **runtime-engine**,
and §3c is how I know:

- Rust scans at **0.081 ns/byte** = ~12 GB/s. That is `memchr` doing 32 bytes per AVX2
  instruction over a 1-byte-per-char buffer.
- VL's *floor* for touching one character is 1.15 ns (i32 elements) / 1.31 ns (i8
  elements). WasmGC has no bulk-compare, bulk-find or SIMD-over-GC-array instruction at
  all, and wasmtime does not auto-vectorize an `array.get` loop. Element-at-a-time is
  the ceiling, ~14x off Rust per character touched.
- BMH wins by *not touching* most characters (measured: 874 147 positions examined per
  16-needle pass, i.e. ~109 k of 1 M positions per full scan — an average shift of 9.2),
  which is why P2 lands under the 554 ms one-load-per-char full-scan floor.

Closing that last 2.5x needs either a SIMD path (impossible inside WasmGC today) or a
host import that reads the GC array through wasmtime's array API — and a host call
that still reads element-at-a-time buys nothing. **Not worth chasing; the 3.13x is.**

## 6. `-O3` is a small regression, and it is not algorithmic

`wasm-opt --closed-world -O3 --gufa -O3` shrinks the module 1916 -> 1006 bytes but
leaves the double loop structurally intact (`main-O3.wat`: same two `array.get`s, same
`i32.sub n m` inside the loop, `br_if` instead of `if/br`). The 4.4 % is block layout,
not a missed transform. **No optimizer can fix this — the algorithm is not recoverable
from the emitted loop.** Filing it against `-O3` would be the wrong target.

## 7. Secondary, separate finding — the API, not the speed

`indexOf` takes no start offset, and there is no `lastIndexOf`:

```
$ vl run -e 'print("hello world hello".indexOf("hello", 3))'
source.vl:2:26: indexOf expects 1 argument, got 2
$ vl run -e 'print("abcabc".lastIndexOf("abc"))'
source.vl:2:25: no method '.lastIndexOf' on string
```

(`compiler/typecheck.vl:12339-12348`.) "Find every occurrence" therefore requires
`s = s.slice(i+1)` per hit — an O(n) copy per occurrence, quadratic overall. This is a
**language-design** gap and it is why this benchmark had to search 16 different needles
instead of iterating occurrences of one. It does not contribute to the 8.5x measured
here, but it will dominate any real tokenizer/`split`-shaped workload. `std/array.vl`
already ships `indexOf`/`lastIndexOf`/`includes` for arrays; strings have only `indexOf`.

---

## Recommendation, in priority order

1. **`compiler/wasmEmit.vl:7437 emitStrIndexOf` — hoist `needle[0]` into a scratch
   local and make the outer loop a single-load first-character skip.** Allocation-free,
   ~10 instructions, no threshold needed, no risk on short strings. **1.69x measured.**
2. **Same site — escalate to Boyer-Moore-Horspool above a length gate**
   (`len(s) >= 64 && len(sub) >= 2`), 256-entry table indexed `c & 255`, reusing the
   `strScratchBase + 2` ref slot. **3.13x measured** on the benchmark; the gate is
   mandatory (measured 88 ns table build vs 28 ns for a whole short search).
3. Add the `indexOf(sub, from)` overload and `lastIndexOf` (§7) — separate PR,
   correctness/expressiveness, not perf.
4. Do **not** pursue an i8 string representation for this: measured 1.26x, versus 3.13x
   for the algorithm, at vastly higher cost.

## Artifacts

Everything is under `/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/ss/`:
`main.wat` (shipped disassembly), `skip.wat`/`skip.wasm` (P1), `bmh.wat`/`bmh.wasm` (P2),
`probe/A.vl` `probe/B.vl` `probe/C.vl` `probe/D.vl` `probe/D.js` (source-level bisection),
`probe/rep_i32.wat` `probe/rep_i8.wat` `probe/tbl.wat` (representation + table-cost probes),
`probe/short.vl` (short-haystack guard), `t.sh` (min-of-N pinned timer).
No file under `compiler/`, `std/`, `tests/` or `scripts/` was modified.
