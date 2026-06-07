# Getting off V8: binaryen after self-hosting

> Status: **investigation / direction, not landed.** The self-hosted byte
> emitter (`compiler/wasmEmit.vl`, Track H) is the thing that makes this
> possible; it is mid-build (params, arithmetic, calls, control flow, locals,
> `while` loops emit today). This doc records _how_ the CLI sheds its V8 +
> `binaryen.js` dependency once the front end and codegen self-host, so the
> decision is already framed when we get there. The final word lands in
> `DECISIONS.md` (same convention as `docs/modules-design.md`).
>
> Two prior decisions bound this: **H4** ("self-hosted WASM emission: emit bytes
> directly + optional `wasm-opt`") and **C5** (today's `deno compile` binary
> embeds `binaryen.js`). This doc is the bridge between them and the off-V8
> end-state.

## Why this exists

Today the shipped `vl` binary is **V8 + the TypeScript compiler +
`binaryen.js`** (`deno compile`, C5). V8 is there only because the compiler is
written in TypeScript; `binaryen.js` is there because `compiler/toWasm.ts` uses
binaryen for _everything_ — building the IR, validating it, and optimizing it.
Self-hosting retires the TypeScript compiler, which is what lets us drop V8. But
binaryen does not automatically go with it: the question is what role (if any)
binaryen plays once VL compiles VL, and how it is reached from a runtime that is
**not** a JS engine.

The short answer: **binaryen's role collapses from "IR builder" to "optional
optimizer," and an optimizer is reachable without any JS engine** — via the
`wasm-opt` CLI (zero bindings) or a thin libbinaryen FFI slice (~a handful of C
calls). The hard work is not the binding; it is emitting _valid_ wasm without
leaning on binaryen to fix it up first.

## binaryen is two tools wearing one hat

`compiler/toWasm.ts` uses binaryen in two fundamentally different ways, and only
one of them survives self-hosting:

1. **As an IR builder.** Almost the entire backend is `m.<op>(...)` calls —
   `m.i32.const`, `m.local.get`, `m.struct.new`, `m.block`, `m.if`, … — that
   construct binaryen's in-memory IR node by node. There are **~640 such call
   sites** in `toWasm.ts` (84× `m.i32.const`, 83× `m.local.set`, 75×
   `m.local.get`, 58× `m.block`, and a long tail). This _is_ the backend. It is
   a library binding used as the codegen data structure.

2. **As a validator + optimizer + encoder.** After the IR is built,
   `m.validate()`, `m.optimize()` (Heap2Local, etc.), and `m.emitBinary()` turn
   it into bytes.

The self-hosted backend (`compiler/wasmEmit.vl`) **does not build binaryen IR at
all** — it emits the wasm binary encoding directly into a byte buffer
(`emitProgram` → sections → LEB128 → opcodes). So role (1), the ~640 builder
calls, simply **does not exist** in the self-hosted world. There is nothing to
port. Role (2) is the only thing left to account for, and it splits further:

- **Encoding** we already do ourselves (that is what `wasmEmit.vl` _is_).
- **Validation** we want as a dev/test aid, not a runtime dependency.
- **Optimization** (the Heap2Local scalarization that makes WasmGC allocations
  cheap) is the one genuinely valuable thing binaryen still offers, and it is
  _optional_ — correct-but-unoptimized wasm still runs.

So the transition is not "reimplement 640 binaryen calls." It is "decide how the
self-hosted compiler reaches an **optimizer** for a byte buffer, off V8."

## Three ways to reach the optimizer off-V8

Ranked by how much binding surface they cost:

### A. `wasm-opt` subprocess — zero bindings (the H4 default)

Spawn the `wasm-opt` native CLI, pipe the emitted module in on stdin, read the
optimized module back on stdout. **No FFI, no embedded library, no JS engine** —
just process spawn, which every target runtime (wasmtime + WASI, a native host,
…) can do. This is already the H4 decision: `wasm-opt` is treated as an
_optional_ post-pass. Cost: `wasm-opt` must be on `PATH` (or shipped alongside),
and we pay a process spawn per build. For a batch compiler this is nothing; for
editor/`vl run` latency it is a (later) concern.

