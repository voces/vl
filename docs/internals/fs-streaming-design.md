# Streaming and positional file output in `std:fs` — design, ruled

**Status: RULED (owner, 2026-09-23), not yet built.** The six questions in §6 are answered,
and §5 is the surface they settle, with its build items. §1–§4 are the proposal as the owner
read it and are kept as the record. The ruled surface is not the one §4 recommended: no
`…From` names, an `appendFile`, and contiguous writes only.
Consumer: plumb (`~/plumb/docs/vl-issues.md` PL-020, and the queued PL-009 "streaming I/O").
Every `std:*` export this adds goes through the `std-api-reviewer` pass. §7 is the review of
the ruled surface.

**These are std APIs, but they are not frozen yet.** Owner, 2026-09-23: during this phase a
std API may change if the change is documented. Two rulings below are stated as "for now"
(Q4's contiguity rule and Q1's no-handle rule), and either may relax later without a
deprecation.

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

## 4. The options (the proposal as ruled on; §5 is what was chosen)

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


## 5. The ruled surface

**Three write names, each taking `u8[] | Buf`, plus one view helper in `std:buffer`.**

| | whole file | at a file offset (contiguous) | at the end |
| --- | --- | --- | --- |
| `data: u8[] \| Buf` | `writeFile(path, data)` (widened) | **`writeFileRange(path, offset, data)`** | **`appendFile(path, data)`** |
| a sub-range of a `Buf` | `buf.window(off, len)` passed as `data` (name open, below) | same | same |

Draft signatures and consumer comments, each within `std-api-review.md` §4's 1–4 lines:

```vl
// std:fs
// Replace the file's contents with `data`, creating it when absent. A `Buf` is written
// straight from memory, not copied, and `buf.window(0, used)` writes only its filled part.
// `writeFile(path, [])` empties the file: the fresh start before `appendFile` or
// `writeFileRange`. Whether the replacement is atomic is the host's policy.
export function writeFile(path: string, data: u8[] | Buf): IoResult

// Write `data` over the file from byte `offset`, keeping every byte outside that range.
// `offset` may be at most the file's current length, so a write can extend the file but
// never leave a gap. A larger or a negative offset is `EINVAL`, and the message names the
// offset and the length. Offset 0 creates a missing file.
export function writeFileRange(path: string, offset: i64, data: u8[] | Buf): IoResult

// Add `data` to the end of the file, creating it when absent. Running the same program
// again appends again, so begin with `writeFile(path, [])` when the file should hold only
// this run's output.
export function appendFile(path: string, data: u8[] | Buf): IoResult

// std:buffer
// The `len` bytes of `self` from byte `off`, as a `Buf` over the same memory, not a copy.
// Traps naming the range unless `[off, off + len)` lies inside `self`. A `len` of 0 at
// `off == self.length` is in range.
export function window(self: Buf, off: i32, len: i32): Buf
```

**The union dispatch runs today.** A `u8[] | Buf` parameter narrowed by `if data is Buf`
gives the right arm for an array literal, an annotated `u8[]` local, a `Buffer(16)` and a
hand-written window. A function of the widened type also still binds to a
`(string, u8[]) => i32` value, so widening `writeFile` breaks no existing caller that passes
it as a value. (`/home/verit/vl/dist/vl`, `VL_STD` pinned to this tree, 2026-09-23. The
programs are in §7.)

**The view helper is `window`, chosen by the std review (§7).** The owner asked that it read like the
existing `f32view`/`i32view` and not like `slice`, which copies on arrays. Candidates:

| name | for | against |
| --- | --- | --- |
| **`window` — chosen by the std review** | Says "part of the same bytes" and implies no element type. `buf.window(0, used)` reads naturally at a write call. | Not spelled like `f32view`. A generic word in a flat namespace, though an explicit import is what brings it into scope. |
| `u8view` | Spelled like `f32view`/`i32view`, with the same `(self, off, count)` argument shape, and for bytes count equals length. | Those two return distinct view TYPES with `[]` indexing. This one returns a plain `Buf`, which has no `[]`, so the name over-promises. |
| `view` | Short, and the family word. | Suggests the typed-view family without a width. The most collision-prone name of the four. |
| `bufWindow` | Repeats the module, as `bufferMark`/`bufferRelease` do, so it is self-sufficient in a flat namespace. | Reads oddly as a method (`buf.bufWindow(…)`). |
| `slice` | — | Refused by the owner: on arrays it means a copy. |

