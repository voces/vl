# bench/arrays/matmul — root cause

**Verdict: `runtime-engine`.** 73% of VL's excess over a raw-load kernel is Cranelift's WasmGC
`array.get`/`array.set` lowering inside wasmtime, and it is provably *not* inherent to WasmGC:
V8 compiles the **byte-identical module** to within 2% of the linear-memory version, wasmtime is
3.41x off. A real but secondary **18% is compiler-fixable** in `compiler/wasmEmit.vl`.

Reproduced. Machine i9-12900KF, `taskset -c 2-5` (harness pinning; ratios re-checked on a single
P-core `-c 2`), min-of-N with the box otherwise idle, VL always from a **prebuilt** `.wasm`.

## 1. Reproduction (min-of-7, interleaved, all print `-437484`)

| runtime | ms | vs VL |
|---|---|---|
| VL `main.wasm` (prebuilt) | **1559.5** | 1.00x |
| deno `main.js` | 568.4 | 2.74x faster |
| rustc -O | 107.5 | 14.5x faster |

Matches the flagged numbers (1585 / 582.8 / 106.9). `-O3` and `opt.vl` are washes, re-confirmed:
`main` 1556.9 · `main_o3` 1557.9 · `opt` 1547.

## 2. The ladder — where the 4.2x goes

I rebuilt the kernel by hand in WAT at four levels of representation and ran all of them under the
same host (`vl run <prebuilt.wasm>`). Min-of-11, interleaved, all print `-437484`.
Sources: `/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/mm/{lin,gc,hdr_nochk,hdr_sel,hoist}.wat`.

| # | variant | wasmtime | vs `lin` | step |
|---|---|---|---|---|
| 1 | `lin` — same loop over **linear memory** (`f64.load`/`f64.store`) | **366.3 ms** | 1.00x | — |
| 2 | `gc` — raw `(array (mut f64))` in a local, engine bounds check only | **1249.1 ms** | 3.41x | **+3.41x: Cranelift WasmGC** |
| 3 | `hdr_nochk` — + VL's list **header struct** `(struct (ref $arr) len cap)` | 1381.9 ms | 3.77x | +10.6% |
| 4 | `hdr_sel` — + VL's explicit `select(i,-1,i u< len)` length guard | 1552.8 ms | 4.24x | +12.4% |
| 5 | **`main.wasm` — the actual VL emitter output** | **1527.9 ms** | 4.17x | ≡ #4 |

Row 5 ≡ row 4 to within noise: my synthetic reconstruction is an exact model of what the emitter
produces, so every step above is attributable.

**Decomposition of VL's 1528 ms**

```
 225 ms   rustc -O with vectorisation OFF          (native scalar ceiling)
x1.63 ->  366 ms   the same loop in wasm on linear memory   (wasm tax — reasonable)
x3.41 -> 1249 ms   WasmGC array.get/array.set lowering      <-- 73% of the excess, ENGINE
x1.22 -> 1528 ms   VL's list header struct + len guard      <-- 18%, COMPILER-FIXABLE
```

Rust's headline 99–107 ms is 225 ms scalar **/2.27x SIMD** (`mulpd`/`addpd`, 2-wide SSE2, unrolled
2x = 4 elems/iter; `rustc -O -C llvm-args=-vectorize-loops=false` reads 225 ms and contains zero
`mulpd`). So of the 14.5x Rust:VL headline, 2.27x is SIMD width that VL does not even attempt.

## 3. The engine is the cause, and V8 proves it

I exported `run` from each hand-written module and ran the **same bytes** under V8 (deno), warm, so
TurboFan (not Liftoff) is what is measured — iter0 is discarded, best of iters 2-5.
Harness: `scratchpad/mm/bench_v8.js`.

| module | V8 / TurboFan | wasmtime / Cranelift | wasmtime is |
|---|---|---|---|
| `lin` (linear memory) | 414.6 ms | 366 ms | **1.13x faster** |
| `gc` (raw WasmGC f64 array) | 423.7 ms | 1249 ms | **2.95x slower** |
| `hdr_nochk` (+ header struct) | 408.4 ms | 1382 ms | 3.38x slower |
| `hdr_sel` (+ len guard) | 519.5 ms | 1553 ms | 2.99x slower |

Read the first two rows: **V8 pays 2% to move this kernel from linear memory to a WasmGC array;
wasmtime pays 241%.** wasmtime's linear-memory codegen is *better* than V8's. The loss is
specifically Cranelift's GC-array lowering. (Also note V8 hoists the header-struct loads itself —
row 3 is free for V8 — while wasmtime charges 10.6% for them.)

Collector choice is irrelevant, as expected for a loop that stores no references:
`VL_GC=auto|tracing|refcount|none` on `gc.wasm` reads 1599 / 1480 / 1456 / 1479 ms.

