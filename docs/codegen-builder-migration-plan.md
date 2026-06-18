# Codegen builder migration plan: refactoring `wasmEmit.vl` onto a thin builder

> Status: **executable migration plan, not landed.** This operationalizes the
> recommendation in [`docs/codegen-architecture.md`](codegen-architecture.md)
> (branch `claude/codegen-architecture-analysis`): refactor the self-hosted WasmGC
> emitter (`compiler/wasmEmit.vl`, `emitProgram`) onto a **thin 3-layer streaming
> builder** — `BinaryWriter` → typed `WasmModule`/`FuncBuilder` → slim `emit*`
> lowering — in the **wasm-encoder / Zig-self-hosted shape, NOT a binaryen node IR**.
> The analysis settled *what* and *why*; this doc is *how*, step by step, byte-exact.
>
> It changes no code. It is the work order an implementer (or a sequence of agents)
> executes phase by phase. Read the analysis first; this doc does not re-litigate
> the architecture choice.

---

## 0. Ground truth (the real call sites this plan must preserve)

Numbers and line ranges below are from the live `compiler/wasmEmit.vl` (6,848 lines).
The plan is pinned to these concrete shapes, not to the analysis's abstractions.

- **The proto-writer already exists** (lines 17–132): `W: Emitter = { bytes: [] }`,
  `emitByte` (29), `emitBytes` (35), `ulebToArr` (54), `slebToArr` (72),
  `appendAll` (105), `emitULEB` (118), `emitSection` (127). This is Layer 1 minus
  the API boundary — section payloads are built **eagerly into a temp `i32[]`** and
  length-prefixed by `emitSection`, so there is **no backpatching** and we keep it.
- **657 bare `body.push(<opcode>)` sites** + **271 `appendAll(body, ulebToArr/
  slebToArr(...))` LEB-operand pairs** + **108 `push(251)` (`0xfb` GC prefix)**
  scattered through the `emit*` lowerers (`emitObj` 1334, `emitVariantStruct` 1390,
  `emitUnionBox` 1424, `emitArr` 1723, the whole `emitMap*` family 1872–2700,
  `emitStrConcat` 2860 / `emitStrEq` 2942 / `emitStrSlice` 3073, `emitExpr` 3142,
  `emitCall` 3354, `emitAssign` 3414, `emitPush` 3543, `emitStmt` 3763).
- **`pushVT(payload, kind, structIdx)`** (4412–4438): the single 7-arm (kinds 1–7
  plus i32 default) valtype switch that maps a kind tag → `0x64 <heapIdx-uleb>` or
  `0x7f`. Reached from `emitModule` (functypes, globals), `emitFuncCode` (locals
  vector), and indirectly the whole type-section block. Adding a kind touches
  `pushVT` **and** the parallel intern tables **and** each `*Used` flag **and** the
  type-section emission **and** the scratch-frame reservation — the ~50-site
  migration the owner feels.
- **The intern tables** (module-level parallel `let` arrays): structs `sNames`/
  `sFieldNames`/`sFieldStart`/`sFieldCount`/`sFieldTypes`/`sHeapIdx` (580–585);
  arrays/lists `aUsed`/`aTypeIdx` (596–597), `lUsed`/`lTypeIdx` (612–613); ref-lists
  `raUsed`/`rlUsed`/`raTypeIdx`/`rlTypeIdx`/`rElemKind` (642–646); string-lists
  `slUsed` (682); maps `mUsed`/`mkArrIdx`/`mkListIdx`/`mStructIdx` (672–675);
  unions `uDeclared`/`uVariants`/`uTags`/`uBoxIdx`/`uVarIdx`/`uFieldNames`/… (732+).
- **`emitModule`'s heap-index arithmetic** (4447–4753): one long running-sum block
  computing `structOffset`, `unionOffset`, `preTypes`, `arrayOffset`, `listOffset`,
  `aTypeIdx`, `lTypeIdx`, `refArrOffset`, `refListOffset`, `raTypeIdx`, `rlTypeIdx`,
  `strListOffset`, `mapStructOffset`, `preMap`, `mkArrIdx`, `mkListIdx`,
  `mStructIdx`, `typeOffset` — then the **single rec group** (`0x4e <n+typeOffset>`,
  line 4534) so a struct field can forward-reference the raw-array type. A miscount
  is a **silent mis-encode**; this is the highest-risk surface.
