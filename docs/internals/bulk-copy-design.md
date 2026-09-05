# Bulk copy between `u8[]` and linear memory — measurement and design

glean's R1 (`~/glean/docs/vl-requirements.md`, from VL-010) asks for a one-instruction bulk copy
`u8[]` → linear memory and back, because `readFile` lands a file in a GC array while its parsers
run over a `Buf`. This is the measurement and the design it settled.

**§E1, §E2 AND §E4 ARE ALL LANDED, as three independent changes.** `std:fs` gained
`readFileInto` and `readFileRangeInto` over one host import, with the destination offset §E1
recommends and no destination length; the owner's decision 1 below was answered "take the `Buf`".
`std:buffer` gained §E2's pair in pure VL, with one owner ruling on top of it recorded in §E3.
§E4 is the emitter half, and it closes the reload but not the guard. The rows in §B and §D stand
as measured; each landed change is re-measured in the PR that shipped it, §E1's in
`std-notes.md` §`std:fs`, §E2's in §E2 below and §E4's in §E4.

**The short answer.** There is no such instruction and there will not be one; the copy is 75% of
the cost of reading a 64 MiB file today, and the fastest thing available is not to make the copy
faster but not to make it. glean's own usage sample says the `u8[]` is a staging buffer in 45 of
46 sites, and its browser harness never sees one at all.

Sibling docs: `buffer-design.md` (the linear-memory tier), `memory-gc-design.md` §1.2 (the
intrinsic audit), `std-api-review.md` (the rubric applied in §F).

---

## A. The ask, graded against the usage sample

`~/glean/src` and `~/glean/tools` hold **46** copy loops of exactly one shape:

```vl
for i in 0 to bytes.length - 1 { buf.store8(i, bytes[i]) }
```

Three facts about that population decide the design:

1. **The array is a staging buffer.** In 45 of the 46 sites the `u8[]` is never read again after
   the loop — only its `.length` is. The one exception is `tools/mpq-ls.vl:22`, and it is a
   shadowing artifact: a second `bytes` is bound at line 43 for a second file.
2. **The browser never has a `u8[]`.** `~/glean/web/render.ts:28-30` asks the module for an
   address and writes the file straight into exported memory — `vl.alloc(file.length)`, then
   `new Uint8Array(vl.memory.buffer, addr, len).set(file)` — and `~/glean/web/README.md` states
   the rule: the only crossings are exported scalars and the exported memory. The copy is a
   native-only artifact of `std:fs.readFile` returning a GC array.
3. **The forensics path does not copy at all.** `tools/dump-scan.vl` and `tools/find-refs.vl`
   walk a 2.3 GB minidump in `readFileRange` windows and scan the `u8[]` directly. R9's work does
   not pass through a `Buf`.

The reverse direction is one site: `tools/mpq-extract.vl:30` builds a `u8[]` from a `Buf` with a
push loop to hand it to `writeFile`.

glean's own note in VL-016 (2026-09-03) says the copy of a 1.4 MB file is inside a 0.04 s run, so
"VL-010 is a shape complaint, not (yet) a speed one". That reproduces: at 1.4 MB the copy is 3 ms
against 48 ms of process start, and at 64 MiB it is 179 ms of a 237 ms operation. **Both halves of
the ask are real, and the shape half is the one glean is paying today.**

---

## B. The cost today

Method: `vl build` once, then `vl run <module.wasm>`, min of 7, box at load 0.83, file in page
cache. VL-030's warning about `vl run` timing including the compile is why each row is a prebuilt
module, and std exposes no clock, so every throughput below is a subtraction against a control
that differs by exactly the loop.

| program | min wall | control | delta | throughput |
| --- | --- | --- | --- | --- |
| args only, no read | 0.0435 s | — | — | process + instantiate |
| `readFile` (64 MiB) | 0.0984 s | args only | 0.0549 s | 1.22 GB/s |
| `readFile` + `Buffer(n)`, no copy | 0.1018 s | — | — | the control below |
| **today's copy loop** | 0.2809 s | + `Buffer` | **0.1791 s** | **375 MB/s** |
| `Buf` → `u8[]` push loop | 0.2789 s | matching | 0.1824 s | 368 MB/s |
| sum over `bytes[i]` | 0.1583 s | `readFile` | 0.0599 s | 1.12 GB/s |
| sum over `buf.loadU8(i)` | 0.1689 s | + `Buffer` | 0.0671 s | 1.00 GB/s |

