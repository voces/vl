# Streaming and positional file output in `std:fs` — design proposal

**Status: PROPOSAL, 2026-09-23, awaiting the owner rulings in §6.** Nothing here is built.
Consumer: plumb (`~/plumb/docs/vl-issues.md` PL-020, and the queued PL-009 "streaming I/O").
Every `std:fs` export this adds goes through the `std-api-reviewer` pass before it merges;
§7 is this proposal's own pass against `std-api-review.md`, so the reviewer starts from it.

---

## 1. The problem

`std:fs` reads a file four ways and writes it one way:

| | whole file | a window at a file offset |
| --- | --- | --- |
| read into a new `u8[]` | `readFile(path)` | `readFileRange(path, offset, length)` |
| read into a caller's `Buf` | `readFileInto(path, dst, dstOff)` | `readFileRangeInto(path, offset, dst, dstOff)` |
| write from a `u8[]` | `writeFile(path, data)` | — |
| write from a `Buf` | — | — |

`writeFile` is `O_WRONLY | O_CREAT | O_TRUNC` (`std::fs::write` in the host). So a program
that writes a file must hold ALL of it, as ONE `u8[]`, at once:

- **plumb PL-020** builds a local game store: 145 files of up to ~256 MB (35 GiB in all), each
  assembled in a `Buf`. Each must be copied out into a `u8[]` — a second full copy on the GC
  heap — and the host then copies it a third time (`read_u8_list` → `copy_to_i8_slice` into a
  `Vec`) before `write(2)`. A file larger than the heap cannot be written at all.
- **plumb PL-009** generates ~300 MB of VL source and accumulates it in one giant `u8[]`
  because there is no append and no incremental flush.

The copy's price, from `bulk-copy-design.md` §B (the `Buf` → `u8[]` push loop, 368 MB/s):
~0.7 s per 256 MiB file, ~100 s over 35 GiB — *derived from that measurement, not re-measured
here* — plus 256 MB of transient GC heap per file. The memory, not the time, is what makes the
large case impossible rather than slow.

## 2. What the host has, and how bytes cross

