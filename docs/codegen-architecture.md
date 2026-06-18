# Codegen architecture: a builder layering for `wasmEmit.vl`

> Status: **design / analysis, not landed.** This doc analyses the self-hosted
> WasmGC emitter (`compiler/wasmEmit.vl`, `emitProgram`) and proposes a layered
> builder refactor. It changes no code; it is the decision input for the refactor.
> Owner's framing: *"the actual wasm code emission is kind of a mess — we're mixing
> up actual logic with doing binary writing. We should probably adopt a sort of
> builder pattern."* The perf pass (`docs/perf-findings.md`) independently flagged
> the want for *"a proper binary-writer/builder abstraction."*

---

## 0. TL;DR

- **The mess is real and measurable.** `wasmEmit.vl` is one flat 6,848-line file
  in which **lowering logic** (type/scope/narrowing resolution, per-type interning
  tables, scratch-frame layout) is interleaved line-by-line with **raw byte
  writing** (opcode bytes, LEB128, section framing). Counted in the current file:
  **657** bare `body.push(<opcode>)` sites, **271** `appendAll(<buf>, ulebToArr/
  slebToArr(...))` LEB pairs, **108** bare `push(251)` (`0xfb` GC-prefix) sites,
  and a **16-arm `kind == N`** valtype switch (`pushVT`) that every new type kind
  must extend. Adding a type kind (the union/ref-list/string-list/map history) is
  the recurring ~50-site migration the owner feels.
- **It does some things well.** It emits **lean, validated bytes directly** with
  no intermediate IR, no optimizer dependency for correctness goal (B-validwasm),
  and it deliberately avoids closures/builder-objects so it can self-compile. The
  refactor must preserve all three.
- **Recommended layering** (three layers, thin):
  1. **`BinaryWriter`** — pure bytes: `u8`, `bytes`, `uleb`, `sleb`, `name`,
     section framing. *Zero compiler knowledge.*
  2. **`WasmModule` / `FuncBuilder`** — typed wasm builder: `internStruct`,
     `internArray`, `localGet`, `structNew`, `arrayNewFixed`, valtype writing,
     locals/scratch bookkeeping. *Knows wasm, not VL.*
  3. **lowering** — the existing `emit*` functions, now calling builder methods
     instead of pushing bytes. *Knows VL, not byte encoding.*
- **Where VL should sit on the IR↔thin-builder spectrum: firmly at the THIN end** —
  a *streaming* builder (methods append bytes immediately behind a named API), **not**
  a binaryen-style in-memory node IR. VL targets lean wasm and the compiler itself
  runs in wasm; a node-tree IR would bloat the emitted compiler and buy nothing
  (binaryen stays available as the optional external optimizer per
  `docs/binaryen-transition.md`). This is the **wasm-encoder** shape, not the
  **binaryen** shape.
- **Migration is incremental and low-risk**: introduce `BinaryWriter` first
  *behind the existing helpers* (`emitByte`/`emitULEB`/`ulebToArr` already ARE a
  proto-writer), then strangler-fig the typed `FuncBuilder` section by section,
  keeping all selfhost tests green at every checkpoint.

---

## 1. Diagnosis: what `wasmEmit.vl` actually looks like today

`emitProgram(rootIx)` is the live bootstrap emitter (the file's header comment
about "two fixed modules" describes an earlier spike; the real entry point is
`emitProgram` → `emitModule` → per-function `emitFuncCode` → the `emit*`
expression/statement lowerers). It is structured in three *conceptual* layers
that are **not** separated in the code:

### 1.1 The proto-writer that already exists (lines 17–132)

There is, in effect, an embryonic binary writer at the top of the file:

| function | role |
|----------|------|
| `emitByte(b)` | append one masked byte to `W.bytes` |
| `emitBytes(bs)` | append a byte array |
| `ulebToArr(v)` / `slebToArr(v)` | LEB128 encode into a *fresh* `i32[]` |
| `emitULEB(v)` | streaming ULEB straight to `W.bytes` |
| `appendAll(dst, src)` | in-place concat (works around H4.6: no `dst.push(...src)`) |
| `emitSection(id, payload)` | `id` + `uleb(len)` + payload |

This is the *good* core. The problem is that **above this line, nothing uses a
typed API** — the 600+ `emit*` lowering sites reach past it and hand-write opcode
bytes and LEB operands inline.

### 1.2 Entanglement: lowering logic interleaved with byte writing