Two readings worth keeping.

**The copy is 75% of the operation.** Reading a 64 MiB file and staging it costs 0.2374 s net of
process start; 0.1791 s of that is the loop and a further ~0.020 s is the GC array's own
allocation (§D, hand-written control).

**The copy buys no read speed.** A byte read from the `u8[]` is *faster* than one from the `Buf`,
1.12× here and 1.13×/1.38× on two earlier runs, because `bytes[i]` inlines to `array.get_u` while
`loadU8` is a real call. The `Buf` earns its place by being what a host can write into, not by
being quicker to scan.

The emitted loop (`wasm-dis`) shows where the 375 MB/s goes. Per byte: a `ref.cast` and two
`struct.get`s to reload the `u8[]` wrapper, a `select`/`i32.lt_u` bounds guard on top of
`array.get_u`'s own trap, and a `call` to `store8` which does a third `struct.get` for `Buf.base`.

---

## C. What WasmGC offers: nothing that crosses the tiers

The GC MVP's bulk array instructions are `array.copy` (array → array), `array.fill`,
`array.new_data` / `array.init_data` (a passive **data segment** → array) and the `elem` pair.
`memory.copy` and `memory.fill` are linear → linear. **No instruction moves bytes between a GC
array and linear memory in either direction**, and the data-segment pair does not help for runtime
data because a data segment is a compile-time constant.

So the candidates are a loop, a host call, or not doing the copy.

---

## D. The candidates, measured

Hand-written modules assembled with `node_modules/.bin/wasm-as --enable-gc` and run by the same
host, so the JIT and the process cost are the same as the rows above. Baselines: a bare module is
0.0046 s, growing 1025 pages costs 0.0004 s (lazy), and `array.new_default` of 64 MiB costs
0.0198 s — 3.4 GB/s of zeroing that a design which never allocates the array does not pay.

| candidate | how measured | 64 MiB | throughput | vs today |
| --- | --- | --- | --- | --- |
| today's idiom | VL, `buf.store8(i, bytes[i])` | 0.1791 s | 375 MB/s | 1.0× |
| **(a1) std helper, pure VL** | VL fn, base hoisted, `__store_i8__` | 0.0845 s | 794 MB/s | **2.1×** |
| (a2) emitted tight loop | hand wasm, `array.get_u`/`i32.store8` | 0.0748 s | 897 MB/s | 2.4× |
| (a3) the same, unrolled ×8 | hand wasm | 0.0449 s | 1.50 GB/s | 4.0× |
| (b) host import, bound | see below | 0.025–0.056 s | 1.2–2.7 GB/s | 3.2×–7.2× |
| (c) never copy: read into the `Buf` | see below | 0.012–0.055 s | 1.2–5.6 GB/s | **4.3×–20×** |
| — `memory.copy`, for scale | hand wasm, linear → linear | 0.0309 s | 2.17 GB/s | 5.8× |
| — page-cache read, for scale | `dd bs=1M` | 0.0116 s | 5.5 GB/s | 15× |

**(b) is not dead, and the API citation is in the tree.** wasmtime 47 can bulk-read a GC array:
`ArrayRef::copy_to_i8_slice` at `scripts/vl-host/src/main.rs:2890`, already used by every
`u8[]`-taking fs import, and `ArrayRef::new_from_i8_slice` at :2929 for the other direction. The
guest memory is reachable too — a program that uses linear memory exports it as `memory`
(`emit_sections.vl:5501`, confirmed by disassembling a `Buffer` program). So
`__buf_copy_from__(arr, addr, off, len)` is buildable. Its cost is bounded by two measured pieces:
`readFile` + `writeFile("/dev/null")` costs 0.0254 s more than `readFile` alone, which is
`copy_to_i8_slice` of 64 MiB plus a `Vec` allocation plus a `write(2)` that copies nothing, and
the second memcpy is at most `memory.copy`'s 0.0309 s. That is a bound from measured components,
not a measurement of a built prototype.