### B. libbinaryen via FFI — a thin C slice (~5–6 calls)

binaryen also ships a stable **C API** (`binaryen-c.h`). Used as an _optimizer
over bytes_ (not an IR builder), the entire surface we need is roughly:

- `BinaryenModuleRead(bytes, len)` → module
- set features (enable **GC**, reference types, etc.)
- `BinaryenModuleOptimize(module)` (or run a named pass list)
- `BinaryenModuleAllocateAndWrite(module)` → bytes
- `BinaryenModuleDispose(module)`

That is **~5–6 C calls**, versus the ~640 builder calls the TS backend makes —
because we hand binaryen a finished module and ask only "optimize this," rather
than driving its IR construction. The cost here is a real FFI boundary (see
_byte handoff_ below) and shipping/linking `libbinaryen`. The upside over (A) is
in-process optimization with no subprocess and no `PATH` dependency.

### C. Drop optimization — needs B-validwasm first

Ship unoptimized wasm and lean on the runtime's own optimizing JIT (wasmtime's
Cranelift). Cheapest of all (no binaryen anywhere), at the cost of the
Heap2Local scalarization binaryen does that Cranelift does not. **This is only
viable once the emitter produces wasm that validates without an optimize pass**
— see the prerequisite below.

## The load-bearing prerequisite: B-validwasm

Today some constructs only become _valid_ wasm **after** `optimize()` runs —
binaryen's pass pipeline is quietly fixing up things the naive emission gets
wrong. As long as that is true, optimization is **not** actually optional: the
"unoptimized" path produces modules that don't validate, so options (A)/(B) are
load-bearing and (C) is off the table. **B-validwasm** — emit wasm that
validates _as emitted_, with no optimize dependency for correctness — is
therefore the gate that turns optimization back into a genuine choice. It is the
single most valuable piece of work for this transition, independent of which
optimizer option we pick, because it is what lets the optimizer be _optional_ at
all.

## The FFI byte handoff (option B): H4.5

If we take the libbinaryen route, the self-hosted compiler holds its emitted
module as a **VL WasmGC `array`** (managed heap), but `BinaryenModuleRead` wants
a pointer into **linear memory**. So there is a marshaling step: copy the WasmGC
byte array out to a linear-memory buffer the C side can see, call across, and
copy the returned buffer back. This **WasmGC-array ↔ linear-memory ↔
libbinaryen** handoff (tracked as **H4.5**) is the only real engineering in
option B; the C call surface itself is trivial. Option A (`wasm-opt` subprocess)
sidesteps it entirely — bytes go out a pipe, not across an FFI boundary — which
is part of why it is the default.

## Target runtime

The self-hosted compiler is itself a WasmGC program, so the host that runs it
must support **WasmGC**. **wasmtime** is the reference target: WasmGC reached a
stable, on-by-default state in recent wasmtime (≈v27+), and it has first-class
WASI for the process-spawn (option A) and FFI (option B) needs. Validation as a
dev aid can stay on whatever is convenient (binaryen's validator,
`wasm-tools validate`) without that becoming a runtime dependency.

## Sequencing

1. **Finish the self-hosted backend** (`wasmEmit.vl`) — in progress. This is
   what deletes role (1) and the ~640 builder calls.
2. **B-validwasm** — make emission validate without `optimize()`. Turns
   optimization optional; unblocks option C and de-risks A/B.
3. **Default to option A** (`wasm-opt` subprocess) per H4 — zero new binding
   surface, works on any WASI host.
4. **Keep option B (libbinaryen FFI + H4.5) as an in-process upgrade** for when
   subprocess latency or `PATH` dependence actually bites (editor/`vl run`).
5. **Drop V8** once the TS compiler is retired — independent of which optimizer
   option is live, because none of A/B/C needs a JS engine.

The throughline: self-hosting removes the _reason_ V8 is shipped (the TS
compiler), and direct byte emission removes the _reason_ binaryen is shipped as
a builder. What remains — an optional optimizer over a byte buffer — is
reachable from a JS-engine-free runtime by the cheapest of means, and the real
work is making that optimizer _optional_ (B-validwasm) rather than wiring up the
binding.