**Known gap, accepted:** there is no copy-free partial write from a `u8[]`. `xs.slice(a, b)`
copies. An explicit-offset form (`data, dataOff, len`) is additive and lands only if a
consumer needs it.

**Overloads were considered and not pursued.** Separate `u8[]` and `Buf` functions under ONE
name would need ad-hoc overloading of named functions, and VL has none (`DECISIONS.md` B16:
one binding per name per scope, with operators the only exception). Admitting it would also
first need an answer to what the bare name means as a function VALUE. A union parameter gets
one name per operation without either problem.

plumb's PL-020 loop under the ruled surface:

```vl
import { Buffer, window } from "std:buffer"
import { writeFile, IoError } from "std:fs"

function writeStore(n: i32): IoError | null {
  const buf = Buffer(256 * 1024 * 1024)
  for i in 0 to n - 1 {
    const used = assembleDataFile(i, buf)            // fills buf, answers bytes used
    const e = writeFile(dataPath(i), buf.window(0, used))
    if e != null { return e }
  }
  null
}
```

A file larger than memory, or PL-009's generator, reuses one `Buf` and flushes each full
window with `appendFile(out, buf.window(0, used))` after one `writeFile(out, [])`. To patch a
header after the body is written, use `writeFileRange(out, 0, header)`.

**Build items** (one PR, native-only like the rest of the floor):

1. **Floor**, `compiler/typecheck.vl`: two slots at the END of `fsIntrinsicSlot` /
   `fsIntrinsicNameAt` / `fsIntrinsicCount`, with their `declare`s and per-arg `u8[]` kinds,
   and two `blPush` rows in `compiler/driver.vl`:
   - 15 `__fs_write_at__(path: u8[], offset: i64, data: u8[], mode: i32) -> i32`
   - 16 `__fs_write_from__(path: u8[], offset: i64, addr: i32, len: i32, mode: i32) -> i32`

   `mode` is 0 replace (`O_TRUNC`, offset ignored), 1 at offset (no truncate), or 2 append
   (`O_APPEND`, offset ignored). It is a floor argument that no caller spells, so the three
   exports carry the distinction by name. `fsSlotWritesMemory` becomes "touches memory" and
   covers slot 16. The existing `__fs_write__` (slot 1) keeps serving `writeFile`'s `u8[]` arm.
2. **Contiguity**, in the hosts: mode 1 opens the file, `fstat`s THAT descriptor, and answers
   `-EINVAL` when `offset > size`. Checking the open descriptor narrows the check-then-write
   window to one open file. std rejects a negative offset before the call. On `EINVAL` from a
   non-negative offset, std asks `__fs_size__` for the length its message names. That number
   is the length when the error is reported, which is the one a caller can act on. The
   message keeps `failed()`'s shape:
   `fs.writeFileRange <path>: offset 12 is past the end (length 10)`. If the follow-up size
   read itself fails, the message falls back to `failed()`'s errno rendering; on a missing
   file, which has no size, it reads `length 0`.
3. **Hosts**: `scripts/vl-host/src/main.rs` and `scripts/wasmtime-host.rs`. Both handlers LOOP
   until every byte is written (`write_all` / `write_all_at`), so a short count is never
   success. Slot 16 reads `data()[addr..addr+len]` in place and answers `-EFAULT` outside the
   memory, mirroring `__fs_read_into__`.