**(c) is the same host mechanism pointed at the whole problem.** A `readFileInto` reads the file
straight into linear memory: no GC array, no copy, and no 0.0198 s of zeroing. It cannot cost more
than today's `readFile` alone (0.0549 s, which includes the allocation it removes) and cannot cost
less than the raw read (0.0116 s).

**(d) `array.init_data` loses on the ask.** It fills a GC array from a constant data segment. That
is a different requirement — glean's R8/VL-019 wants N zero-filled slots — and it cannot see a
runtime file.

---

## E. The recommendation

**Two exports, in two modules, for two different reasons. The first closes 45 of glean's 46 sites;
the second is the general case and is the one that has to work in a browser.**

### E1. `std:fs` gains a read that lands in linear memory — LANDED

```vl
export function readFileInto(path: string, dst: Buf, dstOff: i32): i32 | IoError
export function readFileRangeInto(path: string, offset: i64, dst: Buf, dstOff: i32): i32 | IoError
```

Each answers the number of bytes written, or why not. The window read is the sibling `dump-scan`
and `find-refs` would use; its length is `dst.length - dstOff`, so it has no separate `length`
parameter to disagree with the destination.

Mechanism: a host import. The fs floor is already nine host-import slots and is native-only by
nature, so this adds no new tier of dependency — unlike `std:buffer`, which is the module the
browser story rests on. `typecheck.vl`'s `fsIntrinsicSlot` and the six consumers it feeds are
append-only and already carry every shape this needs: a `u8[]` argument, i32 arguments, an i32
result. It is a tenth slot, not a new shape.

`Buf` crosses a module boundary here. That is not new — `std:fs` already imports `Utf8Error` from
`std:utf8` — but §3 of the rubric says a caller must be able to spell what an export hands back,
so `std:fs` re-exports `Buf` and its header names the dependency.

### E2. `std:buffer` gains the general bulk pair, in pure VL

```vl
export function storeBytes(self: Buf, off: i32, src: u8[])
export function loadBytes(self: Buf, off: i32, len: i32): u8[]
```

Mechanism: **no compiler change and no host import.** The measured (a1) row is exactly this
function written in VL — hoist `self.base` and `src.length` out of the loop, store with
`__store_i8__` rather than through `store8` — and it is 2.1× today's idiom while working
identically in the browser. It sits beside `fill` and `copyFrom` in the existing `── bulk ──`
section, and it removes the `0 to n - 1` off-by-one (VL-012) from 46 call sites.

**As landed, re-measured by the same method** (64 MiB, prebuilt module, min of 7, control differs
by exactly the loop): `storeBytes` **847 MB/s against today's idiom at 389 MB/s (2.2×)**, and
`loadBytes` **814 MB/s against the push loop at 340 MB/s (2.4×)**. The disassembly shows the base
hoisted into a local outside the loop and the body one `i32.store8` over one `array.get_u`; what
remains per element is the wrapper reload and the `select` guard the next paragraph is about.

**One consequence to know about, priced.** `__trap__("…")` streams its message a character at a
time, so each of the two range checks carries a print loop — which drags the string machinery into
a module that has no strings. An unoptimized numeric kernel importing `std:buffer` grew 1,928 →
4,509 bytes. At `-O3` the module is **byte-identical** to one built before the pair existed, since
nothing calls them. The same reading moves the `none` column of `tests/support/viewBoundsShape.ts`
by +3 call on all eighteen rows and neither optimized column at all; the +4 sget it also carried is
what §E4 gave back.

The 2.1× → 2.4× gap to a hand-written loop is the per-element wrapper reload and the `select`
guard in §B. **The reload half is now closed in the EMITTER** — §E4 has the
shape, the conditions and the measured win — and the guard half is not, for a reason worth
stating: it is only redundant when the loop's own bound is the list's `len`, which is not what
`select` is checking. A list carries spare capacity past `len`, so the guard is what stops a
read in the slack; dropping it needs the bound proved equal to `len`, not merely present.

### E3. The rubric, applied

