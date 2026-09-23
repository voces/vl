# The decoder gap — why plumb's x86 decoder ran ~9× slower than Rust, 2026-09-22

Requested by plumb (PL-014): `tools/decode-bench.vl` decodes all 10,584,797 instructions of
war3.exe's `.pdata` functions; `vl-probes/decode-rs` is a faithful Rust port that prints the same
line (`10584797 instructions, 31638500 bytes, 7363 bad`). plumb's `RESULTS.md` read the gap as
~10–11× and "the allocation shape explains little of it". This document attributes it.

**The short answer: most of the gap was the host, not the code.** On the same `.wasm` bytes,
V8 decodes in 0.56 s and `vl run` in 3.79 s. Of the 3.35 s between `vl run` and Rust, **78% is
one GC-sizing pathology** in the host's wasmtime configuration (1,248 collections at a heap that
never grows past 16 MiB), a further slice is the host being built at `opt-level = 1`, and what is
left is Cranelift-vs-TurboFan codegen on WasmGC plus a small VL code-shape residue.

Every number below is **user+sys CPU seconds, median of 5** (3 where marked), measured with
`bench.py` (fork/exec, `RUSAGE_CHILDREN`), warm page cache, box load 4–15 unless noted (the box
is shared: 24 cores, load swung 4–232 during the session, so ratios and op-counts are the
reliable columns). "decode" = `passes=1` minus `passes=0`, which removes the per-run fixed cost.
Pin: master `914d64d65` (`dist/vl`, wasmtime 47.0.2), binaryen 130, deno 2.9.6 (V8 15.0),
rustc 1.96.

## 1 · The measurements

| configuration (same VL program unless noted) | p0 (setup) | p1 | **decode** | × Rust faithful |
| --- | --- | --- | --- | --- |
| Rust idiomatic (no per-insn heap work) | 0.02 | 0.34 | **0.32** | 0.73 |
| Rust faithful (`Box<Insn>` + `Vec<Opnd>`) | 0.02 | 0.46 | **0.44** | 1.00 |
| Rust gcshape (every `Opnd` boxed too) | 0.02 | 0.57 | **0.55** | 1.25 |
| **`dist/vl run` today** (default build) | 0.80 | 4.59 | **3.79** | **8.6** |
| `dist/vl run`, `-O3` build | 0.67 | 4.36 | 3.69 | 8.4 |
| host with GC heap starting at 64 MiB (opt-level 1) | 0.76 | 1.93 | **1.17** | 2.7 |
| host with deps at opt-level 3 (default heap) | 0.64 | 3.30 | 2.66 | 6.0 |
| host with both | 0.61 | 1.67 | **1.05** | 2.4 |
| host with both, `-O3` build | 0.50 | 1.43 | **0.93** | 2.1 |
| **V8 (deno), same default-build module** | 0.06 | 0.62 | **0.56** | 1.27 |
| V8 (deno), `-O3` module | 0.08 | 1.03 | 0.95 | 2.2 |

The "host with …" rows are an isolated build of `scripts/vl-host` with only the named change,
running the identical `.wasm` (`db.wasm`, built once by `dist/vl`). The V8 rows run the module
with its `(start)` re-exported as `main` and the two fs imports it uses served from JS (§7);
a fixed-args twin of the bench (`args` hard-coded, same decode loop) avoids `__args_get__`,
which JS cannot construct.

Two things this table settles on its own:

* **The engine, not the code, is the first-order term.** The same bytes run 6.8× faster under
  V8 than under `vl run`, and at V8 the default VL module is at parity with Rust's gcshape port.
* **The "0.7–0.8 s setup" is not the program.** `passes=0` runs the program's own setup
  (loading the PE, building four opcode tables) in **20 ms**; the rest of `p0` is wasmtime
  Cranelift-compiling the 100 KB module on every `vl run` (0.33–0.44 s wall, parallel, hence
  0.6–0.8 CPU-s). V8's lazy tiering compiles it in 1 ms.

## 2 · Attribution

The gap being attributed is `dist/vl` decode 3.79 s − Rust faithful 0.44 s = **3.35 s**.