4. **`tests/support/runWasm.ts`**: two names in the throwing-stub list.
5. **`std/fs.vl`**: widen `writeFile`, add `writeFileRange` and `appendFile`, and rewrite the
   header within its 10 lines, replacing lines rather than adding any (the reviewer's draft
   is in §7). **`std/buffer.vl`**: add `window`, and change header line 7 to "Only the typed
   views, `window` and `storeBytes`/`loadBytes` check a range and trap". The helper is NOT
   re-exported from `std:fs`. Then run
   `deno task gen-std` and add a `docs/internals/std-notes.md` `std:fs` entry covering four
   choices: the union source, contiguity, append, and `writeFile` now PROMISING to create a
   missing file (its old comment left that to the host).
6. **Fixtures**: an intrinsic pin for each slot (`tests/cases/intrinsics/`, `// @skip` for the
   V8 harness), plus native tests for:
   - a `Buf` window round-trip through `writeFile` → `readFileInto`;
   - `appendFile` twice doubling a file, and `writeFile(p, [])` resetting it;
   - `writeFileRange` at `size` extending the file, at `size + 1` refused with both numbers
     in the message, and at an offset past 2^32 on a file already that long;
   - `window` trapping outside its `Buf`.
7. **`std-api-reviewer`** on the `std/fs.vl` + `std/buffer.vl` diff. The design-level pass is
   §7; the build still owes the diff-level pass.

---

## 6. Owner rulings

**Q1 — Handles.** **RULED (owner, 2026-09-23): (a) no file handle** until VL has scope-exit
cleanup. Why: a handle with no `defer`/`using`/`Drop` backstop leaks on every forgotten early
return, and positional writes already cover the need. Scope-exit cleanup is filed as a
language design item: `open-rulings.md` §D `scope-exit-cleanup`, and the matching row in
`ROADMAP.md`'s owner-ruling table. A handle is reconsidered once that lands. The positional
exports stay correct beside it.

**Q2 — `appendFile`.** **RULED (owner, 2026-09-23): (b) add `appendFile` now**, against the
proposal's recommendation (a). Why: familiarity for logs. It is the name Node and Python
callers look for, and a log is the common append-only file. Its comment carries the
non-idempotence warning: running the program again appends again, and a fresh start is
`writeFile(path, [])`.

**Q3 + Q6 — How a `Buf` source is spelled, and whether `u8[]` positional writes earn a
place.** **RULED (owner, 2026-09-23): one union source, `data: u8[] | Buf`**, on `writeFile`
(an additive widening), `writeFileRange` and `appendFile`. That makes three write names, with
no `…From` variants. A partial write from a `Buf` goes through a new bounds-checked, copy-free
window helper in `std:buffer` that returns a `Buf` (Q3's option (b), named to match
`f32view`/`i32view` rather than `slice`; §5 lists the candidates). Why: one name per operation instead of a 2×2 matrix. The window
helper also serves every other API that takes a `Buf`. Accepted gap: no copy-free partial
write from a `u8[]` (§5). Overloads were not pursued (B16, §5).

**Q4 — Offset past the end of the file.** **RULED (owner, 2026-09-23): (b), writes are
contiguous for now.** An offset greater than the file's current length is refused with an
error naming both numbers, and `setFileLength` is deferred (it can be added later). Why: a
gap is refused because nothing needs one yet, and refusing now keeps a later relaxation
additive. This is the ruling most likely to relax, for example for patch-last archive formats
that write out of order, under the owner's standing note that std may change in this phase
if the change is documented.

**Q5 — A truncate primitive.** **RULED (owner, 2026-09-23): (a) none.** Why:
`writeFile(path, [])` starts a file fresh, and a file that must end shorter is written fresh.

---

## 7. std API self-review of the ruled surface (`std-api-review.md`)

The build still owes the `std-api-reviewer` pass on its diff (build item 7). This section is
the design-level pass. The reviewer agent's verdict on it follows at the end.

- **§0 embedded map.** Build item 5 regenerates `std/embedded.ts`, and
  `tests/std_embedded_test.ts` checks it.