- **Name.** `readFileInto` / `readFileRangeInto` extend `readFile` / `readFileRange` with the
  destination that distinguishes them, and stay self-sufficient in a flat namespace.
  `storeBytes` / `loadBytes` match `store8` / `store16`'s width-family shape and `fill`'s
  destination-is-the-receiver rule. **The read half was `toBytes` here until the review caught
  what this bullet had not compared** (owner, ruling on the finding): `std:buffer` teaches one
  verb pair — eight `load*`, six `store*` — so a caller who knows `loadU8`/`store8` types
  `loadBytes`; every other `to*` in std (`toJson`, `toString`, `toLowerAscii`, `toUpperAscii`)
  converts the WHOLE receiver and takes no window, which a positional `(off, len)` would be the
  first to break; and `toBytes` is the name a whole-buffer `toBytes(self: Buf): u8[]` will want,
  which is the form the tree actually writes (`buf.loadBytes(0, buf.length)`). `readBytes` was
  considered and refused: `read` is `std:fs`'s verb, and a third verb for one export makes
  `b.readBytes` and `b.loadU8` two words for one act.
- **`self` first?** `std:buffer`'s pair yes; `std:fs`'s no, and for the reason its header already
  gives — the thing operated on is the file, so `path` leads.
- **Second error channel?** No. `T | IoError` in `std:fs`, the module's existing model. This
  paragraph used to say the `std:buffer` pair does not fail — that a short `src` is fewer bytes
  rather than an error, like every other export in the module. **The owner ruled otherwise
  (2026-09-05): both trap, naming the range.** It is `buffer-design.md` §J3's carve-out applied a
  third time, not a new policy: §A4 declines a VL-level check because the ENGINE's trap is the
  memory-safety proof, and past the end of a `Buf` but still inside the memory is exactly where
  that proof does not reach — which is why the typed views already check. An over-long range here
  hands `writeFile` or a decoder a `u8[]` whose tail is a neighbouring buffer's bytes, with
  nothing to tell it apart. `__trap__` and not `T | E`, because that is the ruled channel for a
  caller bug (`error-handling-design.md`), this module has no error type and traps in `Buffer`,
  `bufferRelease` and all eight view accessors, and `std:array`'s `filled` sets the message shape.
  A clamped short answer would be worse than either: `out.length` would lie about the request.
  The module header and the `── bulk ──` section blurb both say which exports check.
- **Boolean parameters?** None.
- **Silently lossy?** `readFileInto` truncates at `dst.length - dstOff`, and the returned count is
  what says so — a caller comparing it against `fileSize` sees the truncation. This is the one
  place the design owes a sentence in the header rather than a type.
- **Out-parameter / caller-owned buffer?** Yes, and §2 of the rubric demands the measurement that
  says the copy mattered. §B and §D are it: 0.1791 s of 0.2374 s.
- **Duplicated functionality?** `storeBytes` is not `copyFrom` (that is `Buf` → `Buf`) and not
  `array.copy` (GC → GC). No overlap.
- **Speculative?** No: 46 call sites in the tree that motivated it.

### E4. The emitter's list-header hoist reaches a loop that calls a memory intrinsic — LANDED

**The hoist itself is not new, and neither is its coverage of `u8[]`.** `loopHoistOpen`
(`compiler/wasmEmit.vl`) has cached a list's backing and `len` above a loop since the list-header
change, and the packed byte list has a row kind of its own. What declined was any loop body
carrying a **call** — a call may reallocate a list through a param, capture or global, so the
whole loop's hoist was refused rather than one row. That is why §B's disassembly of the copy
idiom shows a wrapper reload per element and §E2's `storeBytes` did too: the body's only call is
`__store_i8__`.

**The lifted condition, exactly.** A call is now hoist-safe when it lowers to LINEAR-MEMORY
instructions and nothing else: the callee is a bare identifier, unshadowed in that function, in
the load / store / bulk / memory-size families. Every operand of such a call is a number and the
lowering is one instruction, so no GC object is reachable from it and no list's `backing`/`len`
can move across it. Every other call still declines the whole loop, `.push` included — a member
callee is not a bare identifier. The rebinding, nullable-receiver and reallocation conditions are
unchanged, and the guard is not weakened: the cached `len` is the same value the per-access read
would have found, so an out-of-range index traps on the same iteration.

