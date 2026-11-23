# One module in several workers over one shared memory

How to run the same VL module in an owner worker and N helper workers that share one linear
memory: what each instance does when it starts, where the shared state lives, how to wire the
memory in the host, and the `std:atomic` operations that coordinate the workers. The worked
example is a band sum: helpers split a full-map pass into horizontal bands, and the result does
not depend on how many helpers there are.

The memory's growth (no detach, stale-length views) is in [costs.md](costs.md#host-views-of-linear-memory).
Only the LINEAR memory is shared: each instance keeps its own GC heap and globals, so lists,
strings and records never cross between workers. What crosses is bytes in a `Buf`.

## Three facts about a shared-memory instance

Each answer was read from the compiler's output and a probe run (Deno 2.9.6, V8), not from
docs. The probes are pinned in `tests/vl_shared_memory_bands_test.ts` and
`tests/vl_shared_memory_test.ts`.

### 1. Every instance runs the module's top-level code

Top-level code compiles to the wasm start function (`(start $47)` in the disassembly), and the
engine runs it at every instantiation. You cannot skip it. This probe's top-level code bumps a
shared word and allocates:

```vl
import { Buffer } from "std:buffer"
const hits = __atomic_rmw_add_i32__(64, 1)
const top = Buffer(16)
let mine = 0
mine = mine + 1
```

Two instances, A then B, over one memory. The host writes a word between them:

```
after A instantiated: word64 = 1  A.startHits = 0  A.topBase = 1032  A.myGlobal = 1
after B instantiated: word64 = 2  B.startHits = 1  B.topBase = 1048  B.myGlobal = 1  A.myGlobal = 1
A's byte-1200 word survives B's instantiation: 5eed
```

* Top-level code ran twice. Each instance's module-scope `let`/`const` is its own, so `mine`
  is 1 in both.
* A top-level `Buffer(16)` allocated in each instance, at different addresses.
* Instantiating B wrote nothing else into the shared memory. VL's only data segment is
  passive: it holds trap messages and is never copied into linear memory.

**How a helper avoids re-initialising the owner's state:** top-level code must not write
shared memory. Put the owner's setup in an exported function (`setup` below) that only the
owner calls. It allocates the shared structures and answers one address, the control block.
The host passes that address to each helper's entry point. Module-scope values that every
instance can compute for itself (constants, lookup tables in its own GC heap) are fine at top
level.

### 2. `std:buffer`'s allocator keeps its pointer in the shared memory

In a `--shared-memory` build, `Buffer` claims space with an `i64.atomic.rmw.cmpxchg` on the
heap's first 8 bytes. An unshared build uses a plain global instead. The per-instance global
that remains only records where this instance's own last run ended, so that `bufferRelease`
can tell its own allocations from another instance's. Two instances of one module over one
fresh memory, alternating `Buffer(64)`, `Buffer(64)`, `Buffer(8)`, `Buffer(100)`, `Buffer(4)`:

```
P,Q,P,Q,P bases: 1032 1096 1160 1168 1272  header word @1024 = 248
```

The ranges do not overlap, and every instance may call `Buffer`. The first `Buf` is 8 bytes past
`--heap-base`, because the header takes those 8 bytes. `bufferRelease` frees only the caller's
own allocations at the top, so a helper's scratch `Buf`s cannot free the owner's.
`tests/vl_shared_memory_test.ts` races up to 4 workers × 10,000 allocations and checks that none
overlap.

### 3. `--shared-memory` alone exports the memory; add `--import-memory` to share one

```
alloc-shared-imp.wasm imports: [{"module":"env","name":"memory","kind":"memory"}] exports: []
alloc-shared-def.wasm imports: [] exports: [{"name":"memory","kind":"memory"}]
defined: two instances get two memories: true  SharedArrayBuffer: true  first bases: 1032 1032
```

`--shared-memory=<pages>` without `--import-memory` DEFINES a shared memory and exports it, and
each instance gets its own. That build suits one instance whose memory a render thread reads.
For several instances, build with **both** flags. The host then creates the memory once and
passes it to every instance as `env.memory`:

```sh
vl build sim.vl -o sim.wasm --import-memory --shared-memory=4096
```