- **§1 conventions.**
  - lowerCamelCase ✓.
  - Union returns annotated (`IoResult`) ✓.
  - Path-first rather than `self`-first ✓. This is `std:fs`'s existing deviation, stated in
    its header and applied uniformly. `window` is `self`-first, as every `std:buffer` export is.
  - Names repeat the module and stand alone in a flat namespace: `writeFile…`, `appendFile` ✓.
  - `Range` means "at a file offset", the same suffix in the same position as `readFileRange`.
    `writeFileAt` was avoided for the same reason `readFileAt` was: it reads as "the file at
    a path" ✓.
  - The read side's `Into` suffix now has no `From` mirror. The READ side needs `Into`
    because the destination type changes the return type (`u8[]` against a count), while a
    write returns `IoResult` whatever the source. NOTED ASYMMETRY.
- **§2 ambient or stateful.**
  - No cursor and no descriptor table. Each write answers its own `-errno` directly, as
    `writeFile` does, and does not read the errno cell ✓.
  - `appendFile`'s offset is the file's current length, a state that the call both reads and
    changes. NOTED DEVIATION, chosen by the owner (Q2) and stated in its comment.
- **§2 order dependence.**
  - Streaming a file assumes it was started fresh, and `appendFile` repeats on a rerun. The
    types cannot state either, so both comments name `writeFile(path, [])` as the start.
    NOTED DEVIATION.
  - The contiguity rule makes `writeFileRange` calls partly order-dependent: chunk N+1 is
    refused until chunk N has extended the file far enough. That is a loud `EINVAL`, not a
    silent result.
- **§2 boolean parameters.** None exported. The floor's `mode: i32` is a host-import argument
  that no caller spells ✓.
- **§2 caller-owned buffers.** A `Buf` source is admitted on the measurement §2 demands:
  `bulk-copy-design.md` §B (the copy runs at 368 MB/s) plus the memory argument in §1 (a
  second 256 MB copy, and a file larger than the heap cannot be written). NOTED. The window
  aliases its parent by design, and its comment says so.
- **§2 silently lossy.**
  - `writeFileRange` keeps the old tail past the written range, and its comment says so.
  - A gap is refused, not zero-filled, so nothing is invented ✓.
  - `writeFile` replaces the file and says so.
  - A forged `Buf` (`ROADMAP.md` row 35) writes whatever linear memory holds at its address.
    That is the same trust the read side documents, and it is closed by row 35's newtype, not
    here.
- **§2 names that over-promise.** `writeFileRange` does not truncate, and nothing in its name
  suggests it does. `appendFile` does what its name says. For the view helper, `u8view` is the
  candidate that over-promises (see §5).
- **§2 second error channel.** None: `IoResult` throughout. `window` TRAPS on a bad range,
  which is `std:buffer`'s own convention (`storeBytes`, `loadBytes` and the views all trap),
  not a second channel inside `std:fs` ✓.
- **§2 duplicated functionality.**
  - `appendFile(p, d)` is `writeFileRange(p, fileSize(p), d)` done in one call: the offset is
    read and used atomically, and it survives a concurrent appender. It is kept by ruling.
  - `writeFile(p, d)` is not the same as `writeFileRange(p, 0, d)`, because only the first
    truncates.
  - `window` does not duplicate `loadBytes`: that one copies into a NEW `u8[]`.
- **§2 text siblings.** `writeTextFile` exists; no `appendTextFile` is proposed. Text is
  encoded once with `encodeUtf8` at the call, as the header's "bytes first" line says. This is
  a question for the review, not a ruling.
- **§2 speculative.** Admitted under `std-design.md` D2's WASI-era clause (`std:fs` is named
  there), with an external consumer, as `readFileInto` was for glean. The consumer is NOT in
  this tree, so build item 6 supplies in-tree fixtures.
- **§3 composability.**
  - `if e != null` and `e is IoError` work as they do on every other write ✓.
  - `Buf` is already re-exported by `std:fs`, but `window` is not. A caller imports it from
    `std:buffer`, as they already import `Buffer`.
  - No cleanup pairing ✓.
  - The new slots belong to `std:fs`, and there is no cross-module cell ✓.
- **§4 documentation.** The draft comments in §5 are 3 or 4 lines each, written for a
  consumer, with no ids. The `std:fs` header's does-not-do line must be rewritten within its
  10 lines (build item 5).

The union-dispatch witnesses cited in §5, run with `VL_STD` pinned to this tree:

