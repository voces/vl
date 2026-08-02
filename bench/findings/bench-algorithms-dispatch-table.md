# dispatch-table — root cause

**Verdict: compiler-fixable.** Every read of a function value out of a WasmGC object
compiles, in wasmtime 47, to a **host libcall** (`get_interned_func_ref`). It costs
**~10.3 ns / ~50 cycles per read** and cranelift cannot hoist it, CSE it, or dead-code it.
VL puts a `funcref` in field 0 of its closure fat-pointer, so every call through a
function value pays it. The actual `call_ref` costs ~0.1 ns. Wrong field type, not a
slow call.

A hand-applied prototype of the fix (delete the `funcref` field, reuse the closure
record's *existing* `id` field — which already holds the wasm funcidx — as an index into
an active `funcref` table, call `call_indirect`) takes the benchmark from
**1255 ms → 382 ms (3.3x)** with byte-identical output, and moves VL from 3.1x deno to
**faster than deno**.

---

## 1. Reproduction

Machine i9-12900KF, `taskset -c 8`, min-of-5 wall clock, VL from a **prebuilt** module.
Other benchmark agents were using the box concurrently; core 8 was free and the totals
land within 1% of `meta.json`'s recorded values, so the numbers are sound.

| | phase 1 if/else | phase 2 array of fn | phase 3 fn in struct field | total |
|---|---|---|---|---|
| rust `-O` | — | — | — | **147 ms** |
| deno | — | — | — | **409 ms** |
| **VL (as emitted)** | **104 ms** | **623 ms** | **569 ms** | **1255 ms** |
| python (n/10) | — | — | — | 1227 ms |

Reproduces exactly. Scale check 50M → 100M on phase 2: 587 → 1183 ms (**2.02x**);
on the prototype 141 → 301 ms (2.13x). Nothing is folded.

`vl build -O3` is a real no-op here: 1329 ms vs 1255 ms. (Note `-O3` silently
degrades to unoptimized unless `$VL_WASM_OPT` is set — `wasm-opt` is not on PATH in
this container. The 1329 ms above is a *genuine* `--closed-world -O3 --gufa` build.)

## 2. What the emitter produces

`wasm-dis` of the phase-2 hot loop. The closure fat-pointer type is

```wat
(type $3 (struct (field funcref) (field structref) (field i32)))
;;                     ^ code          ^ env            ^ id = gImports+fe
```

and the call site is

```wat
(local.set $6 (ref.as_non_null (array.get $1 <arr> (select <i> -1 <inbounds>))))
(call_ref $4
  (struct.get $3 1 (local.get $6))        ;; env
  (local.get $5)                          ;; the i32 arg
  (ref.cast (ref $4) (struct.get $3 0 (local.get $6))))   ;; <-- code, a funcref field
```

Emitted by `compiler/emit_sections.vl:3535-3552` (the struct type) and
`compiler/wasmEmit.vl` `emitCallRef` (~9296-9311), the callback-loop helper (~11166-11184)
and the field-call path (~14531-14552).

Everything in that sequence *looks* like the usual suspects — an unhoisted bounds check,
a null check, a `ref.cast`. **All of them are innocent.**

## 3. Bisection — WAT surgery on the emitted module

Each variant is the compiler's own `p2.wat` with exactly one thing changed, reassembled
with `wasm-as`, same output (`492544`).

| variant | change | min ms |
|---|---|---|
| `v_base` | control (wasm-as roundtrip) | 645 |
| `v_nobounds` | drop the `select`/`lt_u` bounds check | 606 |
| `v_nocast` | field 0 typed `(ref $4)`, `ref.cast` deleted | 680 |
| `v_both` | bounds check **and** cast deleted | 693 |
| `v_funcrefarr` | closure record deleted entirely, plain `funcref[]` | 669 |
| `v_mono` | index forced to 0 — one call target, perfectly predicted | 630 |
| **`v_directcall`** | **all loads kept, `call_ref` → `call $0`** | **106** |

Removing the bounds check buys 6%. Removing the cast, the closure record, or the branch
unpredictability buys **nothing**. Making the call direct buys **6.1x** — but the loads
were still there, so the cost is not "the loads" either. That points at one thing: the
funcref value itself.