| # | cause | evidence | share of the 3.35 s | fix | kind | effort |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | **GC heap never grows** — wasmtime's copying collector grows only when a collection frees almost nothing, and the host sets no initial size, so the heap sticks at 16 MiB under a live set of a few MiB | 1,248 collections at the default heap; 123 at 64 MiB; 26 at 256 MiB (§3). decode 3.79 → 1.17 with only `gc_heap_initial_size(64 MiB)`. A 20-line synthetic reproduces it at every live-set size tried, 1.4–8.8× | **2.62 s · 78%** | host: `gc_heap_initial_size(64 MiB)` on the user-program engine (**in this PR**); upstream: the growth test compares against the whole heap, not the active semispace | host config | S (done) |
| C2 | **Host built at `opt-level = 1`** — the collector's copy loop and Cranelift itself are Rust code in the host | decode 3.79 → 2.66 at the default heap (the collector is most of that); 1.17 → 1.05 once C1 is fixed; `p0` 0.80 → 0.64 (faster Cranelift) | **0.12 s · 4%** after C1 (1.13 s before it) | `[profile.release.package."*"] opt-level = 3` — dependencies only, the host crate stays at 1 | host build | S |
| C3 | **Cranelift vs TurboFan on WasmGC** — same module, V8 decodes in 0.56 s | §4: every struct access re-derives the GC heap base through two dependent loads, non-null `(ref $D)` params are still null-checked, every call pays a frame (and a stack-limit check when the callee itself calls), and wasmtime will not inline into a caller over its 2,000-byte sum threshold (`decode` is far over it) | **0.49 s · 15%** | VL-side: inline small leaf functions and scalar-replace non-escaping structs at emit time (what `-O3` does partially: −0.12 s); upstream wasmtime issues | engine codegen | M–L |
| C4 | **VL code shape vs Rust**, measured on the strong engine | V8 0.56 vs Rust faithful 0.44; vs gcshape 0.55 it is parity. The decoder state `D` is a heap struct updated through `struct.set` per byte (Rust keeps it in registers); string equality is an out-of-line call | **0.12 s · 4%** | literal-length guard on `==` against a literal (−3% ops, §5); inlining + SROA as C3 | compiler emit | S–M |
| — | per-run Cranelift compile | not part of decode; it is the whole of `p0` | (0.6–0.8 CPU-s per run, outside the 3.35) | cache the compiled user module like the seed's `.cwasm` sidecar | host | M |

Checked and **not** a cause (each measured, so nobody re-opens it on a hunch):

* **Module `const`s are emitted as mutable globals** (69 of them here, e.g. `K_MEM`, every
  `T_*`/`S_*`), so each use is a `global.get` load instead of an immediate. Making them immutable
  in the `.wat` (wasmtime then folds them — `get_const_value_for_global`) moved decode by 0–3%,
  inside noise. A real codegen wart, worth fixing for size, not a speed lever.
* **Cranelift opt level** — the default is already `Speed`; `SpeedAndSize` 0%; `None` +7%.
* **wasmtime's own inliner** (`Inlining::Yes` / `InterModuleAndIntraGc`): 0%, because of the
  size threshold above.
* **`gc_heap_may_move(false)`** with a 4 GiB reservation: 0%.
* **Signals-based traps** are on (the fast path); turning them off costs +46%.
* **The other collectors**: `VL_GC=none` decodes in 2.75 s (it never reuses memory, so ~3 GB of
  allocation is ~3 GB of fresh pages), `VL_GC=refcount` takes 29 s for one pass. Copying with a sane initial size wins.
* **The per-instruction allocation shape** (Insn + ops list + Opnds + D): Rust's gcshape port pays
  the same allocations and is at 0.55; the VL module on V8 is at 0.56. It is a plumb design choice
  worth 0.23 s in Rust (idiomatic 0.32), not a VL defect.

## 3 · C1 in detail — the heap that never grows

wasmtime 47's GC store decides "collect or grow" in `should_collect_first` and
`collect_and_maybe_grow_gc_heap` (`wasmtime/src/runtime/store/gc.rs`): grow only if predicted
usage exceeds **half the heap capacity**, and after a collection grow only if the free bytes
cannot fit the request. For the copying collector the capacity is the whole memory — **both**
semispaces — so the effective rule is "grow when the live set has filled a semispace". Below that
it collects, again and again, each time copying the whole live set.

