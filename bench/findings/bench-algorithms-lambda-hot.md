# lambda-hot — root cause: a `funcref` field inside a GC struct is a HOST LIBCALL per read

**Verdict: compiler-fixable.** The cost is not the call, not the closure allocation, not the
capture and not the `ref.cast`. It is one instruction: `struct.get $closure 0`, where field 0 is a
`funcref`. In wasmtime 47 that single instruction lowers to a **builtin host call**
(`get_interned_func_ref`) and costs **9.4 ns**, against **0.15 ns** for reading any other field of
the same struct — a **62x** penalty on one field. VL puts the closure's code pointer in exactly
that field and re-reads it **on every call**, including once per element inside `.map`/`.filter`.

VL already carries the information needed to avoid it: field 2 of the same closure struct is
`gImports + fe`, the callee's **wasm function index**. Routing the call through
`call_indirect` on that index instead of `call_ref` on the funcref removes the libcall entirely —
measured **7.3x** on the phase, with no source change and no `wasm-opt`.

---

## 1. Reproduction

Reproduces. All numbers below: min-of-7, `taskset -c 6` (P-core; the box had other agents on it and
`-c 2` went bimodal at exactly 2x — SMT-sibling contention — so every number here is from `-c 6`),
prebuilt `.wasm` run through `vl run <module>` so no compile time is included. Empty-program `vl run`
startup on this core measured **3.4 ms**; subtract it from every VL figure.

Whole benchmark, n = 100,000,000 per phase, all four printing `268160` x4:

| runtime | ms | vs VL default |
|---|---:|---:|
| rust (`rustc -O`) | 116.3 | 19.4x faster |
| deno 2.9 | 223.7 | 10.1x faster |
| **VL, `vl build` default** | **2258.6** | — |
| VL, `vl build -O` | 178.8 | 12.6x faster |
| VL, `vl build -O3` | 184.5 | 12.2x faster |
| VL, `opt.vl` (lambda contorted into named fns) | 250.2 | 9.0x faster |
| python 3.11 (n = 4M, 1/25 scale) | 929.8 | — |

Scale check at 2N (200M) — nothing was folded away:
VL phase-3 1023.9 -> 2079.1 (**2.03x**), rust 116.3 -> 231.7 (**1.99x**), deno 223.7 -> 434.2 (**1.94x**).

Per phase (isolated one-phase VL modules, 100M iterations, startup subtracted):

| phase | spelling | ms | ns/iter |
|---|---|---:|---:|
| 1 | hand-inlined `(i & 15)` | 40.9 | 0.41 |
| 2 | named function, direct call | 67.7 | 0.68 |
| 3 | **non-capturing lambda in a `const`** | **1020.5** | **10.20** |
| 4 | **capturing lambda** | **1121.2** | **11.21** |

**Idiom-vs-hack gap: 15.1x** (phase 3 lambda 1020.5 ms vs the same body as a named direct call
67.7 ms). Capturing costs only **1.0 ns** more than not capturing — the closure environment is
*not* where the money goes.

---

## 2. The emitted hot loop

`vl build bench/algorithms/lambda-hot/main.vl` then `wasm-dis`. Phase 3's loop body:

```wat
(local.set $6 (local.get $3))                 ;; the closure, a loop-INVARIANT local
(call_ref $3
  (struct.get $1 1 (local.get $6))            ;; env      — structref field
  (local.get $5)                              ;; the arg
  (ref.cast (ref $3)
    (struct.get $1 0 (local.get $6))))        ;; code     — funcref field   <-- 9.4 ns
```

with the closure type

```wat
(type $1 (struct (field funcref) (field structref) (field i32)))
```

Everything in that snippet is loop-invariant except `local.get $5`. VL re-executes all of it
100,000,000 times.

---

## 3. Bisection — one edit at a time, hand-written WAT, same 100M loop

All variants print `268160`; the only difference is the shape of the call. `direct call, no field
reads` is the floor.