## 4. Isolating it — hand-written WAT, one struct in a loop-invariant local

```wat
(type $box  (struct (field funcref)     (field i32)))
(type $box2 (struct (field (ref $sig))  (field i32)))
```

| | loop body (50M iters) | min ms |
|---|---|---|
| E | `call_ref (ref.cast (ref $sig) (struct.get $box 0 $b)))` | 545 |
| **F** | **`(drop (struct.get $box 0 $b))` + a plain `call $op0`** | **563** |
| G | `call_ref (struct.get $box2 0 $b2)` — concretely typed field, no cast | 651 |
| **H** | **`(drop (struct.get $box 1 $b))` + a plain `call $op0`** — i32 field | **50** |

Read the same struct's **i32** field and throw it away: 50 ms.
Read the same struct's **funcref** field and throw it away: **563 ms**.
Same struct. Same loop. Same immutable fields. Same loop-invariant local.

Two things follow immediately:

* the funcref field read costs **(563 − 50) / 50M = 10.3 ns ≈ 50 cycles**;
* it is **not a load**. Cranelift dead-codes an unused load of an immutable field, and
  hoists a loop-invariant one. It did neither. Whatever `struct.get` of a funcref lowers
  to is opaque and unremovable.

And the raw call instructions are all cheap (hand-written WAT, no GC objects involved):

| | min ms | marginal ns/call |
|---|---|---|
| direct `call` | 55 | (baseline, 1.1 ns/iter) |
| `call_ref` on a funcref held in a **local** | 60 | **+0.1** |
| `call_indirect`, 4-way rotating index | 111 | +1.1 |
| `call_indirect`, constant index | 65 | +0.2 |

`call_ref` is free. The benchmark's title instruction is not the problem.

## 5. The mechanism, from wasmtime's source

`wasmtime-internal-cranelift-47.0.2/src/func_environ/gc.rs:364-378`, the read path for a
funcref-typed GC field:

```rust
let func_ref_id = builder.ins().load(ir::types::I32, flags, addr, 0);
let get_interned_func_ref = func_env.builtin_functions.get_interned_func_ref(builder.func);
let call_inst = builder.ins().call(get_interned_func_ref, &[vmctx, func_ref_id, expected_ty]);
```

A GC heap field is 32 bits, so wasmtime cannot store a `VMFuncRef` pointer there. It
stores a `FuncRefTableId` and **calls out to the runtime on every read**. The callee
(`wasmtime-47.0.2/src/runtime/vm/libcalls.rs:573`) builds an `AutoAssertNoGc` guard, decodes
the id, and — when the field is *concretely* typed rather than plain `funcref` — takes the
`get_typed` path, which looks up the engine signature registry and runs a subtype check.
That is why variant **G** (concretely typed field, 651 ms) is *slower* than **E** (plain
`funcref` field + a cheap inline `ref.cast`, 545 ms), and why `v_nocast` was a pessimization.

Collector-independent, as expected for a representation issue rather than a barrier:
`VL_GC=auto/tracing/refcount/none` → 520 / 515 / 531 / 539 ms on variant F.

### Why `-O3` reads 0.97x

GUFA + `--closed-world` does excellent work on this module — it removes the env
parameter, the bounds check, the null check and the cast, and narrows field 0 to
`(ref $5)`, leaving a two-instruction loop body:

```wat
(call_ref $5 (local.get $0) (struct.get $1 0 (array.get $3 <arr> (i32.and (local.get $0) (i32.const 3)))))
```

…and it is *still* 1329 ms, because that `struct.get` is still a libcall — now on the
slower typed path. **The emitted wasm is already near-optimal at the wasm level.** No
amount of binaryen work can fix this; only changing what VL stores in the field can.

## 6. Prototype of the fix — measured

The closure record's field 2 (`id`) **already holds `gImports + fe`, the wasm function
index**, and `emit_sections.vl:2490-2510` **already emits an element segment listing
every user function at exactly that index** — as a *declarative* segment (flags `0x03`),
purely to legalize `ref.func`.