Collections counted with a `log` hook on wasmtime's `Begin copying collection` trace:

| initial GC heap | collections | final heap | decode-bench p1 CPU | max RSS |
| --- | --- | --- | --- | --- |
| 0 (today) | 1,248 | 16 MiB | 3.28 | 194 MB |
| 16 MiB | 1,212 | 16 MiB | 3.25 | 195 MB |
| 24 MiB | 490 | 24 MiB | 2.15 | 199 MB |
| 32 MiB | 307 | 32 MiB | 1.93 | 212 MB |
| **64 MiB** | **123** | 64 MiB | **1.64** | 237 MB |
| 128 MiB | 56 | 128 MiB | 1.55 | 309 MB |
| 256 MiB | 26 | 256 MiB | 1.55 | 428 MB |

(O3-built harness, 3 runs each; the ~190 MB floor is the 48 MB PE image in linear memory plus the
runtime.) ~3.3 GB is allocated over the run (26 collections of a 128 MiB semispace at the
256 MiB heap), ~300 bytes per decoded instruction.

**It is not specific to plumb.** A 20-line program — a live list of `LIVE` three-field structs,
then 20 M short-lived struct allocations — reproduces it at every live-set size tried, and the
collection count is not even monotonic in the live set, because it depends on where the live set
lands against the power-of-two heap sizes:

| `LIVE` | collections (heap) today | CPU today | collections at 64 MiB | CPU at 64 MiB | ratio |
| --- | --- | --- | --- | --- | --- |
| 1,000 | 22,807 (128 KiB) | 0.59 | 19 | 0.27 | 2.2× |
| 50,000 | 2,751 (4 MiB) | 2.40 | 20 | 0.27 | **8.8×** |
| 150,000 | 268 (16 MiB) | 1.03 | 23 | 0.36 | 2.9× |
| 250,000 | 100 (32 MiB) | 0.62 | 26 | 0.44 | 1.4× |
| 400,000 | 359 (32 MiB) | 2.85 | 34 | 0.51 | 5.6× |

**Why no benchmark saw it.** `docs/internals/perf-landscape.md`'s suite (VL at V8 parity in the
median) is built from small, self-contained kernels: their live sets are tiny and their
allocation rates low, which is exactly the regime where the heap's size does not matter. A
realistic program — a table held for the whole run, an allocation per unit of work — is the
regime where it does. The suite needs one such benchmark (lane L7).

**The cost of the fix.** The reservation is virtual and committed on first touch: a small
program's max RSS is unchanged (30 MB either way on a 1,000-allocation program; 163 vs 162 MB on
the byte-sum microbench), and an allocation-heavy one grows by at most the heap it actually uses
(+43 MB on the decoder). No semantics move: the collector is the same, it just starts larger.
Behaviour past 64 MiB is wasmtime's normal doubling.

## 4 · C3/C4 in detail — what Cranelift makes of the hot code

**Dynamic op count.** wasmtime fuel (1 unit per wasm operator) over the default build: 8.29 G
operators for 10.58 M instructions — **783 wasm ops per decoded instruction, 262 per byte**.
`-O3` barely moves it (8.24 G): binaryen inlines, but the work is still there.

**Where it sits.** wasmtime's `GuestProfiler` (epoch sampling, named build): `decode` 45–54% self,
`__str_eq__` 13–16%, `byte` 10–13%, `oprSize` 8–10%, `sizeOf` 6–8%, `readImm` 3%, `memOperand`
2–4%. The small functions are over-attributed — epoch samples land at function entries — which is
why the string-compare A/B (§5) moved 3%, not 15%. Read it as "decode plus five tiny helpers".

**`byte(d)`** — the VL is `const b = __load_u8__(d.p + d.i); d.i += 1; b`. Cranelift's x86-64
(`engine.precompile_module` + `llvm-objdump`):

    push rbp; mov rbp,rsp
    test edx,edx ; je trap                 ; null check — the param is (ref $D), non-null
    mov rax,[rdi+8] ; mov r8,[rax+0x20]    ; GC heap base: vmctx -> store ctx -> base
    mov ecx,edx
    mov esi,[r8+rcx+0x20] ; mov edx,[r8+rcx+0x14]   ; d.p, d.i
    mov rax,[rdi+0x38]                     ; linear-memory base
    add esi,edx ; movzx rax,byte [rax+rsi]
    add edx,1 ; mov [r8+rcx+0x14],edx      ; d.i += 1
    mov rsp,rbp ; pop rbp ; ret