- **`emitFuncCode`'s scratch frames + locals vector** (4044–4236): running offsets
  `pushScratchBase`/`refPushScratchBase`/`strPushScratchBase`/`strScratchBase`/
  `mapScratchBase` (4061–4083), then a hand-counted `nRuns` (4096–4104) and a
  hand-written valtype-run block (4106–4219) that is a **second, manually-synced
  view of the same frame layout**.
- **The wire format for verification already exists**: `bytesToStr()` (6108) renders
  `W.bytes` as a comma-joined decimal string — the exact format the TS test runner
  parses back (`bytesFromLog`, `tests/selfhost_emit_program_test.ts:48`). The golden
  pin (§3) is built directly on this.

The current selfhost tests (`tests/selfhost_emit_program_test.ts`, ~90 cases) are
**behavioral**: source → arena → bytes → `WebAssembly.instantiate` → assert the
export's return value. They do **not** assert byte-exactness. Adding a byte-exact
golden (Checkpoint 0) is therefore the *first* and load-bearing step.

---

## 1. Target architecture, concretely

Three thin layers, **streaming bytes behind a typed API, zero node IR** (the
wasm-encoder shape). All state lives in **module-global `let`s** exactly as `W`,
`sNames`, `pushScratchBase` do today — **no closures, no first-class functions, no
generics/variadics** (§4 whitelist). Every method is a top-level function returning
`i32` (a dummy `0`, or an allocated index where noted) that **mutates the
module-global current buffer**; statement sequencing replaces method chaining.

### 1.1 Layer 1 — `BinaryWriter` (promote the existing proto-writer)

The one place bytes are appended. The key addition over today is a **current
buffer**: a module-global handle so lowering never names `body`/`payload` directly.
Because section payloads are built eagerly (no backpatch), the "current buffer" is
just a pointer to whichever `i32[]` we are filling.

```vl
// Module-global writer state (replaces the bare `W` + ad-hoc `body`/`payload` locals)
let curBuf: i32[] = []            // the buffer wU8/wULEB/... currently append to

function wTarget(buf: i32[]): i32[]    // set curBuf = buf; return the PREVIOUS buf (so
                                       // callers can save/restore — replaces threading `body`)
function wU8(b: i32): i32               // curBuf.push(b & 0xff)              [was emitByte]
function wBytes(bs: i32[]): i32         // append a byte array                [was emitBytes]
function wULEB(v: i32): i32             // streaming unsigned LEB             [was emitULEB]
function wSLEB(v: i32): i32             // streaming signed LEB (NEW streaming form; today
                                        //   only slebToArr exists, used for i32.const operands)
function wName(s: string): i32          // wULEB(len) + utf8 bytes — dedupes the hand-rolled
                                        //   export-name + field-name loops in emitModule
// Section framing — unchanged model (eager payload, length-prefix, no patch region):
function wSection(id: i32, payload: i32[]): i32     // [was emitSection]
// Retained for the few constexpr-payload compositions that genuinely build a fresh array:
function ulebToArr(v: i32): i32[]       // kept; reserved for composed payloads
function slebToArr(v: i32): i32[]       // kept; i32.const operand path until Phase I
```

`wTarget` is how a side-effecting, closure-free builder threads "which buffer".
`emitFuncCode` does `let prev = wTarget(body); …; wTarget(prev)` instead of passing
`body` to 40 helpers. **Hot-path rule:** `wU8`/`wULEB`/`wSLEB` append straight to
`curBuf`; they must **not** allocate a fresh `i32[]` (the `*ToArr`-allocates pattern
stays only where a payload is genuinely composed, e.g. constexpr global inits).

### 1.2 Layer 2 — `WasmModule` + `FuncBuilder` (the new, load-bearing layer)

Absorbs three things smeared across the file today: **type interning + heap-index
assignment**, **local/scratch allocation**, and **typed instruction emission**.