Promote that segment to an **active** segment into a `funcref` table, delete field 0, and
call `call_indirect` on the id. Three lines of semantic change; the fat pointer shrinks
from 3 fields to 2. Applied by hand to the compiler's own output:

```wat
(table $t 8 8 funcref)
(elem (i32.const 4) $0 $1 $2 $3)          ;; imports occupy 0..gImports-1
(type $3 (struct (field structref) (field i32)))   ;; env, table index — funcref field GONE
...
(call_indirect $t (type $4)
  (struct.get $3 0 (local.get $6))        ;; env
  (local.get $5)
  (struct.get $3 1 (local.get $6)))       ;; the id, now the table index
```

| | as emitted | prototype | speedup |
|---|---|---|---|
| phase 2 (array of function values) | 623 ms | **136 ms** | **4.6x** |
| phase 3 (function value in a struct field) | 569 ms | **151 ms** | **3.8x** |
| **whole benchmark** | **1255 ms** | **382 ms** | **3.3x** |

Output identical (`492544` x3). Scale-verified 2.13x at 2N. Table size is irrelevant
(4096-entry table: 134 ms), so this scales to a real program's full function set.

Landscape after the fix:

| | rust | **VL (prototype)** | deno | VL (today) | python(n/10) |
|---|---|---|---|---|---|
| total | 147 ms | **382 ms** | 409 ms | 1255 ms | 1227 ms |
| vs rust | 1.0x | **2.6x** | 2.8x | 8.5x | — |

VL goes from **losing to V8 by 3.1x to beating it**, on the exact shape (plugin registry,
bytecode interpreter, state machine) where losing to a JIT is a defect.

Notes for whoever lands it:
* `call_indirect` type-checks the funcref at runtime and traps on mismatch — it *replaces*
  the `ref.cast` trap, so trap behavior is preserved, not weakened.
* Function-value `==` already compares field `id` (`ref.eq` does not work on funcrefs);
  that is untouched, and the id keeps meaning the same thing.
* The `$fnsig` interning machinery (`cloSigKeys`, `emitSynthCloSig`) is unchanged —
  `call_indirect` takes the same `$fnsig` typeidx the `call_ref` took.
* Applies to `wasmEmit.vl`'s four `call_ref` sites (`emitCallRef` ~9296, the callback loop
  ~11166, the field call ~14531, and the freshly-built-closure path ~14463) and to
  `emit_sections.vl:3535` + `:2490`.

## 7. Same root cause elsewhere

This is not specific to arrays or struct fields — it is **any** function value that lives
in a GC object, which in VL is every function value that is not immediately called. It is
the same root as `recursion/lambda-hot`. Variant E above holds its closure in a
**loop-invariant local** with an **immutable** field, the most hoistable shape possible,
and still pays 10.3 ns per iteration.

## 8. Residual gap after the fix (secondary, not this finding)

Phase 1 — direct calls, no function values at all — is VL 104 ms vs rust 27 ms. A pure
direct-call loop in hand-written wasm is 55 ms / 50M = 1.1 ns per call; LLVM inlines
`op0` to nothing. That is wasmtime's non-inlining call overhead and is a separate,
much smaller axis. After the dispatch fix it becomes VL's dominant remaining gap here.

## 9. Idiom-vs-hack gap (today, unfixed)

The only fast VL spelling of a 4-way dispatch is to *not use a dispatch table*: the
if/else chain is 104 ms vs 623 ms for the array of function values — a **6.0x** penalty
for the idiomatic spelling. That workaround does not survive contact with a real
registry of 50 handlers. There is no VL spelling of a genuine dispatch table that avoids
the cost today, which is exactly why this must be fixed in the emitter rather than
documented as a tip.

## Artifacts

All probes are outside the repo, in
`/tmp/claude-1000/-workspace/2affa9b0-2835-43ff-8cfe-223a7861ce47/scratchpad/dt/`:
`p1.vl p2.vl p3.vl` (per-phase VL), `v_*.wat` (bisection variants),
`micro.wat` (raw call-instruction costs), `micro2.wat` (the funcref-field isolation),
`v_idtable.wat` / `v_p3_idtable.wat` / `v_full_tableidx.wat` (the prototype fix).
No compiler source was modified.