```vl
import { Buf, Buffer, store8 } from "std:buffer"
function win(self: Buf, off: i32, len: i32): Buf {
  if off < 0 || len < 0 || off > self.length - len { __trap__() }
  return { base: self.base + off, length: len }
}
function sink(data: u8[] | Buf): i32 {
  if data is Buf { return 1000 + data.length }
  return data.length
}
const b = Buffer(16)
store8(b, 0, 7)
print(sink([1, 2, 3]))      // 3
print(sink(b))              // 1016
print(sink(win(b, 4, 5)))   // 1005
const xs: u8[] = [9, 9]
print(sink(xs))             // 2
```

and, for the widening, `const f: (string, u8[]) => i32 = sink2` where `sink2` takes
`(path: string, data: u8[] | Buf)`, which prints `2` for a two-byte `u8[]`.

**Self-assessed verdict: CONSISTENT WITH NOTED DEVIATIONS.** These are the start-fresh order
dependence, `appendFile`'s ambient offset (ruled), the caller-owned source buffer, and the
missing `From` mirror of `Into`.

### The `std-api-reviewer` pass (2026-09-23, design level)

**Verdict: CONSISTENT WITH NOTED DEVIATIONS.** It holds on three conditions: name the helper
`window`, fix `std:buffer`'s header line 7, and decide `appendTextFile`. The reviewer judged
all five deviations above adequately justified. The missing `From` mirror of `Into` is
invisible to a caller, so it belongs in `std-notes.md` only.

1. **`appendTextFile` — OPEN, for the owner.** Q2's justification is logs, and logs are
   text. `writeTextFile` sets the pattern of a text sibling for a whole-file write, and an
   append of whole strings never splits a character. The reviewer asks for either
   `appendTextFile(path: string, text: string): IoResult` or a header line refusing it:
   saying nothing will not pass. This doc does not decide it, because the rulings named
   exactly three write names. The build does not start until it is decided.
2. **`std:buffer` header line 7 goes stale.** Fixed in build item 5.
3. **Name: `window`.**
   - `u8view` promises `[]` indexing it does not have, and breaks the view family's
     return-type pattern.
   - `view` is the family word with the width missing.
   - `bufWindow` stutters as a method call.
   - The reviewer probed the flat-namespace risk: an import of `window` beside a
     module-level `const window` fails LOUDLY (`Duplicate binding "window"`, suggesting
     `as`), and a local `const window` shadows it and runs.

   Adopted in §5.
4. **Zero-length case missing from `window`'s comment.** Adopted: the comment now says a
   `len` of 0 at `off == self.length` is in range, and drops the aliasing sentence, which
   `std:buffer`'s header already covers.
5. **"Written in place" was ambiguous.** It read as though the FILE is written in place.
   Reworded, and the new create-when-absent promise is noted for `std-notes.md`.
6. **Pin the contiguity message's shape**, including when the size read fails. Added to
   build item 2.
7. **Trap vs `IoError` is consistent.** A forged `Buf`'s `-EFAULT` renders as `errno 21`,
   as `readFileInto` already does. Naming `EFAULT` is optional.
8. **Do not re-export `window` from `std:fs`.** Adopted in build item 5.

The reviewer's `std:fs` header draft fits in 10 lines, replacing lines rather than adding any:

```
// `std:fs` — reading, writing and appending files, whole or by byte range, and listing directories.
//
//     import { readTextFile, writeTextFile, listDir, IoError } from "std:fs"
//
// Errors are VALUES: every fallible export answers `T | IoError` and nothing traps.
// `IoError`, the errno constants and `errnoName` are also what `std:process` and
// `std:env` answer in. FREE functions, not methods — the thing operated on is the FILE,
// so `path` leads. Contents are bytes, from a `u8[]` or a `Buf` (re-exported from `std:buffer`);
// text is a decoding on top, so a byte range has no text sibling.
// No path manipulation, no open handles, no truncating to a length, no writes past the end.
```

The diff-level pass, including `tests/std_embedded_test.ts`, is still owed at build time
(build item 7).