## 4. What Cranelift actually emits (instruction level)

Machine code via `Module::serialize()` + `objdump`, CLIF via `Config::emit_clif` (a scratch
wasmtime-47 harness outside the repo: `scratchpad/dumper/`). Innermost-loop body:

| variant | x86 instructions / iter | conditional branches / iter |
|---|---|---|
| `lin` | **13** | 2 |
| `gc` (hand-written, best case) | **56** | 12 |
| `main.wasm` (VL) | **72** | 16 |

`lin`'s entire inner loop (13 instrs, one back-edge, zero bounds checks — guard pages):

```asm
14e: lea    edx,[r10+r12*1]        ; ib + j
152: lea    r13d,[rsi+rdx*8]
156: vmovsd xmm1,QWORD PTR [r14+r13*1]     ; c[ib+j]
15c: lea    edx,[rbx+r12*1]
160: add    edx,ecx
162: shl    edx,0x3
165: vmulsd xmm2,xmm0,QWORD PTR [r14+rdx*1] ; aik * b[kb+j]
16b: vaddsd xmm1,xmm1,xmm2
16f: vmovsd QWORD PTR [r14+r13*1],xmm1
175: add    r12d,0x1
17c: jmp    145
```

**One** WasmGC `array.get` in the hand-written `gc` variant — 23 instructions, 5 conditional
branches, for a single f64 load:

```asm
4a7: mov    r11d,DWORD PTR [rsp]           ; RELOAD the gc ref from its stack slot
4ab: test   r11d,r11d
4ae: je     <trap>                         ; null check
4b4: mov    r12d,r11d
4b7: mov    r12d,DWORD PTR [rbx+r12*1+0x10] ; LOAD array length from the GC heap  (loop-invariant)
4bc: lea    r13d,[r8+r9*1]                 ; index
4c0: cmp    r13d,r12d
4c3: jae    <trap>                         ; the wasm-visible bounds check
4c9: mov    r14d,r12d
4cc: shl    r14,0x3
4d0: shr    r14,0x20
4d7: jne    <trap>                         ; overflow check 1  (loop-invariant)
4dd: shl    r12d,0x3
4e1: add    r12d,0x18
4e5: jb     <trap>                         ; overflow check 2  (loop-invariant)
4eb: add    r11d,r12d
4ee: jb     <trap>                         ; overflow check 3  (loop-invariant)
4f4: mov    r11d,r11d
4f7: add    r11,rbx                        ; = heap_base + object END
4fa: shl    r13d,0x3
4fe: add    r13d,0x18
505: sub    r12d,r13d
508: sub    r11,r12                        ; end - (obj_size - (idx*8+24))  -- no [base+idx*8+disp]
50b: vmovsd xmm1,QWORD PTR [r11]
```

The CLIF shows why none of it is hoisted or folded:

```clif
v583 = load.i32 notrap aligned region10 v608   ; local.get of a (ref $arr) is a STACK-SLOT LOAD
trapz v583, user16                             ; null check
v395 = load.i32 user2 readonly region8 v868    ; array length  (readonly, but v583 changes each iter)
v396 = icmp ult v387, v395
trapz v396, user17                             ; wasm bounds check
v872 = ushr (ishl (uextend v395) 3) 32
trapnz v872, user2                             ; \
v404 = uadd_overflow_trap (ishl v395 3), 24    ;  | object-size overflow chain
v408 = uadd_overflow_trap v583, v404           ; /
v413 = isub v404, (iadd (ishl v387 3) 24)
v415 = isub (iadd v767 (uextend v408)) (uextend v413)
v416 = load.f64 user2 little region8 v415
```

Three compounding upstream causes, all in
`wasmtime-internal-cranelift-47.0.2/src/func_environ/gc.rs`:

1. **`local.get` of a reference-typed local is a memory load.** GC refs live in stack-map-tracked
   slots (`region10`/`region11`), so `v583` is reloaded every access. Because the SSA value
   differs each iteration, the `readonly` length load and the whole overflow chain hanging off it
   cannot be GVN'd or LICM'd — Cranelift's *own* comment at `array_elem_addr` says the object-size
   check shape was chosen so it "can be deduplicated across repeated accesses to the same array",
   and the stack reload is exactly what defeats that.
2. **`emit_array_size_info` (gc.rs:~900) re-derives and re-validates the object size per access** —
   "we can't trust the array's length: it came from inside the GC heap" — three trapping ops that
   are loop-invariant but unhoistable because they can trap.