- **The floor is one append-only table**, `fsIntrinsicSlot` in `compiler/typecheck.vl` (15
  slots; six consumers read it; `compiler/driver.vl`'s `blPush` rows declare the signatures).
  A new write is a new slot at the END, never an insertion.
- **A `u8[]` crosses by COPY.** `read_u8_list` (`scripts/vl-host/src/main.rs`) bulk-copies the
  GC array's backing into a `Vec`. That is what `writeFile` pays.
- **A `Buf` crosses IN PLACE.** `__fs_read_into__(path, offset, addr, cap)` looks up the
  module's `memory` export and `read(2)`s straight into `data_mut()[addr..addr+cap]`, answering
  `-EFAULT` for a window outside the memory. The emitter forces the memory into existence when
  that slot is used (`fsSlotWritesMemory`). The write-side mirror reads `data()` instead.
- **Failure is `-errno` in the return plus the per-instance errno cell** — WASI numbering,
  mapped by `wasi_errno`. A write import returns `0` / `-errno` like `__fs_write__`.
- **Three hosts.** `scripts/vl-host/src/main.rs` and `scripts/wasmtime-host.rs` implement the
  floor; `tests/support/runWasm.ts` registers a THROWING stub for every fs slot, because a
  WasmGC `u8[]` is opaque to JS. (A `Buf`-sourced write is the one shape JS could half-serve —
  linear memory IS visible to JS — but its path is still a `u8[]`, so it stays a stub.)
- **VL has no destructors, no `defer`, no `using`, and WasmGC has no finalizer.** A value
  cannot run code when it becomes unreachable, and a block cannot run code on exit. This is the
  fact that decides option (b).

## 3. How peers shape it

| | whole file | append | positional | streaming handle | how a handle closes |
| --- | --- | --- | --- | --- | --- |
| Rust | `fs::write` | `OpenOptions::append` | `FileExt::write_all_at` (unix) | `File` + `Write` + `Seek` | `Drop` |
| Go | `os.WriteFile` | `O_APPEND` open flag | `(*File).WriteAt` | `*os.File` | `defer f.Close()` |
| Node | `fs.writeFile` | `fs.appendFile` | `fs.write(fd, buf, off, len, pos)` | fd / `createWriteStream` | manual `close` |
| Deno | `Deno.writeFile` | `{ append: true }` option | `seek` + `write` | `Deno.FsFile` | `using` / manual |
| Zig | `Dir.writeFile` | open + `seekFromEnd` | `File.pwriteAll(bytes, off)` | `std.fs.File` | `defer file.close()` |
| WASI p1 | — | `fdflags.append` on `path_open` | `fd_pwrite` | every write is on an fd | `fd_close` |

Two readings. **Every peer's streaming story is a handle, and every peer pairs the handle with
a scope-exit mechanism** — `Drop`, `defer`, `using`. VL has none of the four. And **append is
never a boolean on the write call except in Deno**, whose `{ append: true }` is exactly the
option-flag shape `std-api-review.md` §2 is critical of; Node, Rust and Go give it its own name
or an open mode. The positional write (`pwrite`) is universal and needs no handle to MEAN
anything — only to be cheap, which §4(b) measures.

---

## 4. The options

### (a) Whole-file helpers only — `appendFile`

```vl
// Add `data` to the end of the file, creating it when absent.
export function appendFile(path: string, data: u8[]): IoResult

writeFile(out, [])                         // start fresh — or a rerun doubles the file
for chunk in chunks { const e = appendFile(out, chunk); if e != null { return e } }
```

- **Conventions.** Error channel and naming fit (`IoResult`, path-first, repeats its module).
  But its offset is AMBIENT — the file's current length, a state the call reads and mutates —
  so it is the one write whose result depends on every earlier call, and it is not
  idempotent: a program re-run after a crash appends a second copy. It also needs the
  truncating `writeFile(out, [])` first, an order dependence the types cannot state.
- **What it solves.** PL-009's accumulation. Not PL-020: the source is still a `u8[]`, so the
  `Buf` → `u8[]` copy remains.
- **What only it can do.** `O_APPEND` is atomic per write against OTHER PROCESSES appending the
  same file (a shared log). Positional writes cannot give that. No consumer asks for it today.
- **Host.** One slot, `__fs_append__(path: u8[], data: u8[]) -> i32`, `OpenOptions::append`.

### (b) A file handle — `openFile` / `writeHandle` / `closeFile`

```vl
export type FileHandle = new i32
export function openFile(path: string, mode: "write" | "append"): FileHandle | IoError
export function writeHandle(self: FileHandle, data: u8[]): IoResult
export function writeHandleAt(self: FileHandle, offset: i64, data: u8[]): IoResult
export function closeFile(self: FileHandle): IoResult

const f = openFile(out, "write")
if f is IoError { return f }
for chunk in chunks { const e = f.writeHandle(chunk); if e != null { f.closeFile(); return e } }
f.closeFile()
```

- **Explicit resource, and nothing enforces it.** With no destructor or scope exit (§2), a
  forgotten `closeFile` leaks an OS descriptor until the process ends; every early `return`
  must close by hand, as above. `std-api-review.md` §3 names "must be paired with a cleanup
  call" as the pattern a caller gets wrong, and this is that pattern with no backstop.
- **Use-after-close is a runtime `EBADF`, not a type error**: a `new i32` brand is copyable, so
  a closed handle and an open one are the same type. Worse, a recycled descriptor number makes
  a stale handle write into a DIFFERENT file unless the host keeps generation counters.
- **Ambient host state**: a per-instance descriptor table, the first in the floor. The cursor
  (`writeHandle`) is a second ambient state; `writeHandleAt` avoids it.
- **Names.** No namespace import, so a bare `write` / `close` would collide; the names grow.
- **What it buys, measured** (Python `os.open`/`pwrite`/`close`, ext4, this box at load ~3,
  min of 3 — the per-call reopen a handle saves; the Rust host itself was not measured):

  | chunk | total | reopen per write | one descriptor | reopen cost |
  | --- | --- | --- | --- | --- |
  | 1 MiB | 256 MiB | 0.038 s | 0.037 s | ~3% |
  | 64 KiB | 256 MiB | 0.042 s | 0.037 s | ~13% |
  | 4 KiB | 256 MiB | 0.127 s | 0.066 s | 1.9× |
  | 256 B | 64 MiB | 0.322 s | 0.097 s | 3.3× |

  About 1 µs per open. At the chunk sizes plumb writes (MiB-scale `Buf` windows) a handle saves
  a few percent. At line-sized writes it saves 3×, but even WITH a handle a 256 B write is ~10×
  slower per byte than a 64 KiB one — so small writes need BUFFERING (accumulate in a `Buf`,
  flush in chunks) whether or not there is a handle, and once buffered the handle's saving is
  the few percent above.
- **Host.** Four slots plus the descriptor table, in both Rust hosts, cleared per instance.

### (c) Positional one-shot writes, no handle — `writeFileRange`

```vl
// Write `data` at byte `offset` of the file, creating it when absent. Never truncates: bytes
// past the end of `data` keep their old values, and a gap past the old end reads as zeros.
export function writeFileRange(path: string, offset: i64, data: u8[]): IoResult

writeFile(out, [])                         // start fresh
let at: i64 = 0
for chunk in chunks {
  const e = writeFileRange(out, at, chunk)
  if e != null { return e }
  at = at + chunk.length
}
```

- **This is `readFileRange`'s shape on the write side**, and `std-notes.md` already argues it:
  "every call carries its own offset, so there is no cursor to get wrong, no order dependence
  between two calls, and nothing to close. The price is one `open`+`seek` per window, paid
  deliberately." §4(b)'s table prices that at ~1 µs.
- **Idempotent.** The same call twice leaves the same file; a rerun after a crash rewrites
  rather than duplicates. Chunks may be written in any order (a file whose header is patched
  last, as archive formats want).
- **Two edge cases, both lossy-looking and both named in the comment**: a write that ends
  before the old end keeps the old tail (so start fresh with `writeFile(out, [])`), and an
  offset past the end zero-fills the gap. Both are POSIX `pwrite`'s semantics in every peer.
- **Host.** One slot, `__fs_write_range__(path: u8[], offset: i64, data: u8[]) -> i32`: open
  `write + create` without `truncate`, then `write_all_at` (Unix) / a `seek_write` loop
  (Windows). Negative offset → `EINVAL`, as `readFileRange`.

### (d) `Buf`-sourced variants — `writeFileFrom` / `writeFileRangeFrom`

```vl
// Replace the file's contents with `len` bytes of `src` from byte `srcOff`. The bytes are not
// copied onto the heap. A window outside `[0, src.length]` is `EINVAL`.
export function writeFileFrom(path: string, src: Buf, srcOff: i32, len: i32): IoResult

// The same bytes written at byte `offset` of the file, as `writeFileRange` writes them.
export function writeFileRangeFrom(
  path: string, offset: i64, src: Buf, srcOff: i32, len: i32,
): IoResult
```

- **The mirror of `readFileInto` / `readFileRangeInto`**, `From` answering `Into`. The host
  reads the guest's linear memory in place: no `u8[]`, no `Vec`, no GC heap. That is PL-020.
- **A length IS needed here, where the read side has none.** A destination's room is
  `dst.length - dstOff` by definition; a source's FILL is not its capacity — plumb assembles a
  file of unknown size in a buffer sized for the largest. So the window is `(srcOff, len)` and
  both are checked against `src.length` in std before the host is called (§6 Q3 is the
  alternative).
- **A forged `Buf`** (ROADMAP row 35) reaches the host with an address it did not allocate; as
  on the read side the host answers `-EFAULT` for a window outside the memory, and within the
  memory it writes whatever is there — the same trust the read side documents.
- **Host.** One slot, `__fs_write_from__(path: u8[], offset: i64, addr: i32, len: i32,
  truncate: i32) -> i32` serving both exports, as `__fs_read_into__` serves both reads.
  `truncate` is a floor argument, not API surface; §7 addresses it. The emitter's
  `fsSlotWritesMemory` generalises to "touches memory" so a program whose only contact with
  linear memory is this call still exports it.

---

## 5. Recommendation

**Complete the matrix with (c) and (d): three exports, no handle, no append.**

| | whole file | a window at a file offset |
| --- | --- | --- |
| write from a `u8[]` | `writeFile` (exists) | **`writeFileRange(path, offset, data)`** |
| write from a `Buf` | **`writeFileFrom(path, src, srcOff, len)`** | **`writeFileRangeFrom(path, offset, src, srcOff, len)`** |

Why this and not the others:

- It solves both asks. PL-020's 256 MB file goes out with ONE `writeFileFrom` and zero heap
  copies; a file larger than memory goes out as `writeFileRangeFrom` windows of a reused `Buf`.
  PL-009's generator buffers text into a `Buf` and flushes each full window with
  `writeFileRangeFrom` — the buffering §4(b) shows is needed anyway.
- It keeps `std:fs`'s header promise — *errors are values, nothing is ambient, no open
  handles* — true. The one order dependence (start fresh with `writeFile(out, [])`) is a
  single documented line, and forgetting it produces a file with a stale tail, not a leak.
- It is the shape the read side already chose for the same reasons, so a caller who knows
  `readFileRangeInto` can guess `writeFileRangeFrom` including its argument order.
- It is cheap to build: two new floor slots, no new ABI shape (a `u8[]` in, i32/i64 scalars,
  an i32 out), no host state.

plumb's PL-020 loop under it:

```vl
import { Buffer } from "std:buffer"
import { writeFileFrom, IoError } from "std:fs"

function writeStore(n: i32): IoError | null {
  const buf = Buffer(256 * 1024 * 1024)
  for i in 0 to n - 1 {
    const used = assembleDataFile(i, buf)            // fills buf, answers bytes used
    const e = writeFileFrom(dataPath(i), buf, 0, used)
    if e != null { return e }
  }
  null
}
```

**Not recommended now: appendFile (§6 Q2) and handles (§6 Q1).** Handles should wait for a
scope-exit construct; when one exists the positional exports above stay correct and a handle
adds only the few percent §4(b) measured.

**Build items** (one PR, native-only like the rest of the floor):

1. `compiler/typecheck.vl` — slots 15 `__fs_write_range__` and 16 `__fs_write_from__` in
   `fsIntrinsicSlot` / `fsIntrinsicNameAt` / `fsIntrinsicCount`, their `declare`s and per-arg
   `u8[]` kinds; `fsSlotWritesMemory` → covers slot 16. `compiler/driver.vl` — two `blPush` rows.
2. `scripts/vl-host/src/main.rs` and `scripts/wasmtime-host.rs` — both handlers; the write
   LOOPS until done (`write_all_at`), so a short count is never success.
3. `tests/support/runWasm.ts` — two names in the throwing-stub list.
4. `std/fs.vl` — the three exports and a header line; `deno task gen-std`; a
   `docs/internals/std-notes.md` §`std:fs` entry for each choice below.
5. Fixtures: an intrinsic pin (`tests/cases/intrinsics/`, `// @skip` for the V8 harness), a
   native test writing a file larger than a `Buf` window, and a round-trip
   `writeFileRangeFrom` → `readFileRangeInto` at an offset past 2^32.
6. `std-api-reviewer` on the `std/fs.vl` diff.

---

## 6. Questions for the owner

**Q1 — Handles: not in v1, or explicit-close now?**
(a) no handles until VL has a scope-exit construct; positional exports only — **recommended**;
(b) a `FileHandle` with explicit `closeFile` now, accepting the leak and `EBADF` risks in §4(b);
(c) handles as a build item gated on a `using`/`defer` language design, filed now so the
dependency is visible. (a) and (c) are compatible: recommend (a) now plus filing (c).

**Q2 — `appendFile`?**
(a) not now — `writeFileRange` with a caller-held offset covers every single-writer case and is
idempotent — **recommended**; (b) add `appendFile(path, data: u8[])` alongside, as the name
callers from Node/Python will look for; (c) add it only when a consumer needs `O_APPEND`'s
cross-process atomicity (a shared log), which positional writes cannot provide.

**Q3 — How is the `Buf` source window spelled?**
(a) explicit `(srcOff, len)` checked against `src.length` — **recommended**, mirrors
`readFileInto`'s `dstOff` and adds nothing to `std:buffer`; (b) a checked `std:buffer` export
`bufWindow(self: Buf, off, len): Buf` and a bare `src: Buf` parameter — fewer arguments here,
one more std name, and it would also serve other APIs taking a `Buf`; (c) whole `Buf` only —
refused: a buffer's capacity is not its fill.

**Q4 — Offset past the end of the file.**
(a) zero-fill the gap, as `pwrite` does everywhere — **recommended**; (b) `EINVAL` when
`offset > fileSize`, which costs a `stat` and a TOCTOU window and forbids patch-last formats.

**Q5 — Is a truncate primitive owed?**
(a) no — `writeFile(out, [])` starts a file fresh, and a file that must END shorter than its
previous contents is written fresh — **recommended**; (b) `setFileSize(path, size: i64)`
(`ftruncate`) now, for rewriting in place without a fresh start.

**Q6 — Does the `u8[]` positional write earn its place, or `Buf`-sourced only?**
(a) both — text generators hold `encodeUtf8` output as `u8[]`, and the 2×2 matrix is what
makes the names guessable — **recommended**; (b) `Buf`-sourced only, one export fewer, at the
cost of every `u8[]` caller staging into a `Buf` first (the copy this design removes).

---

## 7. `std-api-review.md` self-assessment of the recommended surface

- **§0 embedded map.** Build item 4 regenerates `std/embedded.ts`; `tests/std_embedded_test.ts` checks it.
- **§1 conventions.** lowerCamelCase ✓. Union return annotated (`IoResult`) ✓. Path-first, not
  `self`-first — the module's existing, header-stated deviation, applied uniformly ✓. Names
  self-sufficient in a flat namespace and repeat the module (`writeFile…`) ✓. The family is
  uniform: `Range` = at a file offset, `Into`/`From` = through a `Buf`, the same suffixes in
  the same positions as the read side; `writeFileAt` is avoided for the reason `readFileAt` was
  (it reads as "the file at a path") ✓. Header gains "no append" in its does-not-do line.
- **§2 ambient/stateful.** None added: no cursor, no descriptor table; each write answers its
  own `-errno` directly, as `writeFile` does, and the errno cell is not read. ✓
- **§2 order dependence.** One, stated: streaming a file assumes it was started fresh. It
  cannot be typed; it goes in `writeFileRange`'s comment as its edge case. NOTED DEVIATION.
- **§2 boolean parameters.** None exported. The floor's `truncate: i32` is a host-import
  argument no caller spells; two exports carry the distinction by NAME, which is what §2 asks.
- **§2 caller-owned buffers.** `Buf` sources are admitted on the measurement §2 demands:
  `bulk-copy-design.md` §B (the copy is 368 MB/s and 75% of the staged read) plus the memory
  argument in §1 — a second 256 MB copy, and a file larger than the heap unwritable. NOTED.
- **§2 silently lossy.** The kept tail and the zero-filled gap are named in the comment, not
  silent. `writeFileFrom` replaces the file, as `writeFile` does, and says so.
- **§2 names that over-promise.** `writeFileRange` does not truncate and its name does not say
  "file replaced" — `writeFile` and `writeFileFrom` are the two that replace. ✓
- **§2 second error channel / duplication.** None; `IoResult` throughout. `writeFileFrom` ≠
  `writeFileRangeFrom(…, 0, …)` — the first truncates. The `u8[]`/`Buf` pairs mirror the read side. ✓
- **§2 speculative.** Admitted under `std-design.md` D2's WASI-era clause (`std:fs` is named
  there) with an external consumer, as `readFileInto` was for glean. The consumer is NOT in
  the tree; say so in the PR, and prefer a dogfood script that writes a large output as the
  in-tree fixture.
- **§3 composability.** `if e != null` / `e is IoError` ✓; the error type and `Buf` are
  already re-exported, so no second import ✓; no cleanup pairing ✓; the new slots are
  `std:fs`'s own, no cross-module cell ✓.
- **§4 documentation.** Draft comments above are 1–3 lines each, consumer-facing, no ids.

**Expected verdict: CONSISTENT WITH NOTED DEVIATIONS** — the start-fresh order dependence and
the caller-owned source buffer, both justified above and both to be stated in `std/fs.vl`.