The canonical example is `emitPush` (lines 3762–3918), which lowers `xs.push(x)`.
It is ~150 lines where *every* control-flow decision (which list kind? bare local
or struct-field receiver? which scratch base?) is interleaved with raw byte
emission:

```vl
// (excerpt from emitPush — lowering decisions + raw bytes, intermixed)
let lTy = lTypeIdx                       // ── lowering: pick the wrapper type
let aTy = aTypeIdx
let base = pushScratchBase
if isRef {
  let rslot = refListSlotOfExpr(callee.memObj, fnIx)   // ── lowering
  lTy = rlWrapIdx[rslot]; aTy = rlBackIdx[rslot]; base = refPushScratchBaseFor(rslot)
}
...
pushListLen(body, lIdx, lTy)             // helper that itself hand-writes struct.get
pushListCap(body, lIdx, lTy)
body.push(70)          // 0x46 i32.eq    // ── raw byte
body.push(4)           // 0x04 if        // ── raw byte
body.push(64)          // 0x40 void blocktype
...
body.push(251)         // 0xfb           // ── raw byte (GC prefix)
body.push(7)           // array.new_default
appendAll(body, ulebToArr(aTy))          // ── raw LEB operand
```

Each `body.push(<number>) // <comment naming the opcode>` is a place where the
reader must trust a magic number against a hand-written comment. There are **657**
such sites. The same pattern recurs in `emitObj` (struct.new, 1517–1570),
`emitVariantStruct`/`emitUnionBox` (union boxing), the whole `emitMap*` family
(open-addressing hash map lowered as raw probe/rehash byte sequences,
2147–2920), and the string ops (`emitStrConcat`/`emitStrEq`/`emitStrSlice`).

### 1.3 The interning tables (lowering state) and the valtype switch

Type lowering is spread across **parallel-array interning tables** declared as
module-level `let`s (VL has no maps-in-this-layer, so each "table" is several
parallel `i32[]`/`string[]`):

- **structs**: `sNames`, `sFieldNames`, `sFieldStart`, `sFieldCount`,
  `sFieldTypes`, `sFieldElemName`, `sHeapIdx` (605–614).
- **ref-lists**: `rlElemName`, `rlElemHeap`, `rlBackIdx`, `rlWrapIdx`,
  `rlElemKindTbl` (689–693) — one distinct (backing, wrapper) pair per distinct
  element type, with `rlInternName`/`rlSlotByName` as the intern/lookup pair.
- **unions**: `unNames`, `unVarStart`, `unVarCount`, `uVariants`, `uTags`,
  `uFieldNames`, … (801–821).

`pushVT(payload, kind, structIdx)` (4764–4790) is the **single valtype-writing
switch** every ref kind funnels through: a 16-arm `if kind == 1 … else if kind ==
2 …` ladder mapping each kind to `0x64 <heapIdx-uleb>`. This is the *one* place
where the layering is already half-right — it centralises "kind → valtype bytes".
But it is reached from dozens of call sites, and **adding a kind means touching
both `pushVT` AND the parallel table AND each `*Used` flag AND the type-section
emission AND the scratch-frame reservation** — that is the ~50-site migration.

### 1.4 The rec-group / type-section layout (one big arithmetic block)

`emitModule` (4799–5055) computes every heap-type index by hand, in one long
offset-arithmetic block: `structOffset`, `unionOffset`, `arrayOffset`,
`listOffset`, `refPairBase`, `mStructIdxPre`, `preMap`, `typeOffset`, … each a
running sum, with comments tracking the invariant *"this type references one that
lands later, so it must go in the single rec group."* The whole type section is
emitted as **one recursion group** (`0x4e <count>`) precisely so a struct field
can forward-reference the raw-array type. This is correct and clever, but it is
**hand-laid index arithmetic** — there is no `internType`-returns-an-index
abstraction; indices are computed positionally and must stay in lockstep with the
emission order below. A miscount is a silent mis-encode.

### 1.5 The per-function scratch frames (layout logic in `emitFuncCode`)

`emitFuncCode` (4352–4566) reserves **scratch locals** for inline-expanded
operations (`.push`, ref-push, string-push, string-ops, maps). Each kind gets a
distinct frame, laid out by hand as running offsets off `params + declaredLocals`:

```vl
pushScratchBase    = nParams + nLocals
refPushScratchBase = nParams + nLocals + i32Scratch            // +4 if fnUsesPush
strPushScratchBase = nParams + nLocals + i32Scratch + refScratch
strScratchBase     = ... + strPushScratch                      // +4 if fnUsesStrPush
mapScratchBase     = ... + strScratch                          // +7 if fnUsesStrOp
```

…and then the **locals vector** must be emitted with a matching count
(`nRuns = nLocals + 4? + refScratch + 4? + 7? + 12?`) and matching valtype runs,
hand-written `body.push(1); body.push(0x7f)` per slot. The frame layout
(allocation) and the locals-vector encoding (bytes) are two views of the same
fact, kept in sync **manually** in two different places. A `FuncBuilder` that owns
local allocation (`addLocal(valtype) → index`) would make these one fact.

### 1.6 What it does WELL (and must be preserved)

- **Direct, lean bytes.** No node IR, no second pass; the byte buffer *is* the
  output. This is the whole point of the self-host backend (`docs/binaryen-
  transition.md`: role (1), the ~640 binaryen builder calls, *does not exist*
  here — there is nothing to port, only encoding).
- **No optimizer dependency for correctness** is the goal (B-validwasm).
- **Self-compilable on purpose.** It uses only top-level functions, module-level
  mutable `let` globals, structural types, and `i32[]` buffers — and **zero
  closures/callbacks** (a file-wide grep finds none in hot paths). That is a
  hard constraint, not an accident (see §4).
- **Section framing is already factored** (`emitSection`) and the LEB encoders are
  already centralised — the writer layer is *80% present*, just not *enforced*.

---

## 2. How other compilers structure codegen

The universal pattern across mature codegens is a **three-tier split**:
**typed IR / lowering** ↔ **instruction building** ↔ **binary (or assembly)
encoding**. What differs is *how heavy* the middle tier is. VL's question is
exactly "how heavy should our middle tier be," so the comparison is organised by
that axis.

### 2.1 binaryen — heavy IR builder (what VL's *host* emitter uses)