3. **Two bounds checks per access.** `array_elem_addr` (gc.rs:945) emits the Wasm-visible
   `index < len` check *and* an implementation-internal object-size check, with an explicit TODO:
   *"Ideally we should fold the first Wasm-visible bounds check into this internal bounds check, so
   that we aren't performing multiple, redundant bounds checks."* A second TODO names the real fix:
   *"The proper solution is to use linear memories to back GC heaps and reuse the code in
   `bounds_check.rs`… That is all planned, but not yet implemented."*

**Ceiling: ~1249 ms** (3.41x linear memory) for this kernel on wasmtime 47 as long as `f64[]` is a
WasmGC array. Nothing VL emits can get under it — even a raw `(array (mut f64))` held in a local
pays the stack reload, because that is how reference locals are modelled.

## 5. The compiler-fixable 18% (bisected, one change at a time)

Emitter site: **`compiler/wasmEmit.vl:6254 emitListIdxGuard`**, which lowers *every* `xs[i]`
read/write as:

```
local.set idx ; local.set wrap
local.get wrap ; struct.get lTy 0            <-- backing array   (loop-invariant)
local.get idx ; i32.const -1 ; local.get idx
local.get wrap ; struct.get lTy 1            <-- len             (loop-invariant)
i32.lt_u ; select
```

Bisection (min-of-11, interleaved):

| change | ms | delta |
|---|---|---|
| VL as emitted (`main.wasm`) | 1527.9 | — |
| **hoist `struct.get 0` / `struct.get 1` into locals across the loop** (`hoist.wat`) | **1376.5** | **−9.9%** |
| …and also drop the explicit `select` guard entirely (`gc.wat`) | 1249.1 | −18.2% cumulative |

- The **first 9.9% is soundly recoverable today**: cache the backing-array ref and `len` in locals
  for a loop body that neither reassigns the list binding nor can reallocate it (no `push`, no call
  that could reach it). matmul's inner loop contains zero calls, so the analysis is trivial there.
  Note the guard itself is nearly free *once hoisted* (`hoist` 1376.5 vs `gc` 1249.1 is mostly the
  guard, but `hdr_nochk` 1381.9 vs `hdr_sel` 1552.8 shows the guard costs 12.4% **only because it
  forces the second dependent `struct.get 1` load**) — so hoisting is the whole win, and deleting
  the guard on top buys little.
- The **remaining 8%** needs the `len` check proven redundant by range analysis over the loop
  bound; it cannot simply be deleted (`len < cap` after `.push`, and the slack reads zero silently).
- `wasm-opt -O3` recovers **none** of this (1557.9 vs 1556.9) — it will not hoist a `struct.get`
  past an `array.set` it cannot prove non-aliasing.

Even with the full 18%, VL lands at 1249 ms vs deno's 568 ms — still 2.2x behind V8. **The emitter
fix does not close the flagged gap.** That is why the class is `runtime-engine`.

## 6. Not a language-design defect

There is no fast spelling a user could reach for. `opt.vl` (hoisted `i*n`/`k*n` bases) is a wash;
the range-`for` form is a wash; `for x in xs` lowers to the identical per-element sequence. The
idiomatic spelling *is* the fastest VL spelling — the cost is entirely below the source level.

## 7. Recommendation

1. **Own the engine dependency.** File/track the wasmtime issue (Cranelift `array_elem_addr`, both
   TODOs above). Until it lands, ~3.4x on every hot `T[]` element loop is unavoidable and should be
   stated as a known platform ceiling, not chased in `compiler/**`.
2. **Take the 9.9%** in `emitListIdxGuard`: hoist the header-struct `backing`/`len` loads into
   locals for call-free loop bodies that cannot reallocate the list. This is the same transform V8
   performs for free and helps *every* array-indexing benchmark, not just matmul.
3. **Evaluate a linear-memory backing store for scalar arrays** (`i32[]`/`i64[]`/`f32[]`/`f64[]`).
   Measured 3.41x on this kernel, and it sidesteps the engine bug entirely. Large design change
   (bounds checks become explicit, GC integration is lost for scalar arrays only) — worth a
   separate design note, not a patch.
4. **Do not** quote the 14.5x Rust multiple as scalar-codegen headroom. 2.27x of it is SSE2 width.
   Scalar-vs-scalar the real numbers are 225 ms (Rust) : 366 ms (VL on linear memory) : 1528 ms
   (VL as shipped).

## Artifacts (outside the repo, scratch)

`/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/mm/` —
`lin.wat` `gc.wat` `hdr_nochk.wat` `hdr_sel.wat` `hoist.wat` (+ `_x` exported variants),
`bench_v8.js`, `*.asm` disassemblies, `clif/`.
`/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/dumper/` — wasmtime-47
harness that serialises a module to a `.cwasm` ELF and dumps CLIF. No repo file was modified.