17 instructions plus the call, for what Rust compiles to two (`movzx` + `inc`, `D` in registers,
`byte` inlined). `decode` has 10 call sites of it, plus `sizeOf`/`oprSize` (which also re-read each
`S_*` constant from the vmctx, C4 above). The same shapes appear in the byte-sum microbench:

**Byte-sum microbench** (`micro.vl`: 64 MiB `Buf`, 8 passes, ps/byte, one run each; `vl -O3` in
the right-hand columns):

| loop | dist/vl | host C1+C2 | dist -O3 | host -O3 |
| --- | --- | --- | --- | --- |
| `buf.loadU8(i)` | 2,458 | 2,251 | 739 | 657 |
| `__load_u8__(base + i)` | 616 | 411 | 787 | 586 |
| `a[i]` over `u8[]` | 1,650 | 1,568 | 1,702 | 1,683 |
| `for x in a` over `u8[]` | 1,620 | 1,553 | 1,560 | 1,659 |
| Rust `for &x in v` (auto-vectorised) | 237 | | | |
| Rust, one byte per iteration (`black_box` index) | 668 | | | |

(The Rust row ran at load 144; treat it as an order of magnitude.)

* `buf.loadU8(i)` is **4–6× the raw load** only because it is a call: `std:buffer`'s one-line
  accessor is not inlined without `-O3`, and Cranelift spills the accumulator around the call.
  `-O3` inlines it and recovers the raw speed.
* `u8[]` is **3–4× the raw load at every build**, and `-O3` does not help. Per element: VL's own
  logical-length clamp (`i < len ? i : -1`), then the engine's array bounds check with the array
  length re-loaded from the object header, a null check on the backing array, and wasmtime's
  GC-heap address computation with two overflow checks — 28 instructions in the inner loop for
  one byte. The raw-memory loop is 7.
* Under V8 the same module runs each loop in the baseline tier: the loops sit in functions called
  once, and V8 tiers a Wasm function up only on its next call (no on-stack replacement), so the V8
  microbench numbers (1.1–2.5 ns) measure Liftoff and are not comparable.

That last point matters for `-O3` on the web: **`-O3` inlines `decode` into the start function**
(it has one caller), which is called once and therefore never leaves V8's baseline tier (V8 has no on-stack
replacement for Wasm) — V8 decode 0.56 → 0.95 s. Re-running the same binaryen pipeline with
`--no-inline=decode*` takes V8's whole run from 1.00 to 0.77 CPU-s, and wasmtime does not care.

## 5 · Validated A/Bs

| change (applied to the decoder unless noted) | measure | before | after |
| --- | --- | --- | --- |
| host `gc_heap_initial_size(64 MiB)` | decode CPU, `vl run` | 3.79 | 1.17 |
| host deps at opt-level 3 | decode CPU at 64 MiB | 1.17 | 1.05 |
| host deps at opt-level 3 | `p0` CPU (Cranelift compile) | 0.76 | 0.61 |
| length guard in front of the 4 per-insn `== "(bad)"` compares (`s.length == 5 && s == "(bad)"`) | fuel | 8.294 G | 8.048 G (−3.0%) |
| same | decode CPU, tuned harness | 1.72 | 1.68 (−2%) |
| mutable const globals made immutable (`.wat` edit, 69 globals) | decode CPU | 1.59 | 1.55 (noise) |
| binaryen `-O3` pipeline, tuned host | decode CPU | 1.05 | 0.93 |
| binaryen `-O3` pipeline, V8 | decode CPU | 0.56 | 0.95 |
| binaryen `-O3` with `--no-inline=decode*`, V8 | p1 CPU (whole run) | 1.00 | 0.77 |

## 6 · Fix lanes, ranked by gap closed ÷ effort