**(a) Type interning** — replaces `emitModule`'s offset arithmetic and the parallel
tables' *index* role. A handful of `mIntern*` functions that return a **stable heap
index**, interning on first sight and recording declaration order; the type section
is then emitted by walking that recorded order inside the one rec group. The intern
functions *encapsulate* the running-sum invariant ("a type that references a
later-emitted type goes in the single rec group") instead of open-coding it.

```vl
// All return the heap-type index (interning on first sight), recording emit order.
function mInternStruct(declOrderSi: i32): i32        // standalone struct si → heap idx
function mInternUnionVariant(vi: i32): i32           // union variant struct → heap idx
function mInternUnionBox(): i32                      // the {tag,value} box → heap idx
function mInternArrayI32(): i32                      // raw (array (mut i32))  [was aTypeIdx]
function mInternListI32(): i32                       // i32-list wrapper        [was lTypeIdx]
function mInternRefArray(elemKind: i32): i32         // ref backing             [was raTypeIdx]
function mInternRefList(elemKind: i32): i32          // ref-list wrapper        [was rlTypeIdx]
function mInternStrArray(): i32                       // string/keys backing    [was mkArrIdx]
function mInternStrList(): i32                        // string-list wrapper    [was mkListIdx]
function mInternMapStruct(): i32                      // map struct             [was mStructIdx]
function mFuncTypeBase(): i32                         // first functype index   [was typeOffset]
function mEmitTypeSection(): i32                      // walk recorded order, one rec group
```

**Invariant the migration asserts (Phase G):** for the golden modules, every
`mIntern*` result **equals the value the old arithmetic computes** (e.g.
`mInternListI32() == preTypes + arrayOffset`). The old formulas are kept as a debug
assert for one release before deletion.

**(b) The valtype switch** — `pushVT`'s 7-arm ladder, owned here, one caller-facing
method:

```vl
function fbValtype(kind: i32, heapIdx: i32): i32   // writes 0x64 <uleb heapIdx>, or 0x7f for i32
                                                   // (absorbs pushVT 4412–4438; kind→heapIdx
                                                   //  resolution moves into mIntern* lookups)
```

**(c) Local/scratch allocation** — replaces the running `*ScratchBase` offsets AND
the hand-counted `nRuns` + valtype-run block. The builder hands out indices and
remembers each slot's valtype, so the locals vector is **derived, never counted**:

```vl
function fbBeginFunc(nParams: i32): i32             // reset per-function local state
function fbAddLocal(kind: i32, heapIdx: i32): i32   // declared local → wasm local index
function fbScratchFrame(frameKind: i32): i32        // reserve a named scratch frame
                                                    //   (PUSH=4, REFPUSH=4, STRPUSH=4,
                                                    //    STROP=7, MAP=12 slots), return base
function fbScratchSlot(frameKind: i32, n: i32): i32 // resolve frame base + n → local index
                                                    //   (replaces pushScratchBase+0/+1/+2 etc.)
function fbEmitLocalsVec(): i32                      // DERIVE the (count,valtype) runs from the
                                                    //   recorded fbAddLocal/fbScratchFrame calls
```

**(d) Typed instruction emission** — one method per opcode VL emits, each delegating
to Layer 1. The opcode set is **small and closed (~40)**. This deletes the 657
magic-number sites. Grouped by family (the migration order in §2):

```vl
// control flow / locals / consts (the universal base — Phase B)
function fbLocalGet(i: i32): i32        // wU8(0x20); wULEB(i)
function fbLocalSet(i: i32): i32        // wU8(0x21); wULEB(i)
function fbLocalTee(i: i32): i32        // wU8(0x22); wULEB(i)
function fbGlobalGet(i: i32): i32       // wU8(0x23); wULEB(i)
function fbGlobalSet(i: i32): i32       // wU8(0x24); wULEB(i)
function fbI32Const(v: i32): i32        // wU8(0x41); wSLEB(v)
function fbIf(blockType: i32): i32      // wU8(0x04); wU8(blockType)   (0x40 void, or a valtype)
function fbElse(): i32                  // wU8(0x05)
function fbBlock(blockType: i32): i32   // wU8(0x02); ...
function fbLoop(blockType: i32): i32    // wU8(0x03); ...
function fbBr(depth: i32): i32          // wU8(0x0c); wULEB(depth)
function fbBrIf(depth: i32): i32        // wU8(0x0d); wULEB(depth)
function fbEnd(): i32                   // wU8(0x0b)
function fbDrop(): i32                  // wU8(0x1a)
function fbUnreachable(): i32           // wU8(0x00)
function fbReturn(): i32                // wU8(0x0f)
function fbCall(fnIdx: i32): i32        // wU8(0x10); wULEB(fnIdx)
function fbI32Bin(op: i32): i32         // wU8(op)  — one arith/compare opcode (0x6a add, 0x46 eq, …)
// GC struct ops (Phase C — structs first)
function fbStructNew(heapIdx: i32): i32         // wU8(0xfb); wU8(0x00); wULEB(heapIdx)
function fbStructNewDefault(heapIdx: i32): i32  // wU8(0xfb); wU8(0x01); wULEB(heapIdx)
function fbStructGet(heapIdx: i32, field: i32): i32   // 0xfb 0x02 <ht> <field>
function fbStructSet(heapIdx: i32, field: i32): i32   // 0xfb 0x05 <ht> <field>
// GC array ops (Phase D — arrays/.push)
function fbArrayNew(heapIdx: i32): i32          // 0xfb 0x06 <ht>
function fbArrayNewDefault(heapIdx: i32): i32   // 0xfb 0x07 <ht>
function fbArrayNewFixed(heapIdx: i32, n: i32): i32   // 0xfb 0x08 <ht> <n>
function fbArrayGet(heapIdx: i32): i32          // 0xfb 0x0b <ht>
function fbArraySet(heapIdx: i32): i32          // 0xfb 0x0e <ht>
function fbArrayLen(): i32                       // 0xfb 0x0f
// GC ref ops (Phases C/D/F as needed)
function fbRefAsNonNull(): i32                   // ref.as_non_null
function fbRefCast(heapIdx: i32): i32            // ref.cast — union/ref-list reads
function fbRefNull(heapIdx: i32): i32            // ref.null <ht>
```

Exact opcode bytes are transcribed from the current call sites during Phase B (the
golden pin guarantees fidelity). The list above is the **closed set of ~40
methods** that replace the 657 scattered byte-ops.

### 1.3 Layer 3 — lowering (slimmed `emit*`)

The existing `emit*` functions keep **all the decisions** (which struct, narrowed or
not, ref vs i32 list, which scratch slot) and lose **all the bytes**. Example from
the analysis, grounded in the real lines:

`emitObj` (1377–1379) today:
```vl
body.push(251); body.push(0); appendAll(body, ulebToArr(sHeapIdx[si]))
```
after Phase C:
```vl
fbStructNew(sHeapIdx[si])      // builder owns 0xfb 0x00 <ht>
```

`emitPush` (3543) "grow backing" today (`local.get NC; 0xfb array.new_default $aTy;
local.set NB`) becomes `fbLocalGet(capSlot); fbArrayNewDefault(aTy);
fbLocalSet(backSlot)`. The ~150-line lowering becomes a readable call sequence; the
logic (cap-doubling, copy, write-back, len bump) stays.

---

## 2. Phased migration (each phase = one shippable PR, tests green throughout)

Strangler-fig, **bottom-up**. Old `body.push` sites and new `fb*` calls coexist
until the last family is converted. After **every** phase: `deno task test` (all
selfhost suites green) **AND** the byte-exact golden (§3) **byte-identical**. Because
the refactor is a *pure factoring*, byte-identity is the strongest possible check and
is available at every step.

| # | Phase | Goal | Files / functions touched | Verification | Effort |
|---|-------|------|---------------------------|--------------|--------|
| **0** | **Pin golden** | Capture byte-exact goldens for a representative module set; add the failing-loud assert | `tests/selfhost_emit_golden_test.ts` (new), `tests/golden/*.bytes` (new fixtures) | new test green on unchanged emitter; deliberately mutate one opcode locally → golden FAILS (proves it bites) | **S** |
| **A** | **Promote `BinaryWriter`** | Wrap `emitByte/emitBytes/emitULEB/ulebToArr/slebToArr/emitSection` as `wU8/wBytes/wULEB/wSLEB/wName/wSection`; add `curBuf`+`wTarget`; replace hand-rolled name loops with `wName` | top of `wasmEmit.vl` (17–132); export/field-name loops in `emitModule` (4723–4740) | golden identical (pure rename+threading); selfhost green | **S–M** |
| **B** | **Opcode methods + control/locals family** | Add all ~40 `fb*` methods; convert the *universal* base ops (local.get/set, i32.const, if/else/end/block/loop/br, call, i32 arith/compare) in `emitExpr`/`emitStmt`/`emitCall`/`emitAssign` | `emitExpr` 3142, `emitStmt` 3763, `emitCall` 3354, `emitAssign` 3414, `binOpcode` 1187 | golden identical; selfhost green | **M–L** |
| **C** | **Struct family** | Convert `struct.new`/`struct.get`/`struct.set` + union boxing sites to `fbStruct*`/`fbValtype` | `emitObj` 1334, `emitVariantStruct` 1390, `emitUnionBox` 1424, `emitMem` 1518, `emitNarrowedMem` 1474, `emitIs` 1443 | golden identical; selfhost green | **M** |
| **D** | **Array / `.push` family** | Convert `array.*` + the inline grow/append in `.push` (i32, ref, string lists) | `emitArr` 1723, `emitIndex` 2714, `emitArrLen` 2786, `emitPush` 3543, `pushList*` 3701–3738 | golden identical; selfhost green | **L** |
| **E** | **Map family** | Convert the open-addressing map probe/rehash/resize byte sequences | `emitMap*` 1872–2700 (hash/probe/resize/set/get/has/pushKey/pushVal) | golden identical (map golden is the stressor); selfhost green | **L** |
| **F** | **String family** | Convert string concat/eq/slice + the clamp/index helpers | `emitStrConcat` 2860, `emitStrEq` 2942, `emitStrSlice` 3073, `emitClampIdx` 3037, `decodeStr`/`emitStr` 1570/1694 | golden identical; selfhost green | **M** |
| **G** | **Lift type interning** | Replace `emitModule`'s offset arithmetic with `mIntern*`; fold `pushVT` into `fbValtype`; assert new indices == old formulas before deleting | `emitModule` 4447–4680, `pushVT` 4412, `refElemHeapType` 4396, the `*TypeIdx`/`*Idx` globals | **assert new==old for every golden** (debug assert kept 1 release); golden identical; selfhost green | **L (highest risk)** |
| **H** | **Lift local/scratch allocation** | Replace `*ScratchBase` running offsets + hand-counted `nRuns` + valtype-run block with `fbBeginFunc/fbAddLocal/fbScratchFrame/fbScratchSlot/fbEmitLocalsVec` | `emitFuncCode` 4044–4236; scratch globals 532–566, 1839; `buildLocals` 900 | golden identical (locals vectors byte-for-byte); selfhost green | **M–L** |
| **I** | **Slim lowering + sweep** | Delete now-dead `*ToArr` paths the streaming writer made redundant; rename/tidy `emit*` to pure lowering; confirm zero residual `body.push(<opcode>)` outside Layer 1/2 | whole file sweep | golden identical; selfhost green; grep finds 0 stray opcode pushes | **S–M** |

Ordering rationale (matches the analysis §6): **pin → writer → opcode families one
at a time (structs → arrays/`.push` → maps → strings) → type interning → local
allocation → slim**. Opcode methods land **before** type interning so that when the
type section moves (Phase G) it is the *only* moving part. Each family (C–F) is
independent — convert one, ship, repeat.

**PR shippability:** each row is a standalone PR. A phase that touches a family with
in-flight feature work waits until that feature lands (§4 R6) — never refactor and
feature-add the same family in one PR.

---

## 3. The golden-pinning mechanism (the linchpin)

**Idea:** for a fixed set of source modules, record the emitter's exact output bytes
once (the "golden"), then assert on every CI run that the current emitter reproduces
those bytes **byte-for-byte**. Any factoring step that perturbs a byte fails loudly.

### 3.1 Which modules to pin (coverage matrix)

Pin one small module per axis so the union covers **every section + every type kind
+ representative functions**. Each is a `.vl` source string driven through the real
lexer → parser → `emitProgram` (same harness as `selfhost_emit_program_test.ts`):

| golden | exercises | covers |
|--------|-----------|--------|
| `g_min` | `function main(): i32 { return 42 }` | header, type/func/export/code sections, i32.const, end |
| `g_arith` | params + `+ - *`, the 6 compares, `/` `%`, recursion (`fib`) | binOpcode set, call, local.get, if/else/br |
| `g_locals` | several `let` locals + reassignment + nested `if/else` | locals vector (i32 runs), block/loop, fallthrough unreachable |
| `g_struct` | `type S`/`type T` (ambiguous fields) + struct param + `.field` read | struct.new/get, `(ref $i)` valtype, rec group with 2 structs, callee-type hint |
| `g_union` | `type U = A \| B` + `is`-narrowing + variant box | union variant structs + box `{tag,value}`, ref.cast, anyref field |
| `g_i32list` | `i32[]` local + `.push` + index + `.length` | raw array, list wrapper, array.new_default, grow path, push scratch frame |
| `g_reflist` | `S[]`/`U[]` + `.push` | ref backing (nullable elem), ref-list wrapper, ref-push scratch frame |
| `g_string` | string literal + concat + eq + slice | string array rep, str-op scratch frame (7 slots), clamp/index |
| `g_strlist` | `string[]` field + `.push` | string backing/list wrapper, str-push scratch frame |
| `g_map` | `{[string]: i32}` + set/get/has | map struct (5 fields), hash/probe/rehash, map scratch frame (12 slots) |
| `g_globals` | module-level `let`/`const` initializers (i32 + struct) | global section, constexpr struct.new/array.new_fixed in init |
| `g_kitchen` | a module combining struct + i32-list + string in one program | cross-section interaction; the full type-section rec-group ordering |

`g_struct`/`g_union`/`g_map`/`g_kitchen` are the **type-index stressors** — they are
the ones that catch a Phase G miscount. `g_*list`/`g_string`/`g_map` are the
**scratch-frame stressors** for Phase H.

### 3.2 Where to store the goldens

A new fixture directory `tests/golden/` with one file per module, e.g.
`tests/golden/g_struct.bytes`, each holding the exact `bytesToStr()` output (the
comma-joined decimal byte string — the wire format the runner already parses via
`bytesFromLog`). Plain text so a byte diff is a readable line diff in code review,
and so a regenerate step is a trivial file write. (Alternative: inline `const`s in
the test file — rejected, because the byte strings are long and a fixture dir keeps
the diff legible and the regenerate command obvious.)

### 3.3 The assert that fails loudly

A new `tests/selfhost_emit_golden_test.ts`, reusing the existing compile-once harness
(`compileCached` + the single-driver-module pattern from
`selfhost_emit_program_test.ts`). For each golden module it:

1. drives the source through lexer → parser → `emitProgram`, reads the `main:` line
   via `bytesFromLog` → the actual byte string;
2. reads `tests/golden/<name>.bytes` → the expected byte string;
3. **`assertEquals(actual, expected)`** — on mismatch, prints the first differing
   byte index and a windowed context (`expected[i-4..i+4]` vs `actual[…]`) so the
   diff is diagnosable, e.g.:

   ```
   GOLDEN DRIFT in g_struct at byte 91:
     expected … 251, 0, 1,  91, 1 …   (struct.new $1)
     actual   … 251, 0, 0,  91, 1 …   (struct.new $0)  ← heap index regressed
   Re-run with UPDATE_GOLDEN=1 ONLY if this byte change is intended.
   ```

4. A guarded regenerate path: `UPDATE_GOLDEN=1 deno test …golden…` rewrites the
   fixtures. Regeneration is a **deliberate, reviewed** act — the PR diff shows every
   changed byte, so an unintended drift is impossible to merge silently. During this
   refactor (a pure factoring) the goldens should **never** change; a non-empty
   `tests/golden/*.bytes` diff in a refactor PR is a **red flag requiring
   justification** (it means the refactor was not byte-exact).

5. As belt-and-braces, each golden module is **also** `WebAssembly.compile`d in the
   same test (the bytes must still be a *valid* module, not just identical) — so a
   wrongly-regenerated golden can't lock in invalid bytes.

This makes the golden the invariant for Phases A–I: introduce it at Phase 0 on the
**unchanged** emitter (so the fixtures capture today's known-good bytes), then never
let it drift.

---

## 4. Risk register

| # | Risk | Phase(s) | Mitigation |
|---|------|----------|------------|
| R1 | A factoring step silently changes a byte (wrong opcode / operand order / LEB form) | A–I | The **byte-exact golden** (§3) catches any divergence immediately; never merge a phase that perturbs `tests/golden/*.bytes`. The per-byte diff message localizes it. |
| R2 | **Type-index migration drifts an index** (the analysis's flagged #1 risk) | **G** | Assert `mIntern*() == <old offset formula>` for *every* golden module *before* deleting the arithmetic; keep the formulas as a **debug assert for one release**. The 4 type-stressor goldens (`g_struct`/`g_union`/`g_map`/`g_kitchen`) exercise the rec-group ordering. Land Phase G *after* all opcode families (B–F) so the type section is the only moving part. |
| R3 | Scratch-frame layout drifts (locals vector no longer matches frame offsets) | **H** | The frame layout becomes *derived* from `fbAddLocal`/`fbScratchFrame` (one fact, not two). Verify byte-identical locals vectors against the scratch-stressor goldens (`g_i32list`/`g_reflist`/`g_string`/`g_strlist`/`g_map`). Convert allocation and locals-vector emission in the **same** PR so they can't desync mid-flight. |
| R4 | The builder accidentally uses a **non-self-compilable** feature (closure / generic / variadic / `dst.push(...src)`) — would block the very bootstrap it serves | all | Enforce the §1 whitelist: top-level functions, module-global `let` state, structural types, `i32[]`/`string[]`, closed opcode set; **no** closures/callbacks/first-class fns, **no** generics/variadics. Add a CI step that runs `emitProgram` over `wasmEmit.vl` itself (the self-compile smoke); a non-self-compilable feature fails it. `wTarget(prev)` save/restore + side-effecting `i32`-returning methods keep method *sequencing* closure-free. |
| R5 | Builder call overhead regresses self-hosted runtime | all | Keep `fb*` methods **flat and allocation-free** on the hot path — `fbLocalGet` does `wU8`+`wULEB` into `curBuf`, never builds a fresh `i32[]`. Host build inlines trivial wrappers; self-host build pays one cheap call. Measure against the native build (the `ci-native` fixpoint timing) if a phase looks hot (Phase E map family is the densest). |
| R6 | **In-flight bootstrap feature work collides** with a family migration (the emitter is being actively extended — e.g. new `.push`/map/typecheck-gap features land on `master` regularly) | C–H | **Sequence per family:** migrate a family **only after** its feature has landed and stabilized on `master`; never refactor + feature-add the same family in one PR. Keep each phase a small, rebase-friendly PR so it survives churn. Prefer to **interleave at the family granularity** (convert a stable family while another is still gaining features) rather than block the whole refactor on a global freeze. |
| R7 | Golden goes stale because a *legitimate* emitter improvement changes bytes during the refactor window | 0–I | The refactor PRs must be **pure factoring** (no byte change), so they never touch goldens. A *separate* feature PR that legitimately changes bytes regenerates goldens via `UPDATE_GOLDEN=1` with the byte diff visible in review. The two never mix in one PR (same discipline as R6). |
| R8 | A phase is too large to review / bisect | B, D, E | Split by sub-family if needed (e.g. Phase D as i32-list, then ref-list, then string-list sub-PRs). The golden stays the gate for each sub-PR. |

---

## 5. Sequencing vs. the bootstrap

Two milestones are in flight: (1) **`typecheck.vl` self-compiles** (in progress, per
`docs/selfhost-gaps.md`), and (2) the **`wasmEmit.vl`-self-compiles** step (the final
bootstrap milestone — the emitter emitting itself).

**Recommendation: do this refactor *before* `wasmEmit.vl` self-compiles, and it makes
that milestone *easier*, not harder.** Reasoning, straight from the analysis (§4):

- Today, for the emitter to self-compile, `emitProgram` must handle **657 distinct
  `body.push(<n>)` shapes + 271 `appendAll(…, ulebToArr(…))` shapes** scattered
  across 6,848 lines — every one of those is a byte-op shape the bootstrap has to
  compile. After the refactor, those collapse into **~40 tiny builder methods**: the
  "raw byte emission" surface the self-compile must handle shrinks from *hundreds of
  scattered sites* to *one small, auditable module*. Fewer/centralized byte-ops →
  **fewer `emitProgram` gaps to chase** → the refactor **shrinks the self-compile
  frontier** rather than growing it. (It also fixes any byte-encoding bug in one
  place instead of 657.)
- Concretely: **land Phases 0–I after `typecheck.vl` self-compiles and before the
  final `wasmEmit.vl`-self-compiles push.** Doing typecheck first means the front end
  is stable, so the emitter's *input* (the AST + types) isn't a moving target while we
  refactor its *output*. Doing the builder before the emitter-self-compile means the
  hardest milestone faces ~40 centralized methods, not 657 scattered ops.
- **Caveat / why not strictly "after all feature work":** the emitter is actively
  extended, so a global freeze is unrealistic. The plan is therefore **interleaved at
  family granularity** (§4 R6): refactor each opcode family once *its* feature work
  has stabilized, while other families keep gaining features. This lets the
  builder land incrementally alongside ongoing bootstrap work, never blocking it.

Net: **before emitter-self-compile, after front-end (typecheck) self-compile,
interleaved per-family with in-flight emitter features.**

---

## 6. Definition of done + rollback

### 6.1 Definition of done ("refactor complete")

1. A grep for `body.push(` / `payload.push(` / `appendAll(.*ulebToArr` / `push(251)`
   **outside Layer 1 (`BinaryWriter`) and Layer 2 (`WasmModule`/`FuncBuilder`)**
   returns **zero** matches in the `emit*` lowering. All bytes flow through `fb*`/`m*`.
2. `pushVT`'s switch and `emitModule`'s offset arithmetic are gone, replaced by
   `fbValtype` + `mIntern*`; the old offset formulas exist only as the
   (still-passing) debug assert, scheduled for deletion one release later.
3. `emitFuncCode` no longer hand-counts `nRuns` or hand-writes valtype runs; the
   locals vector is derived from `fbAddLocal`/`fbScratchFrame`.
4. **All `tests/golden/*.bytes` are byte-identical to their Phase-0 capture** — the
   entire refactor produced **zero** byte change (proof it was a pure factoring).
5. All selfhost suites green (`selfhost_emit_program_test.ts`,
   `selfhost_wasm_emit_test.ts`, `selfhost_pipeline_test.ts`, plus the new
   `selfhost_emit_golden_test.ts`).
6. The self-compile smoke (R4: `emitProgram` over `wasmEmit.vl`) still passes — the
   builder used only whitelisted features, so the self-compile frontier shrank.
7. The 3-layer boundary is enforceable: a reviewer can see that lowering names
   operations, the builder names opcodes/types, and only the writer names bytes.

### 6.2 Rollback (per phase)

The golden is the rollback trigger; small PRs are the rollback *mechanism*:

- **Detection:** a phase PR that fails `selfhost_emit_golden_test.ts` (any
  `tests/golden/*.bytes` mismatch) is **not mergeable** — the per-byte diff names the
  exact opcode/operand that regressed (§3.3), so the fix is local (usually a
  transcription error in one `fb*`/`m*` method).
- **Back out a landed phase:** because each phase is one self-contained PR that
  changed *no bytes*, reverting it is a clean `git revert` of that PR — the previous
  phase's `fb*` coexistence means the reverted family simply falls back to its prior
  form with the goldens still green. No cross-phase entanglement, because the strangler
  fig keeps old and new paths independently valid.
- **Phase G special-case (type indices):** if a Phase-G drift slips past the
  `mIntern* == old-formula` assert (it shouldn't — the assert runs before deletion),
  the kept debug-assert formulas let you bisect *which* type's index moved before
  reverting. Do **not** delete the old arithmetic until one full release after G lands
  green.

---

## 7. Summary for the implementer

- **Architecture:** thin 3-layer streaming builder (wasm-encoder shape, no node IR) —
  `BinaryWriter` (bytes, `curBuf`+`wTarget`, ~7 fns) → `WasmModule`/`FuncBuilder`
  (type interning `mIntern*`, valtype `fbValtype`, local/scratch allocation, ~40
  opcode methods) → slimmed `emit*` lowering. All state in module-global `let`s, all
  methods top-level `i32`-returning side-effecting functions — **zero closures**.
- **Order:** pin golden → promote writer → opcode families (control/locals → structs
  → arrays/`.push` → maps → strings) → lift type interning → lift local allocation →
  slim. Each phase a shippable PR; golden byte-identical + selfhost green after each.
- **Safety net:** 12 pinned golden modules in `tests/golden/*.bytes`, asserted
  byte-for-byte by `selfhost_emit_golden_test.ts`, captured on the unchanged emitter
  at Phase 0; a refactor PR that changes any golden byte is a red flag.
- **Top risk:** the type-index migration (Phase G) — mitigated by asserting
  `mIntern* == old-arithmetic` for every golden before deleting the formulas.
- **Sequencing:** **before** the emitter self-compiles, **after** `typecheck.vl`
  self-compiles, interleaved per-family with in-flight emitter feature work — the
  refactor *shrinks* the self-compile frontier (657 byte-ops → ~40 methods).

See [`docs/codegen-architecture.md`](codegen-architecture.md) for the rationale this
plan operationalizes.
