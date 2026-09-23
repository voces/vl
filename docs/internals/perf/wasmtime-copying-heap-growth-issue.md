# Draft upstream issue: the copying collector's grow-or-collect rule ignores the semispace

For the coordinator to file at `bytecodealliance/wasmtime`. Everything below the rule was measured on
2026-09-23: the repro on the stock wasmtime CLI 49.0.0, the source references against the crate
47.0.2 that VL pins. Check the references against `main` before filing. Context for VL:
`gc-heap-policy-2026-09.md` beside this file.

---

**Title:** Copying collector: the heap grows only when the live set nearly fills a semispace, so a
long-lived live set is re-copied at every collection

### Summary

With `Collector::Copying` (today's `Auto`), a program that keeps a moderate live set for its whole
run and allocates steadily never gets a bigger heap. The heap settles at the smallest size whose
semispace barely holds the live set, and each collection copies the whole live set to free the small
remainder. In the repro below, a 6.4 MB live set ends on a 16 MiB heap (8 MiB semispaces, 76% full
after every collection) and takes 337 collections. Starting the heap at 64 MiB takes 23 and runs
**8.8× faster**.

Embedders can work around it only with `Config::gc_heap_initial_size`, which is the same size for
every program and costs committed memory for programs that did not need it.

### Repro (stock CLI)

`repro.wat`: 200,000 linked cells held in a global for the whole run, then 20,000,000 short-lived
cells.

```wat
(module
  (rec (type $cell (struct (field i32) (field (ref null $cell)))))
  (global $sum (export "sum") (mut i32) (i32.const 0))
  (global $keep (mut (ref null $cell)) (ref.null $cell))
  (func $main
    (local $i i32)
    (local $s i32)
    (local $t (ref null $cell))
    (local.set $i (i32.const 0))
    (loop $live
      (global.set $keep (struct.new $cell (local.get $i) (global.get $keep)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $live (i32.lt_u (local.get $i) (i32.const 200000))))
    (local.set $i (i32.const 0))
    (loop $churn
      (local.set $t (struct.new $cell (local.get $i) (ref.null $cell)))
      (local.set $s (i32.add (local.get $s) (struct.get $cell 0 (local.get $t))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $churn (i32.lt_u (local.get $i) (i32.const 20000000))))
    (global.set $sum (local.get $s)))
  (start $main))
```

```sh
for h in 0 16777216 67108864 268435456; do
  WASMTIME_LOG=wasmtime=trace wasmtime run -W gc=y,function-references=y \
    -O gc-heap-initial-size=$h repro.wat 2>&1 | grep -c "Begin copying collection"
  /usr/bin/time -f "%U s  %M KB" wasmtime run -W gc=y,function-references=y \
    -O gc-heap-initial-size=$h repro.wat
done
```

wasmtime 49.0.0 (17830bd3c), x86-64 Linux:

| `gc-heap-initial-size` | collections | user CPU | max RSS |
| --- | --- | --- | --- |
| 0 (default) | 337 | 1.14 s | 31 MB |
| 16 MiB | 321 | 1.09 s | 31 MB |
| 64 MiB | 23 | 0.13 s | 80 MB |
| 256 MiB | 5 | 0.10 s | 277 MB |

The last collection at the default reports the state the heap settled in:

```
============ End GC ===========
     GC heap capacity = 0x01000000 bytes
post-GC live-set size = 0x0061a810 bytes
  GC heap utilization = 38.15%
```

The trace calls this 38% utilization. But the copying collector can only use 8 MiB of that heap at a
time, and the live set fills 76% of it.

A real program hits the same case: an x86 decoder holding a 5.6 MB table for its run collects 943
times per pass from a 0 initial size and 89 times from 64 MiB. Removing the held table (walking
the data instead) cut its runtime by ~20%, and raising the initial heap to 256 MiB cut it by 21%.

### Cause

In `crates/wasmtime/src/runtime/store/gc.rs` (47.0.2), a failed allocation goes through
`retry_after_gc_async`, which asks `should_collect_first(bytes_needed, gc_heap_capacity,
last_gc_heap_usage)`. That answers "collect first" while `last_live + bytes_needed <
gc_heap_capacity / 2`. The collect-first branch calls `store.gc(limiter, None, None, ..)`, which
passes no `bytes_needed` and so never grows. It then retries the allocation, and grows
(`grow_gc_heap`) only if the retry fails. (The `n > capacity - last_live` test in
`collect_and_maybe_grow_gc_heap` belongs to the embedder-facing `Store::gc(Some(oom))`, not this
path.)

`gc_heap_capacity` is `GcStore::gc_heap_capacity()`, the whole heap (`heap_slice().len()`). The
copying collector allocates in one semispace, `capacity / 2`, and its `allocated_bytes()` counts
only the active one. So `last_live + bytes_needed < capacity / 2` holds for every live set that
leaves room for the request, and the heap grows only when a collection frees less than the pending
allocation. The "grow once the heap is more than half full" intent is lost. For DRC and null the
whole heap is usable and the rule means what it says. For copying it is off by the factor of two,
and it has no notion of how much of each collection's work is copying survivors.

### Suggested fix

1. **Compare against usable capacity.** Give `GcHeap` a method for the bytes available for
   allocation between collections (the semispace for copying, the whole heap otherwise), and use it
   at both sites: `should_collect_first` (the allocation-failure path in `retry_after_gc_async`)
   and the growth test in `collect_and_maybe_grow_gc_heap` (`Store::gc(Some(oom))`). That alone makes the copying
   heap grow when survivors pass 50% of a semispace.
2. **Grow on survivor ratio after a collection.** For a copying collector the cost per allocated byte
   is `live / (semispace - live)`. At 50% survivors every byte allocated costs a byte copied. A
   policy that grows (doubling) after any collection whose survivors exceed a fraction R of the
   semispace keeps that bounded. On the repro and on the decoder, collection work stops shrinking
   once the live set is about 5% of the semispace, so R well under 0.5 (e.g. 0.25) is a reasonable
   default, perhaps with a `Config` knob.
3. **Let embedders see and steer it** (any of these would have let us fix this host-side):
   - the post-collection live size and the heap capacity, readable from a `StoreContextMut`
     (today `last_post_gc_allocated_bytes` is crate-private, and `gc_heap_capacity` is on `Store`
     and `Caller` but not on `StoreContext`/`StoreContextMut`, so an epoch callback cannot read it);
   - or a callback after each collection;
   - or a public way to request growth (`GcHeapOutOfMemory::new` is `pub(crate)`, so
     `Store::gc(Some(..))` can only be driven by an allocation that already failed).

We looked for host-side workarounds on 47.0.2 and found none that works without a code-generation
cost: `ResourceLimiter::memory_growing` can only veto growth. An epoch callback that allocates a
host-side "balloon" to trigger the grow-first branch does work mechanically, but epoch interruption
alone cost 11–16% on this workload.