| # | variant | ms | delta vs floor | ns per added op |
|---|---|---:|---:|---:|
| A | direct `call $f`, no `struct.get` at all | 69.9 | — | — |
| B | A + read field **2** (`i32`) in the loop | 84.5 | +14.6 | **0.15** |
| C | A + read field **1** (`structref`, pointing at a real GC object) | 84.3 | +14.4 | **0.14** |
| D | A + read field **0** (`funcref`), value dropped, still a direct call | **1009.9** | **+940.0** | **9.40** |
| E | VL's exact shape (env get + funcref get + `ref.cast` + `call_ref`) | 1072.7 | +1002.8 | — |
| F | E, but field 0 declared `(ref $fn)` so **no `ref.cast` is needed** | 1229.0 | +1159.1 | — |
| G | E, but the funcref + env loads **hoisted out of the loop** | **101.5** | +31.6 | — |
| H | E, but field 0 is an **i32 table index** + `call_indirect` | **146.2** | +76.3 | — |

Read the table as four refutations and one cause:

- **D is the whole cost.** Merely *reading* the funcref field and throwing the value away — while
  still calling the function directly — costs 940 ms of the 1003 ms. **94% of the lambda penalty is
  one `struct.get`.**
- **The `ref.cast` is innocent (F).** Declaring field 0 concretely so the cast disappears makes it
  **14% worse**, not better: a concretely-typed funcref read takes wasmtime's `get_typed` path,
  which additionally resolves an engine type index and runs a subtype check. Typing the field
  harder is a pessimization.
- **The env / the capture is innocent (C).** Reading a `structref` field that points at a live GC
  object costs 0.14 ns — the DRC read barrier is essentially free here. Matches phase 4 - phase 3 = 1.0 ns.
- **`call_ref` itself is innocent (G).** Same `ref.cast`, same `call_ref`, same closure; only the
  two loads moved above the loop: **1072.7 -> 101.5 ms, 10.6x.**
- **The fix is representational (H).** Put the callee's function index in the struct as an `i32`
  and call through a wasm table: **1072.7 -> 146.2 ms, 7.3x**, with no reliance on the closure being
  loop-invariant, known, or unique.

---

## 4. Why — read out of wasmtime, not theorized

`wasmtime-internal-cranelift-47.0.2/src/func_environ/gc.rs:341-381`, the lowering of a GC struct
field load:

```rust
WasmValType::Ref(r) => match r.heap_type.top() {
    WasmHeapTopType::Any | WasmHeapTopType::Extern | WasmHeapTopType::Exn => {
        gc_compiler(func_env)?.translate_read_gc_reference(...)   // inline barrier
    }
    WasmHeapTopType::Func => {
        ...
        let func_ref_id = builder.ins().load(ir::types::I32, flags, addr, 0);
        let get_interned_func_ref = func_env.builtin_functions.get_interned_func_ref(builder.func);
        builder.ins().call(get_interned_func_ref, &[vmctx, func_ref_id, expected_ty]);   // LIBCALL
    }
```

A `funcref` cannot live in the GC heap as a pointer, so wasmtime stores a 32-bit
`FuncRefTableId` and converts back through a **builtin host call on every single read**. The
declaration in `wasmtime-environ-47.0.2/src/builtin.rs:99-120` even carries wasmtime's own TODO:

> `// TODO: We will want to eventually expose the table directly to Wasm code, so that it doesn't
> need to make a libcall to go from id to VMFuncRef.`

The `expected_ty` argument is what makes variant F worse: with a concrete type it calls
`func_ref_table.get_typed(types, id, engine_ty)` (engine type resolution + subtype check) instead of
`get_untyped(id)` (`wasmtime-47.0.2/src/runtime/vm/libcalls.rs:573-605`).

### The mirror cost: closure CREATION

The same representation makes `struct.new` pay `intern_func_ref_for_gc_heap`
(`gc.rs:397-431`). Measured over 10,000,000 closure allocations:

