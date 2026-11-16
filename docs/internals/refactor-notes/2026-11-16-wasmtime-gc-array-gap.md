# 2026-11-16 — lane AE4: the same module runs up to 2.8× slower under wasmtime than under V8

`vl run` executes on wasmtime 49.0.5 (the host's pin). The same `-O3` module runs at parity
with node 22's V8 on scalar arithmetic and up to 2.8× slower where it reads GC arrays and
structs. No host `Config` setting closes the gap. It is in Cranelift's lowering of
`array.get`/`struct.get`, not in what VL emits.

## Method

A scratch harness built against the host's `wasmtime = "=49.0.5"` with default features. It
reproduces the `vl run` engine: `gc_config(Collector::Auto)`, `gc_heap_initial_size(256 MiB)`,
`wasm_threads`, `shared_memory`, and no `$VL_ISA`. One environment knob per setting lets the
config change one thing at a time. The harness's matmul time agrees with `vl run` itself:
2.39 s median in the harness against 2.46–2.53 s for `vl run`, which adds compile and startup.
node 22 runs the same bytes with a no-op import object. Every module was built with
`vl build -O3`. Load was 1.0–3.5 on 4 cores.

A first reading of "5×" came from a harness without the `gc-copying` feature. There `Auto`
resolved to the deferred reference-counting collector, and the GC heap started at zero bytes.
Neither matches the host, so that figure is withdrawn.

## Corpus fixtures (`bench/*/main.vl`, start function timed, median of 5)

| fixture | node 22 | wasmtime (host config) | ratio |
| --- | ---: | ---: | ---: |
| arrays/matmul | 893 ms | 2,499 ms | 2.8× |
| arrays/fill-sum | 717 ms | 1,539 ms | 2.1× |
| collections/struct-array-scan | 848 ms | 1,807 ms | 2.1× |
| algorithms/spectralnorm | 1,868 ms | 3,301 ms | 1.8× |
| collections/map-i32 | 647 ms | 1,097 ms | 1.7× |
| arrays/sort-heap | 676 ms | 1,033 ms | 1.5× |
| algorithms/nbody | 3,122 ms | 4,476 ms | 1.4× |
| algorithms/binarytrees | 6,548 ms | 8,200 ms | 1.25× |
| arrays/binsearch | 2,029 ms | 2,381 ms | 1.2× |
| algorithms/mandelbrot | 4,210 ms | 4,128 ms | 1.0× |

mandelbrot is f64 arithmetic with no heap reads, and it is at parity.

## Bisect

Kernel variants, 200 rounds over 4,096 elements, median of 21:

| variant | node | wasmtime |
| --- | ---: | ---: |
| list reads, `%` indexing, `??` over `(i32 \| null)[]` | 4.54 ms | 6.59–8.30 ms |
| the same with `&` instead of `%` | 3.20 ms | 6.53 ms |
| the same with `i32[]` instead of `(i32 \| null)[]` | 1.51 ms | 2.92 ms |
| a plain `for` sum over `i32[]` | 0.28 ms | 0.62 ms |
| `%` arithmetic, no list read | 1.53 ms | 1.57 ms |

So `i32.rem_s` is not the cost, and nor is the union box. A bare array read is.

Host settings, one at a time:

| setting | kernel | matmul |
| --- | ---: | ---: |
| the host's config (`Auto` resolves to copying) | 8.30 ms | 2,388 ms |
| `Collector::Null` | 7.67 ms | 2,434 ms |
| `Collector::DeferredReferenceCounting` | 13.04 ms | 2,354 ms |
| `OptLevel::SpeedAndSize` | — | 2,426 ms |
| `gc_heap_may_move(false)` | 8.12 ms | 2,361 ms |
| `signals_based_traps(false)` | 11.27 ms | 3,331 ms |
| `gc_heap_initial_size(0)` | 8.25 ms | — |

Nothing moves matmul by more than the noise.

## Mechanism

Disassembly of the sum loop, from `Engine::precompile_module`, then `objdump`. binaryen has
unrolled the loop four times, and the array ref is already hoisted into a local. Cranelift
emits all of the following again on every iteration:
- a null test of the ref;
- a reload of the array length from the GC heap;
- three overflow checks that the object fits the 32-bit GC heap (`len * 4 >> 32`, `+ 0x14`,
  `base + size`).

Each element then costs an index compare plus a `shl`/`lea`/`sub`/`sub` address computation.
That is about 25 instructions per four elements, where V8 needs about 8. There is no compare
against the heap bound, because the default 4 GiB GC-heap reservation's guard already elides
it. What remains is not configurable: the length is a load Cranelift cannot prove invariant,
and the overflow checks are part of the GC heap's addressing.

## What VL can and cannot do

- **Host.** No `Config` change helps, so there is nothing to PR.
- **Emitter.** The module already keeps the array ref in a local and reads the length once per
  loop. Moving numeric lists to linear memory would avoid the GC heap, but that is a
  memory-model change and outside a codegen fix.
- **Upstream.** The two costs are reloading an immutable array length and re-proving that an
  object fits the GC heap inside a loop. Both are loop-invariant, and both are wasmtime's to
  fix. Re-measure on each wasmtime bump with this note's harness shape: the host's engine, the
  fixtures above, and the start function timed.