**Measured** in USER CPU SECONDS — the box these ran on is shared, and wall clock there could not
resolve 10% while CPU seconds read the same value to ±1 tick across nine runs. 512 MiB per sample,
prebuilt module, medians of 9 interleaved runs alternating which arm leads, net of a control
differing by exactly the loop:

| engine | `storeBytes` | `loadBytes` |
| --- | --- | --- |
| wasmtime (`vl run`) | 0.55 → 0.51 s, **1.08×** | 0.52 → 0.41 s, **1.27×** |
| V8 (the corpus oracle's engine) | 1.57 → 1.54 s, **1.02×** | 1.16 → 1.17 s, **1.00×** |

**The win is wasmtime's, not the language's.** V8 already folds the reloads — it can see that
`i32.store8` cannot alias a GC struct field — so the emitter is buying back what one engine's
optimizer does for free and the other's does not. Eight unaffected programs read 1.00 on both.

Nothing else in §B moves: rows 4 and 5 call `store8` / `.push` and still decline, and rows 6 and 7
were already hoisted or index nothing. **A call-free byte scan is therefore not what this buys**:
`find-refs`'s walk of a 2.3 GB dump indexes a `u8[]` with no call in the body and has been hoisted
all along.

**What remains** is the `select` guard, and it is not redundant in general. A list's backing is
allocated with spare capacity past `len`, so the guard is what maps an index in the slack onto a
trapping one; dropping it needs the loop's own bound proved EQUAL to the cached `len`, which is a
value-flow question the hoist does not ask. `storeBytes` is the shape where that proof is
available (`const n = src.length`, `while i < n`).

---

## F. Risks, and what the owner decides

**A runtime helper is one more function per module — measured, and it is small.** The (a1)
prototype module is 29,332 bytes against 29,201 for the same program with no copy at all
(+131 bytes for the function and its call site) and 29,297 for the inline loop it replaces
(**+35 bytes**). The seed is unaffected: `compiler/*.vl` imports no `std:` module, so
`build/vl-compiler.wasm` does not move by a byte and `scripts/seed-size.py` has nothing to say.

**The host import is the real cost of E1**, and it is a cost in the same currency VL-011 is about.
Every module importing `std:fs` already carries nine; a tenth changes no architecture. But it does
mean `readFileInto` is native-only, which is correct — so is `readFile`.

**A `Buf` destination outlives a `bufferRelease`.** `readFileInto` writes through a `Buf` the
caller allocated, and `std:buffer`'s LIFO contract already says a `Buf` allocated after a released
mark dangles. Nothing new, but the header should not pretend the destination is checked.

Three decisions are the owner's; all three are ANSWERED:

1. **Does `readFileInto` take a `Buf` or a raw address?** ANSWERED 2026-09-05: the `Buf`. A `Buf`
   makes `std:fs` depend on `std:buffer` and re-export its type; an `i32` address avoids that and
   is worse at every call site, because it drops the length the truncation is measured against.
   The dependency's price turned out to be measurable and is recorded in `std-notes.md`: every
   `std:fs` program now carries a linear memory and its `memory` export.
2. **E2 alone, or both?** ANSWERED: both, independently. E2 is a pure std addition with no
   compiler and no host change and closes the shape complaint — the half glean says it is actually
   paying at its file sizes. E1 is where the 4×–20× is.
3. **Is the emitter's `u8[]` loop hoist scheduled here or on its own?** ANSWERED: on its own, and
   it landed as §E4. The clause "on every byte loop in the language" was wrong twice — a call-free
   byte loop was already hoisted, so what the change reaches is the loop that calls a memory
   intrinsic, which is `storeBytes` and `loadBytes` and not `find-refs`'s scan; and the 1.1×–1.4×
   is wasmtime's alone (1.08× / 1.27×), since V8 folds the reload itself (1.02× / 1.00×).

---

## Reproducing

The measured programs are eleven small files; each pairs with a control that differs by exactly
the loop under test. `vl build` each, then time `vl run` of the module (min of 7) with the file in
page cache, and subtract the control. The hand-written modules assemble with
`node_modules/.bin/wasm-as --enable-gc --enable-reference-types`, plus `--enable-bulk-memory-opt`
for the `memory.copy` row. Every native probe needs `VL_STD` and `--compiler` pointed at the
tree under test.