| variant | ms | ns/alloc |
|---|---:|---:|
| field 0 = `i32` (scalar-replaced by cranelift — floor) | 20.8 | 2.1 |
| field 0 = `funcref`, value `ref.null nofunc` (real GC alloc, **no** libcall) | 153.5 | 15.4 |
| field 0 = `funcref`, value `ref.func $f` (real GC alloc + libcall) | **564.4** | **56.4** |

**`intern_func_ref_for_gc_heap` costs ~41 ns per closure created.** Confirmed in real VL: a loop
creating one capturing lambda per iteration and calling it (`mk.vl`) runs 10M iterations in
667.7 ms = **66.8 ns/iteration**, which is 41 (intern) + 9.4 (get) + ~15 (closure alloc) + env alloc
+ call. The same loop in JS is ~2 ns/iteration.

---

## 5. Why `-O3` "fixes" it, and why that is not a fix

`wasm-dis` of `vl build -O3` output shows binaryen did not make closure calls fast — it **deleted
every closure**. All four phases become the phase-1 loop with a different constant; the module has
no `struct.new`, no `call_ref` and no closure type at all (258 bytes vs 560). The win is
whole-program devirtualization + inlining of a lambda whose single definition is visible, i.e. it
removes the funcref field rather than making it cheap.

That escape hatch is unavailable in the general case and unavailable to users by default:

- **`vl run` has no `-O` flag at all.** `wasm-opt` is wired only into `vl build -O/-O3`
  (`scripts/vl-host/src/main.rs:1355-1372`). The default path every VL user and the self-hosted
  compiler take always pays the libcall.
- Devirtualization requires the callee to be statically unique at the call site. A closure that
  arrives as a parameter from another module, is stored in an array/map/struct field, or is one of
  several possible functions cannot be devirtualized, and then **nothing** recovers the 15x.
- It hides, rather than fixes, `emitMfInvoke` — see below.