`compiler/toWasm.ts` builds **binaryen IR**: every operation is an `m.<op>(...)`
call returning an in-memory expression node, composed into trees
(`m.struct.new([m.i32.const(index), env], heapType)`), with `TypeBuilder` for rec
groups. binaryen then validates, **optimizes** (Heap2Local scalarisation, block/
temp cleanup), and encodes. The layers are: *your lowering* → *binaryen node IR*
→ *binaryen encoder*. The middle tier is a full mutable IR you can re-traverse and
optimise. This is powerful but heavy — the IR is the data structure, and the
optimiser is the reason it exists. **AssemblyScript** sits here too: its module
layer is a thin wrapper that drives binaryen as the backend, then
`validate/optimize/emit`. ([AssemblyScript Architecture](https://github.com/AssemblyScript/assemblyscript/wiki/Architecture);
[web.dev: Binaryen](https://web.dev/articles/binaryen))

### 2.2 LLVM — many layers, hard boundaries (the canonical reference)

LLVM separates: **LLVM IR** (built via `IRBuilder`) → **SelectionDAG /
MachineInstr** (instruction selection) → the **MC layer**, where `MCStreamer` is
"an assembler API" with one method per directive (`EmitInstruction(MCInst)`,
`emitValue`, `EmitLabel`, `switchSection`), implemented separately as
`MCAsmStreamer` (text `.s`) or `MCObjectStreamer` (ELF/object bytes). The crucial
boundary for VL: **`MCStreamer` knows labels, sections, and instructions, but
nothing about "constant pools, jump tables, global variables"** — the high-level
concepts are lowered *away* before the encoder sees them. Encoding is a dumb,
well-tested sink; all the *decisions* happen above it. ([Intro to the LLVM MC
Project](https://blog.llvm.org/2010/04/intro-to-llvm-mc-project.html); [LLVM Code
Generator docs](https://llvm.org/docs/CodeGenerator.html))

### 2.3 Cranelift / Wasmtime — IR + smart buffer (mid-weight)

Cranelift: **CLIF IR** built via the `InstBuilder` trait (`builder.iadd(a, b)`) →
lowering to `MachInst` (machine instructions) → emission through the `binemit`
module into a **`MachBuffer`**, a "smart machine-code buffer that knows about
branches and edits them on-the-fly." `MachBuffer` is more than a dumb sink — it
does branch relaxation and patch regions during emission — but it is still *below*
the IR and lowering. The takeaway: even Cranelift's clever buffer keeps **branch
fixups in the buffer, not in the lowering** — the lowering emits placeholders and
the buffer patches them. ([cranelift InstBuilder](https://docs.rs/cranelift-codegen/latest/cranelift_codegen/ir/trait.InstBuilder.html);
[cranelift binemit](https://docs.rs/cranelift-codegen/latest/cranelift_codegen/);
[Cranelift isel blog](https://cfallin.org/blog/2021/01/22/cranelift-isel-2/))

### 2.4 `wasm-encoder` / `wasm-tools` — pure encoder, no IR (the thin end)

This is the closest analogue to what VL *should* build, and the most instructive.
`wasm-encoder` is **a pure binary encoder with no compiler/optimizer knowledge**.
Its shape:

- **`Module`** is the top-level container; you build a **section** with a
  section-specific builder (`TypeSection`, `FunctionSection`, `CodeSection`,
  `ExportSection`, …) and `Module::section(&builder)` it in.
- **`Function`** holds a body; **`Function::instructions()`** yields an
  **`InstructionSink`** with one method per opcode that *streams bytes
  immediately*: `.local_get(0).i32_add().end()`.
- **LEB128 is fully hidden** (delegated to `leb128fmt`); callers work with
  semantic values, never continuation bits.
- `Module::finish()` returns the `Vec<u8>`.

There is **no intermediate node IR**: each builder method appends bytes to a
growing buffer. wasm-tools' own `Module::encode()` uses exactly this to serialise
its resolved AST, and the parser↔encoder pair (`wasmparser` → `Reencode` →
`wasm-encoder`) shows the encoder is a standalone, dumb layer. ([wasm-encoder
docs](https://docs.rs/wasm-encoder); [wasm-tools wasm-encoder
README](https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wasm-encoder/README.md))

**This is the architecture VL's `emitProgram` is 80% of the way toward already —
it just hasn't drawn the API boundary.** `emitSection` ≈ `Module::section`;
`ulebToArr`/`slebToArr` ≈ the hidden `leb128fmt`; what's missing is the
`InstructionSink` (a `body.localGet(i)` instead of `body.push(32); appendAll(body,
ulebToArr(i))`).

### 2.5 Zig self-hosted backends — direct emission, no LLVM IR (thin, validated at scale)

Zig's self-hosted backends "produce machine code directly," bypassing LLVM
bitcode entirely; the effort explicitly **isolated machine-code generation from
the linker** and even re-implemented the LLVM *Builder API* in Zig to emit bitcode
without linking libLLVM. The lesson for a self-hosting language: a **direct,
thin, hand-written emitter is a legitimate production architecture** — it is the
path Zig chose for fast debug builds and for shedding a heavy C++ dependency,
exactly mirroring VL shedding binaryen-as-builder. ([Goodbye to the C++
Implementation of Zig](https://ziglang.org/news/goodbye-cpp/); [Zig self-hosted
x86 backend default in Debug](https://lobste.rs/s/fmof95/zig_s_self_hosted_x86_backend_is_now))

### 2.6 Synthesis — which boundary pays off

| compiler | IR tier weight | encoder tier | boundary that pays off |
|----------|----------------|--------------|------------------------|
| binaryen / AssemblyScript | **heavy** (mutable node IR) | own encoder | IR enables a real optimizer |
| LLVM | heavy (IR→DAG→MI) | **MC / MCStreamer** (dumb sink) | high-level concepts lowered *away* before encoding |
| Cranelift | mid (CLIF→MachInst) | **MachBuffer** (smart-ish) | branch fixups live in the buffer, not lowering |
| **wasm-encoder** | **none** | **the whole thing** (streaming) | encoder is a typed, dumb, reusable byte sink |
| Zig self-hosted | thin | direct | a thin hand-written emitter scales to production |

The **consistently load-bearing boundary** is the bottom one: *a typed encoder
that knows opcodes/sections/LEB but nothing about the source language.* Every
project has it; only the optimiser-bearing ones add a heavy IR above it. VL needs
the bottom boundary badly and the heavy IR not at all (binaryen remains the
external optimiser — `docs/binaryen-transition.md`).

---

## 3. Recommended architecture for VL's `emitProgram`

Three thin layers. **No node IR.** Streaming bytes behind a typed API — the
wasm-encoder model, expressed in self-compilable VL.

```
┌─────────────────────────────────────────────────────────────┐
│ LOWERING  (the existing emit* functions, slimmed)            │
│   emitObj / emitPush / emitExpr / emitStmt / emitMap*         │
│   — AST → builder calls. Knows VL types, scope, narrowing.   │
│   — Knows NO opcode bytes, NO LEB, NO heap-index arithmetic. │
├─────────────────────────────────────────────────────────────┤
│ WASM BUILDER  (WasmModule + FuncBuilder)                     │
│   internStruct/internArray/internRefList → heap index        │
│   addLocal(valtype) → local index ;  scratch frames          │
│   localGet/localSet/i32Const/structNew/arrayNewFixed/...      │
│   writeValtype(kind, heapIdx)  ← absorbs pushVT               │
│   — Knows wasm (opcodes, type section, rec group). Not VL.   │
├─────────────────────────────────────────────────────────────┤
│ BINARY WRITER  (the W buffer, promoted to an API)            │
│   u8 / bytes / uleb / sleb / name / beginSection/endSection  │
│   — Knows ONLY the binary format. No compiler knowledge.     │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Layer 1 — `BinaryWriter` (already 80% present)

This is `emitByte`/`emitBytes`/`emitULEB`/`ulebToArr`/`slebToArr`/`emitSection`
promoted to *the only* place bytes are appended. Surface:

```vl
// Pure binary writer — no wasm, no VL knowledge.
function wU8(b: i32): i32              // append one byte (masked)
function wBytes(bs: i32[]): i32        // append a byte array
function wULEB(v: i32): i32            // streaming unsigned LEB
function wSLEB(v: i32): i32            // streaming signed LEB
function wName(s: string): i32         // uleb(len) + utf8 bytes  (dedupes the
                                       //   hand-rolled name loops in emitModule)
// Section framing: today payloads are built into a temp i32[] then framed.
// Keep that (no backpatching needed) — it already matches wasm-encoder's
// section-then-finish model and sidesteps length back-patch entirely.
function wSection(id: i32, payload: i32[]): i32
```

**Key call-out:** VL's emitter builds each section payload **eagerly into a
temporary `i32[]`** and length-prefixes it (`emitSection`). This is *better* for
self-hosting than LLVM/Cranelift-style backpatching (which needs label/fixup
machinery): there are **no forward byte offsets to patch**, so the writer never
needs a "patch region." Keep this. The only addition is making `wU8`/`wULEB`
target *the current payload buffer* rather than always `W.bytes` — i.e. the writer
holds a *current buffer* so lowering never names `body`/`payload` directly.

### 3.2 Layer 2 — `WasmModule` / `FuncBuilder` (the new, load-bearing layer)

This absorbs three things currently smeared across the file: **type interning +
heap-index assignment**, **local/scratch allocation**, and **typed instruction
emission**.

**Type interning** (replaces the §1.4 offset arithmetic and the parallel tables'
*index* role): a single `internType` that returns a stable heap index and records
emission order, so lowering never computes `refPairBase + rs*2` by hand.

```vl
// Returns the heap-type index, interning on first sight. The module records
// declaration order; emitTypeSection walks that order inside the one rec group.
function mInternStruct(name: string): i32
function mInternRefList(elemName: string, elemKind: i32): i32   // → wrapper index
function mInternArrayI32(): i32
// One switch, owned here, replacing pushVT's 16 arms AND its dozens of callers:
function fbValtype(kind: i32, heapIdx: i32): i32    // writes 0x64 <uleb> or 0x7f
```

**Local/scratch allocation** (replaces §1.5's running offsets *and* the manual
locals-vector count): the builder hands out indices and remembers the valtype, so
the locals vector is *derived*, never hand-counted.

```vl
function fbAddLocal(valtypeKind: i32, heapIdx: i32): i32   // → wasm local index
function fbScratch(kind: i32): i32     // reserve+return a scratch slot of a kind
// emitFuncCode no longer hand-writes the nRuns count or the valtype runs:
function fbEmitLocalsVec(): i32        // derives the vector from fbAddLocal calls
```

**Typed instruction emission** (replaces the 657 `body.push(opcode)` sites): one
method per opcode VL emits, each delegating to the writer.

```vl
function fbLocalGet(i: i32): i32       // wU8(0x20); wULEB(i)
function fbLocalSet(i: i32): i32       // wU8(0x21); wULEB(i)
function fbI32Const(v: i32): i32       // wU8(0x41); wSLEB(v)
function fbStructNew(heapIdx: i32): i32 // wU8(0xfb); wU8(0x00); wULEB(heapIdx)
function fbArrayNewFixed(heapIdx: i32, n: i32): i32
function fbStructGet(heapIdx: i32, field: i32): i32
function fbArraySet(heapIdx: i32): i32
function fbIf(blockType: i32): i32 ; function fbElse(): i32 ; function fbEnd(): i32
// ...one per opcode in the emitted set (~40 opcodes total — a small, closed set)
```

The opcode set VL emits is **small and closed** (~40 opcodes: i32 arithmetic/
compare, local/global get/set, the GC struct/array ops, if/else/end/block/loop/br).
A method per opcode is a few hundred lines *once*, deleting 657 magic-number sites.

### 3.3 Layer 3 — lowering (slimmed `emit*`)

The `emit*` functions keep all the *decisions* (which struct, narrowed or not,
ref vs i32 list, scratch slot choice) and lose all the *bytes*.

### 3.4 BEFORE / AFTER — `struct.new` for an object literal

**BEFORE** (`emitObj`, 1564–1567 — bytes inline at the lowering site):

```vl
// ...after pushing each field value in declared order...
body.push(251)           // 0xfb GC prefix
body.push(0)             // struct.new
appendAll(body, ulebToArr(sHeapIdx[si]))   // this struct's heap-type index
return 0
```

**AFTER** (lowering names the operation; the builder owns the bytes):

```vl
// ...after pushing each field value in declared order...
fbStructNew(sHeapIdx[si])    // builder: wU8(0xfb); wU8(0x00); wULEB(heapIdx)
return 0
```

### 3.5 BEFORE / AFTER — the grow-and-append in `.push`

**BEFORE** (`emitPush`, 3854–3861 — the "grow backing" step, 8 lines of bytes):

```vl
// NB = array.new_default $aTy NC
body.push(32)                  // local.get NC
appendAll(body, ulebToArr(capIdx))
body.push(251)                 // 0xfb
body.push(7)                   // array.new_default
appendAll(body, ulebToArr(aTy))
body.push(33)                  // local.set NB
appendAll(body, ulebToArr(backIdx))
```

**AFTER** (intent-named, byte-free):

```vl
// NB = array.new_default $aTy NC
fbLocalGet(capIdx)
fbArrayNewDefault(aTy)
fbLocalSet(backIdx)
```

The ~150-line `emitPush` becomes a readable sequence of builder calls; the
*logic* (cap-doubling, copy, write-back, len bump) stays, the *encoding* leaves.

---

## 4. The self-hosting constraint (critical)

The builder **must itself be compilable by `emitProgram`.** A builder that needs a
VL feature `emitProgram` can't yet self-compile is useless here — it would block
the very bootstrap it serves. Concretely, the builder may use **only** the
features the current emitter already self-compiles:

- ✅ **Top-level functions** (recursion fine) — every `fb*`/`m*` method is one.
- ✅ **Module-level mutable `let` globals** (lower to wasm globals) — the builder's
  state (current buffer, intern tables, next-local counter) lives here, exactly as
  `W`, `sNames`, `pushScratchBase` do today.
- ✅ **Structural types** + `i32[]`/`string[]` buffers and parallel-array tables.
- ✅ The closed opcode/type-kind set already handled.
- ❌ **No closures / callbacks / first-class functions in hot paths.** The current
  file uses *none* (verified); the builder must keep it that way. This rules out a
  fluent `InstructionSink`-returns-self chain *if* method chaining needed closures
  — but it does **not**: VL methods return `i32` and mutate the module-global
  buffer, so `fbLocalGet(i); fbI32Const(v); fbI32Add()` is plain statement
  sequencing, no closures required. (This is why the streaming, side-effecting
  builder fits VL where a functional node-tree builder would not.)
- ❌ **No generics/variadics** — so no `dst.push(...src)` (H4.6); keep `wBytes`/
  `appendAll`. The builder *centralises* this single wart instead of spreading it.

**The payoff for self-hosting is direct and large.** Today, `emitProgram` must be
able to self-compile **657 distinct `body.push(<n>)` sites + 271 `appendAll(...,
ulebToArr(...))` sites** — i.e. the bootstrap has to handle every one of those
byte-op shapes scattered across 6,848 lines. After the refactor, the byte-ops are
**centralised into ~40 tiny builder methods**; the bootstrap surface for "raw
byte emission" collapses from *hundreds of scattered sites* to *one small,
auditable module*. Fewer/centralised byte-ops → **fewer emitProgram gaps to
chase**, and any byte-encoding bug is fixed in one place rather than 657. The
builder is not just cleaner — it **shrinks the self-compile frontier.**

---

## 5. Efficiency vs. maintainability — where VL sits on the spectrum

Two ends:

- **Full intermediate IR (binaryen-style).** A mutable node tree you build, then
  traverse to optimise and encode. *Cost:* the IR is data the compiler allocates
  and walks; in a wasm-hosted self-compiler that is **heap + code bloat in the
  emitted compiler itself**, for an optimiser VL has explicitly decided to keep
  **external** (`wasm-opt`/libbinaryen, `docs/binaryen-transition.md` options A/B).
  Building a node IR just to immediately encode it — with no in-VL optimiser to
  justify it — is pure overhead. The perf doc already concluded *"don't step on
  binaryen's feet"* and that a leaner-IR pre-pass isn't worth it.

- **Thin streaming builder (wasm-encoder-style).** Methods append bytes
  immediately behind a typed API. *Cost:* a function call per opcode and the
  intern-table lookups — both negligible, and **no extra heap-resident IR.** The
  emitted compiler stays lean; the byte buffer is still the only large allocation,
  exactly as today.

**Recommendation: the thin end, unambiguously.** VL targets lean wasm *and* the
self-hosted compiler runs in wasm, so the builder's own runtime cost is in the hot
path of every future `vl build`. A streaming builder adds **near-zero** runtime
cost over today's inline `body.push` (it's the same byte appends behind a function
call — and VL/binaryen can inline trivial wrappers in the *host* build; in the
self-hosted build they're cheap calls) while removing all the maintainability
cost. A node IR would add cost *and* complexity for a benefit (optimisation) VL
gets elsewhere. The one nuance: keep the builder methods **flat and allocation-free
on the hot path** — `fbLocalGet` should `wU8`+`wULEB` into the current buffer, not
build and return a fresh `i32[]` (avoid the `ulebToArr`-allocates pattern *inside*
the writer where a streaming `wULEB` suffices; reserve the `*ToArr` forms for the
few constexpr-payload cases that genuinely compose).

**Net:** VL should sit where wasm-encoder and Zig's self-hosted backend sit — a
typed, streaming, zero-IR emitter — *not* where binaryen/AssemblyScript sit.

---

## 6. Migration path (incremental, tests green at every step)

`wasmEmit.vl` is the **live bootstrap emitter**; it cannot be rewritten big-bang.
Strangler-fig it from the bottom up. The selfhost tests
(`tests/selfhost_*_test.ts`) and the byte-exact pins are the safety net — they
must pass at **every** checkpoint. Because the refactor is a *pure
factoring* (same bytes out), the strongest possible check is available: **the
emitted module bytes should be identical before and after each step** (diff the
`bytesToStr()` output / the byte-exact pin).

**Checkpoint 0 — pin the bytes.** Ensure a byte-exact golden test covers a module
exercising every section + every type kind (struct, union, ref-list, string-list,
map, array). This golden is the invariant for every step below.

**Step 1 — promote the `BinaryWriter` (low risk, mechanical).** Wrap the existing
`emitByte`/`emitULEB`/`ulebToArr`/`emitSection` as the `BinaryWriter` API
(§3.1); give the writer a *current buffer* so callers stop naming `body`
directly. The existing helpers already *are* this layer — this is renaming +
threading, not new logic. Add `wName` and replace the hand-rolled export/name
loops. **Bytes unchanged → golden stays green.**

**Step 2 — introduce `fb*` opcode methods, migrate one operation family at a
time.** Add `fbStructNew`, `fbLocalGet`, … and convert call sites *family by
family*: structs first (`emitObj`/`emitVariantStruct`/`emitUnionBox`), then
arrays/`.push`, then maps, then string ops. Each family is an independent PR;
after each, run selfhost + golden. This is the strangler fig — old `body.push`
sites coexist with new `fb*` calls until the last family is converted. **Each
family's bytes are unchanged → green throughout.**

**Step 3 — lift type interning into `WasmModule`.** Replace the §1.4 offset
arithmetic with `mInternStruct`/`mInternRefList`/… that *assign* the same indices
the arithmetic computes today (verify by asserting the new indices equal the old
formula for the golden module). Fold `pushVT`'s 16-arm switch into `fbValtype`.
This is the highest-value, highest-care step — do it *after* the opcode methods so
the type section is the only moving part.

**Step 4 — lift local/scratch allocation into `FuncBuilder`.** Replace the running
`*ScratchBase` offsets and the hand-counted `nRuns` locals vector with
`fbAddLocal`/`fbScratch`/`fbEmitLocalsVec`. The frame layout becomes *derived*
from allocations. Verify byte-identical locals vectors against the golden.

**Step 5 — slim the `emit*` lowering.** With all bytes behind the builder, the
`emit*` functions are now pure lowering; tidy/rename, delete dead `*ToArr` helpers
that the streaming writer made redundant.

### Risks and mitigations

| risk | mitigation |
|------|------------|
| A factoring step silently changes a byte (wrong opcode/operand order) | the **byte-exact golden** (Checkpoint 0) catches any divergence immediately; never merge a step that perturbs it |
| The builder accidentally uses a non-self-compilable feature (closure, generic) | enforce the §4 feature whitelist; the builder must compile under `emitProgram` itself — add a CI step that runs `emitProgram` over the builder module |
| Type-index migration (Step 3) is the one place indices could drift | assert new `mIntern*` indices equal the old offset arithmetic for the golden module *before* deleting the arithmetic; keep the formulas as a debug assert for one release |
| In-flight feature work (`.push` G7, maps G8) collides with the family-by-family migration | sequence: migrate a family **only after** its feature has landed; don't refactor and feature-add the same family in one PR |
| Builder call overhead regresses self-hosted runtime | keep `fb*` methods flat/allocation-free (§5); the host build inlines them, the self-host build pays one cheap call — measure against the native build (the `ci-native` fixpoint timing / `vl build`) if in doubt |

---

## 7. Recommendation summary

1. **Adopt the three-layer thin builder**: `BinaryWriter` (bytes) → `WasmModule`/
   `FuncBuilder` (typed wasm: interning, locals/scratch, one method per opcode) →
   slimmed `emit*` lowering. This is the **wasm-encoder / Zig-self-hosted** shape,
   not the **binaryen** shape.
2. **Stay at the thin (streaming, zero-IR) end of the spectrum.** VL targets lean
   wasm and the compiler runs in wasm; a node IR bloats the emitted compiler for an
   optimiser VL keeps external. The builder's own cost must stay negligible.
3. **Honour the self-host whitelist** (top-level functions, module-global state,
   structural types, closed opcode set; *no* closures/generics/variadics). The
   refactor *shrinks* the self-compile frontier — 657 scattered byte-ops collapse
   into ~40 centralised builder methods.
4. **Migrate bottom-up, strangler-fig, byte-exact-pinned**: promote the writer,
   then convert opcode families one at a time, then lift type interning, then lift
   local allocation — keeping the emitted bytes (and all selfhost tests) identical
   at every checkpoint.

---

### Sources

- [wasm-encoder docs (docs.rs)](https://docs.rs/wasm-encoder) ·
  [wasm-tools wasm-encoder README](https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wasm-encoder/README.md)
- [Intro to the LLVM MC Project](https://blog.llvm.org/2010/04/intro-to-llvm-mc-project.html) ·
  [LLVM Target-Independent Code Generator](https://llvm.org/docs/CodeGenerator.html)
- [Cranelift `InstBuilder`](https://docs.rs/cranelift-codegen/latest/cranelift_codegen/ir/trait.InstBuilder.html) ·
  [Cranelift `binemit`/codegen](https://docs.rs/cranelift-codegen/latest/cranelift_codegen/) ·
  [Cranelift instruction-selection blog](https://cfallin.org/blog/2021/01/22/cranelift-isel-2/)
- [AssemblyScript Architecture](https://github.com/AssemblyScript/assemblyscript/wiki/Architecture) ·
  [Compiling/optimizing Wasm with Binaryen (web.dev)](https://web.dev/articles/binaryen)
- [Goodbye to the C++ Implementation of Zig](https://ziglang.org/news/goodbye-cpp/) ·
  [Zig self-hosted x86 backend default in Debug (Lobsters)](https://lobste.rs/s/fmof95/zig_s_self_hosted_x86_backend_is_now)
- VL internal: `compiler/wasmEmit.vl`, `compiler/toWasm.ts`,
  `docs/binaryen-transition.md`, `docs/perf-findings.md`, `docs/selfhost-gaps.md`