```js
// Owner side: one memory, one compiled module, posted to every worker.
const memory = new WebAssembly.Memory({ initial: 1, maximum: 4096, shared: true });
const module = await WebAssembly.compile(bytes);
for (const w of workers) w.postMessage({ module, memory });
// In each worker:
const { exports } = await WebAssembly.instantiate(module, { env: { memory }, imports });
```

The `maximum` must be present, and it must not exceed the `<pages>` the module was built with.
The page needs cross-origin isolation (COOP/COEP headers) for `SharedArrayBuffer` to exist.

## `std:atomic`

`std:atomic` provides i32 atomics on a `Buf` word. They work as methods once imported, like
`std:buffer`'s loads:

| call | does | answers |
| --- | --- | --- |
| `b.atomicLoadI32(off)` / `b.atomicStoreI32(off, v)` | read / write the word | the word / nothing |
| `b.atomicAddI32(off, v)`, `Sub`, `And`, `Or` | `word = word op v` | the old word |
| `b.atomicExchangeI32(off, v)` | `word = v` | the old word |
| `b.atomicCompareExchangeI32(off, expected, v)` | `word = v` if it held `expected` | the old word |
| `b.atomicWaitI32(off, expected)` | block while the word holds `expected`, until notified | `"woken"` or `"not-equal"` |
| `b.atomicNotify(off, count)` | wake up to `count` waiters on the word | how many it woke |

Every operation is sequentially consistent. Each call traps unless `[off, off + 4)` is inside
the `Buf`, or when the address is not a multiple of 4. `atomicWaitI32` traps over an unshared
memory and on a browser's main thread, so only workers may block. The owner in the pattern
below is a worker too. A wake does not promise that the word changed, so always wait in a loop
that re-reads it.

The module provides no barrier or lock; build them from these operations. A generation barrier
for `n` parties, in a `Buf` of two words (pinned with four workers by
`tests/fixtures/shared-bands/barrier.vl`):

```vl
// Word 0 counts arrivals this round, word 4 is the round number.
function barrier(b: Buf, n: i32) {
  const round = b.atomicLoadI32(4)
  if b.atomicAddI32(0, 1) + 1 == n {
    b.atomicStoreI32(0, 0)
    b.atomicAddI32(4, 1)
    b.atomicNotify(4, n)
  } else {
    while b.atomicLoadI32(4) == round { b.atomicWaitI32(4, round) }
  }
}
```

## The pattern: an owner, a job counter, and bands

`tests/fixtures/shared-bands/bands.vl` is the whole module. `tests/vl_shared_memory_bands_test.ts`
runs it with 0, 1, 2 and 3 helpers and checks every total and every cell against a serial
model, bit for bit.

* **The control block** is a `Buf` of i32 words: `GEN` (the tick that wakes helpers, -1 to
  stop), `TICK` (the tick a claimed band belongs to), `NEXT` (the job counter), `DONE` (bands
  finished), then the layout (`WIDTH`, `HEIGHT`, `BANDS`, and the grid and partials
  addresses). The owner writes the layout words in `setup`, before any helper starts.
* **The owner's `tick(ctl, t)`** stores `TICK = t`, then `DONE = 0`, then `NEXT = 0`, then
  `GEN = t`. It notifies `GEN`, drains bands itself, and waits on `DONE` until it equals
  `BANDS`.
* **A helper's `serve(ctl)`** waits on `GEN` until it changes, then drains: it takes
  `band = atomicAddI32(NEXT, 1)` until the band number reaches `BANDS`. It runs each band,
  bumps `DONE`, and the helper that finishes the last band notifies the owner. When `GEN` is
  -1 it returns.
* **The tick is read after the claim.** A helper can still be draining tick t when the owner
  resets `NEXT` for tick t + 1, and its next claim then wins band 0 of the new tick. That band
  must use t + 1. Because `TICK` is stored before `NEXT`, a claim that sees the reset also sees
  the new tick. Passing in the tick the helper was woken for would be a race.
* **Determinism.** Band b writes only rows `[b·H/BANDS, (b+1)·H/BANDS)` and its own f64
  partial. The owner adds the partials in band order. Which worker ran a band, and when, never
  reaches a result, so every helper count gives the same bits. Floating-point addition is not
  associative, so a shared accumulator updated as bands finish would not be deterministic.

Allocate in `setup` and pass addresses to the helpers. A helper may call `Buffer` for scratch
space: the allocator is shared, so its `Buf` cannot overlap another's.