Rust and V8 both cost ~0 for all four spellings because neither stores a code pointer where reading
it back is a runtime call. VL's 19.4x gap to Rust decomposes as: ~15x from this defect, and the
residual ~1.5-2.5x from VL not inlining `bump` at all in the default build (phase 2, 0.68 ns/iter,
vs Rust's whole-program 0.29 ns/iter).

---

## 6. Blast radius beyond this benchmark

`struct.get cloStructIdx 0` appears at three emit sites, and one of them is **per element**:

- `compiler/wasmEmit.vl:9308-9311` — the general function-value call (`f(x)`), this benchmark.
- `compiler/wasmEmit.vl:11181-11184` — `emitMfInvoke`, the `.map` / `.filter` lowering. The funcref
  is re-read **once per element**, so every `xs.map(f)` pays 9.4 ns/element of pure host-call
  overhead. Confirmed in the disassembly of a 10M-element `xs.map((x: i32) => (x + 2) & 15)`:
  `struct.get $2 0` sits inside the map loop.
- `compiler/wasmEmit.vl:14549-14552` — the captured-call-target path.

Any VL program that is written in a functional style pays this everywhere.

---

## 7. The fix, and what it is worth

VL is already one field away. `emitClosureValueCore` (`compiler/wasmEmit.vl:1379-1398`) stores

```
field 0: ref.func (gImports + fe)     <-- the expensive one
field 1: env
field 2: i32.const (gImports + fe)    <-- the SAME function index, as an i32
```

Field 2 exists solely as the `==` identity token (funcrefs admit no `ref.eq`). It is exactly the
operand `call_indirect` needs.

**Change (emitter only, no language change, no user-visible semantics change):**

1. `compiler/emit_sections.vl:2490-2509` — the element section is currently a *declarative*
   segment with no table. Emit a `funcref` table of `gImports + n` entries plus an **active**
   segment at offset `gImports` listing the same function indices. (One table, one segment; the
   index vector is already computed.)
2. `compiler/emit_sections.vl:3536-3552` — drop field 0 from the closure struct; the struct becomes
   `{ env: structref, id: i32 }` (or keep field 0 for ABI stability and simply stop reading it,
   though keeping it also keeps the 41 ns creation cost, so dropping is strictly better).
3. `compiler/wasmEmit.vl:1379-1398` `emitClosureValueCore` — drop the `fbRefFunc`; field 2 is
   unchanged.
4. The three read sites (`wasmEmit.vl:9308`, `:11181`, `:14549`) — replace
   `fbStructGet(cloStructIdx, 0); fbRefCast(sig); fbCallRef(sig)` with
   `fbStructGet(cloStructIdx, 2); fbCallIndirect(tableIdx, sig)`. The `$fnsig` functypes and the
   whole `cloSigKeys` machinery are unchanged — `call_indirect` takes the same type index, and it
   performs the same runtime signature check the `ref.cast` was performing, so the existing
   soundness floors keep their meaning.

**Measured value of the prototype** (variant H above, hand-written WAT, same wasmtime, same core):

| | default now | with table-index calls | speedup |
|---|---:|---:|---:|
| phase 3 (non-capturing lambda) | 1020.5 ms | ~146 ms | **7.0x** |
| phase 4 (capturing lambda) | 1121.2 ms | ~160 ms | **7.0x** |
| whole lambda-hot benchmark | 2258.6 ms | **~415 ms** | **5.4x** |
| closure creation (10M) | 564.4 ms | ~154 ms | **3.7x** |

That lands VL at ~415 ms against deno 223.7 ms and rust 116.3 ms — still 1.9x behind V8, but the
remainder is ordinary "VL does not inline" headroom, not a 15x cliff, and it is recovered *without*
`wasm-opt` and *without* the callee being statically known.

**Optional second fix, complementary and cheaper to implement:** hoist the closure unpack out of
loops when the closure expression is a local that is not reassigned in the loop (variant G:
1072.7 -> 101.5 ms, **10.6x**). This is strictly better than the table change *when it applies* —
it removes the load entirely rather than making it cheap — but it only applies to loop-invariant
closures, so it is a complement, not a substitute. Applying both gives ~380 ms on this benchmark.

**Do not "fix" this by typing field 0 more precisely** — measured 14% *slower* (variant F).

---

## 8. Classification

**compiler-fixable.** The proximate cost is a wasmtime implementation gap (funcref-in-GC-heap is a
libcall, with wasmtime's own TODO to remove it), but VL is not obliged to use that representation:
the alternative (`call_indirect` on the function index the closure struct *already stores*) is
standard wasm, needs no new information, changes no language semantics, and is measured at 7.3x on
the hot phase. Reporting this as `runtime-engine` would be wrong, because a purely emitter-side
change recovers 5.4x of the benchmark.

Secondary note for the *language-design* column: it is **not** a language-design defect, because
there is no VL spelling of a lambda that avoids it — the contortion in `opt.vl` is "stop using a
lambda". The 15.1x idiom-vs-hack gap is real and is the largest in the suite, but it closes
entirely with the emitter change; users do not need a different spelling, they need a different
lowering.

---

## Appendix — reproduction commands

```bash
cd /workspace
V=./scripts/vl-host/target/release/vl
$V build bench/algorithms/lambda-hot/main.vl -o /tmp/main.wasm
taskset -c 6 $V run /tmp/main.wasm                       # ~2259 ms
VL_WASM_OPT=$PWD/node_modules/binaryen/bin/wasm-opt \
  $V build bench/algorithms/lambda-hot/main.vl -O -o /tmp/main-O.wasm
taskset -c 6 $V run /tmp/main-O.wasm                     # ~179 ms
./node_modules/binaryen/bin/wasm-dis /tmp/main.wasm      # the loop in section 2 above
```

The hand-written WAT bisection variants (A-H, plus the creation probes) are in
`/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/lh/` as
`v_direct_nogets.wat`, `v_geti32_drop.wat`, `v_getenv_nonnull_drop.wat`, `v_getfn_drop.wat`,
`v_base.wat`, `v_nocast.wat`, `v_hoist.wat`, `v_table.wat`, `n_i32.wat`, `n_null.wat`, `n_fn.wat`;
assemble with `node_modules/binaryen/bin/wasm-as --enable-gc --enable-reference-types`.