| rank | lane | closes | effort | notes |
| --- | --- | --- | --- | --- |
| **L1** | **Start the user-program GC heap at 64 MiB** (`gc_engine`, `vl run` / `--batch` / `vl test`) | **78%** of this gap; 1.4–8.8× on the synthetic | S — **landed in this PR** | the CLI pump (`vl check`/`fmt`/`test`'s compiler store) runs the same collector: `vl check compiler/typecheck.vl` is 0.86 s with it and 0.64 s with `VL_PUMP_GC=null` (load 50), so the same fix likely applies there — measure before landing |
| **L2** | **Build the host's dependencies at opt-level 3** | 4% after L1 (34% before it); `p0` −20%; every Cranelift compile, including the seed's first compile per content key | S | +35% cold host build (1m03 → 1m25 at `-j8`, loaded box); CI caches the binary, so it lands on cache misses only |
| **L3** | **File the wasmtime issues** — (a) the copying collector's grow tests use the whole heap instead of the active semispace, so the heap grows only once the live set nearly fills a semispace and until then every few MiB of allocation is a full collection; (b) non-null `(ref $t)` params are still null-checked; (c) the GC heap base is reloaded through two dependent loads per access; (d) the inliner's 2,000-byte caller+callee sum threshold rules out every large caller | the ~15% C3 share, on the engine's schedule | S to file | (a) is the root of C1; L1 is the workaround |
| **L4** | **Emit-time inlining of small leaf functions** (the `std:buffer` accessors, a user's `byte`/`oprSize`), and scalar replacement of a struct that does not escape after it | part of C3+C4; `loadU8` 2.3 → 0.66 ns/byte is the measured ceiling (what `-O3` gets) | M | the default build has no binaryen; this is the emitter doing the one binaryen pass that matters for Cranelift |
| **L5** | **Cache the Cranelift compile of a user module** (`vl run x.wasm` and `vl run x.vl`), keyed like the seed's `.cwasm` sidecar | 0.33–0.44 s wall per run; all of plumb's "setup" | M | outside the decode gap but it is the whole fixed cost of every short run |
| **L6** | **`u8[]` element access** — one bounds check, not two, and the backing array and length hoisted out of a `for`-in | `u8[]` is 3–4× the raw load at every build | M | the logical-length clamp is VL's; the rest is L3's engine overhead |
| **L7** | **Add a live-set benchmark to `bench/`** — a held table plus per-unit allocation, the churn program above | would have caught C1 | S | the existing suite's kernels have tiny live sets (§3) |
| L8 | `-O3` must not inline into the start function | V8 only: whole run 1.00 → 0.77 CPU-s here | S | the web target; wasmtime indifferent |
| L9 | `==` against a string literal: compare lengths inline before calling `__str_eq__` | 3% of ops here | S | cheap, general |
| L10 | Scalar module `const`s as immutable globals (or immediates) | ~0% speed | S | module size and readability of the wasm only |

## 7 · How to reproduce

The instruments are small and were kept out of the tree; their shape, so they can be rebuilt:

* **Engine harness** — a 200-line Rust binary against `wasmtime = "47"` that instantiates a module
  with the fs imports served from a fixed file, and env knobs for the collector, the initial GC
  heap, Cranelift opt level, inlining, signals-based traps, fuel (op counts), a `GuestProfiler`
  (epoch sampling every 250 µs, Firefox JSON), a `log` hook counting collections, and
  `precompile_module` for disassembly. Build it under an isolated `CARGO_TARGET_DIR`.
* **V8 runner** — `wasm-dis`, replace `(start $f)` with `(export "main" (func $f))`, `wasm-as
  --all-features --disable-custom-descriptors` (binaryen's round trip otherwise emits exact
  reference types, which neither V8 nor wasmtime accepts without a flag), then a 40-line
  `runv8.mjs` that serves `__fs_size__`/`__fs_read_into__` from JS and calls `main`. JS cannot
  build a WasmGC array, so the bench's args are hard-coded in a twin source.
* **Host A/B** — a copy of `scripts/vl-host` with one change each, built to its own target dir.
* `perf` and `samply` are unusable on this box (`perf_event_paranoid = 2`, no sudo), hence the
  epoch sampler and fuel.
