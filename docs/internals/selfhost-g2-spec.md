# Self-host `emitProgram` slice G2 — byte-level spec (struct field WRITE + module GLOBALS)

> Status: **spec / research only.** Changes no compiler file. This is the
> ground-truth byte reference the G2 implementation lane (in `compiler/wasmEmit.vl`)
> will trust, derived from gap items **G2** (struct field write) and **G5**
> (module-level mutable globals) in `docs/internals/selfhost-gaps.md`. Every byte claim
> below is backed by an actual binaryen hexdump — the reference program and the
> exact command are given for each so it is reproducible. Wrong bytes here are
> worse than no spec, so each multi-byte sequence is decoded field-by-field
> against the `od -An -tx1` output.

G2 has two halves:

- **(a) Struct field WRITE** — `s.field = v` → `struct.set`. The self-host
  `emitAssign` (`compiler/wasmEmit.vl` ~L1255) lowers only `Ident` (`local.set`)
  and `Index` (`array.set`) targets today; a `Member` target falls into
  *"assignment target is not a simple name"*. Field READ (`struct.get`) already
  works (`emitMem`, ~L830).
- **(b) Module-level mutable GLOBALS** — top-level `let gSrc = ""` / `gPos = 0` /
  `P` / `T` / `TY_*` lower to wasm `global`s. `collectFns` (~L324) currently fails
  loudly on any non-`FuncDecl`/non-`TypeDecl` top-level statement, and no global
  section (id 6) is emitted at all.

## Ground-truth method

Binaryen's own optimizer scalar-replaces any struct that does not escape and
constant-folds the rest, so compiling a `.vl` program through `deno task build`
**erases** the very `struct.set` we want to document (verified:
`/tmp/g2/structwrite.vl` with `p.x = p.x + 10` optimized down to a single
`i32.add` of params, no `struct.set` in the output). The self-host emitter emits
**un-optimized** bytes, so the authoritative reference is the un-optimized
binaryen encoding of the exact IR shape. Each section below builds that IR
directly with the same `npm:binaryen@130` the compiler pins (`deno.json`),
`m.emitText()` for the `.wat`, and `m.emitBinary()` + `od -An -tx1` for the
bytes. This matches the encoding `compiler/wasmEmit.vl` already hand-emits for
the list `len`/`cap`/`backing` fields (`emitPush`, ~L1389), so G2 is a *reuse*,
not a new mechanism.

---

## Part A — Struct field WRITE → `struct.set`

### Reference program / command

`/tmp/g2/probe_struct.ts`:

```ts
import binaryen from "npm:binaryen@130";
const m = new binaryen.Module();
m.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes);

const tb = new binaryen.TypeBuilder(1);
tb.setStructType(0, [
  { type: binaryen.i32, packedType: binaryen.notPacked, mutable: true },
  { type: binaryen.i32, packedType: binaryen.notPacked, mutable: true },
]);
const structHt = tb.buildAndDispose()[0];
const structRef = binaryen.getTypeFromHeapType(structHt, false); // non-null (ref $0)

const body = m.block(null, [
  m.local.set(2, m.struct.new([m.local.get(0, binaryen.i32), m.local.get(1, binaryen.i32)], structHt)),
  m.struct.set(0, m.local.get(2, structRef),                                   // p.x = p.x + 10
    m.i32.add(m.struct.get(0, m.local.get(2, structRef), binaryen.i32, false), m.i32.const(10))),
  m.struct.set(1, m.local.get(2, structRef), m.local.get(1, binaryen.i32)),    // p.y = b
  m.i32.add(
    m.struct.get(0, m.local.get(2, structRef), binaryen.i32, false),
    m.struct.get(1, m.local.get(2, structRef), binaryen.i32, false)),
], binaryen.i32);

m.addFunction("bump", binaryen.createType([binaryen.i32, binaryen.i32]), binaryen.i32, [structRef], body);
m.addFunctionExport("bump", "bump");
console.log(m.emitText());
await Deno.writeFile("/tmp/g2/probe_struct.wasm", m.emitBinary());
```

This is the un-optimized lowering of the VL source:

```vl
type Point = { x: i32, y: i32 }
function bump(a: i32, b: i32): i32 {
  let p: Point = { x: a, y: b }
  p.x = p.x + 10      // ← struct.set field 0
  p.y = b             // ← struct.set field 1
  p.x + p.y
}
```

Run:

```
deno run -A /tmp/g2/probe_struct.ts
od -An -tx1 /tmp/g2/probe_struct.wasm
```

### `.wat` (un-optimized)

```wat
(module
 (type $0 (struct (field (mut i32)) (field (mut i32))))
 (type $1 (func (param i32 i32) (result i32)))
 (export "bump" (func $bump))
 (func $bump (type $1) (param $0 i32) (param $1 i32) (result i32)
  (local $2 (ref $0))
  (local.set $2 (struct.new $0 (local.get $0) (local.get $1)))
  (struct.set $0 0 (local.get $2) (i32.add (struct.get $0 0 (local.get $2)) (i32.const 10)))
  (struct.set $0 1 (local.get $2) (local.get $1))
  (i32.add (struct.get $0 0 (local.get $2)) (struct.get $0 1 (local.get $2)))))
```

### Full hexdump (91 bytes)

```
00 61 73 6d 01 00 00 00              ; \0asm, version 1
01 0d 02                             ; type section (id 1), size 13, 2 types
  5f 02 7f 01 7f 01                  ;   type $0 = struct, 2 fields: (mut i32),(mut i32)
  60 02 7f 7f 01 7f                  ;   type $1 = func (i32 i32) -> i32
03 02 01 01                          ; func section (id 3), size 2, 1 func, functype idx 1
07 08 01 04 62 75 6d 70 00 00       ; export section (id 7): "bump" -> func 0
0a 34 01                             ; code section (id 10), size 0x34, 1 body
  32                                 ;   body size 0x32 (50 bytes)
  01 01 64 00                        ;   1 local group: count 1, type 0x64 00 = (ref $0)
  20 00                              ;   local.get 0
  20 01                              ;   local.get 1
  fb 00 00                           ;   struct.new  $0          (0xfb 0x00 <typeidx>)
  21 02                              ;   local.set 2
  20 02                              ;   local.get 2             (struct ref — operand 1)
  20 02 fb 02 00 00                  ;   local.get 2; struct.get $0 0   (p.x read)
  41 0a                              ;   i32.const 10
  6a                                 ;   i32.add                 (value — operand 2)
  fb 05 00 00                        ;   struct.set  $0 0   ◄──── struct.set, type 0, field 0
  20 02                              ;   local.get 2             (struct ref — operand 1)
  20 01                              ;   local.get 1             (value — operand 2)
  fb 05 00 01                        ;   struct.set  $0 1   ◄──── struct.set, type 0, field 1
  20 02 fb 02 00 00                  ;   local.get 2; struct.get $0 0
  20 02 fb 02 00 01                  ;   local.get 2; struct.get $0 1
  6a                                 ;   i32.add
  0b                                 ;   end
```

### The encoding that matters

```
struct.set  =  0xfb 0x05 <typeidx:uleb> <fieldidx:uleb>
struct.get  =  0xfb 0x02 <typeidx:uleb> <fieldidx:uleb>   (already emitted by emitMem)
struct.new  =  0xfb 0x00 <typeidx:uleb>                   (already emitted)
```

- **Opcode:** `0xfb 0x05`. `0xfb` is the WasmGC prefix; `0x05` is `struct.set`.
  Both immediates are ULEB128 (`typeidx`, then `fieldidx`).
- **Operand (stack) order — load-bearing:** the **struct ref is pushed FIRST,
  then the value**, then the `fb 05 ...` opcode pops `[ref, value]`. Confirmed by
  the bytes: `20 02` (`local.get 2`, the ref) precedes the value sub-expression
  before each `fb 05`. This is the *same* order `emitPush` already uses for
  `L.backing = NB` / `L.cap = NC` / `L.len = …` (`local.get L` then the value
  then `fb 05`, ~L1384–1421).
- **Field index** is the **declared field position** (0-based, declaration
  order) — identical to what `sFieldIndex` (~L759) already resolves for
  `struct.get` in `emitMem`. `p.x` → field 0, `p.y` → field 1.
- **Mutability:** the field must be `(mut i32)` (`0x7f 0x01` in the type section)
  for `struct.set` to validate. The self-host type-section emitter **already**
  emits every user-struct field mutable (`compiler/wasmEmit.vl` ~L1838–1840:
  `0x7f` then `0x01`), so no type-section change is needed.

### How to wire into `wasmEmit.vl`

Add a third arm to `emitAssign` (~L1255), after the `Index` arm and before the
`return emitFail("…not a simple name")`:

```
if target is Member {
  // recv.field = value  →  struct.set
  // 1. resolve the receiver's struct type index   (G1 dependency, see below)
  // 2. fieldIdx = sFieldIndex(target.memProp)      (machinery exists, ~L759)
  // 3. emitExpr(body, target.memObj, fnIx)         ; push the struct ref FIRST
  // 4. emitExpr(body, a.binRight, fnIx)            ; then the value
  // 5. body.push(251); body.push(5)                ; 0xfb 0x05 struct.set
  //    appendAll(body, ulebToArr(<structTypeIdx>))
  //    appendAll(body, ulebToArr(fieldIdx))        ; (or body.push for idx < 128)
  return 0
}
```

The byte emission is byte-for-byte the snippet `emitPush` already runs for the
list fields (`body.push(251); body.push(5); appendAll(body, ulebToArr(lTypeIdx));
body.push(<fieldidx>)`, ~L1389–1392) — so reuse that shape; only the type index
and the operand sources differ.

### G1 dependency (struct type index)

Step 1 above — *which* type index — is the only non-trivial part, and it depends
on **G1**:

- **Today (single struct):** the emitter is hard-capped at one user struct at
  WasmGC type index 0 (`sDeclared`/`structOffset`, `collectS` fails on a second
  `TypeDecl`). For the single-struct slice the receiver's type index is the fixed
  `0` (i.e. `structOffset - 1`), exactly as `emitMem`/`sFieldIndex` already
  assume. **Struct field WRITE for the one struct type can land independently of
  G1** — it is purely the missing `Member` arm in `emitAssign` plus the existing
  `fb 05` shape.
- **With multiple struct types (G1):** the receiver-to-type-index resolution must
  become per-type (a map from the receiver's static type to its WasmGC type
  index), and `sFieldIndex` must be parameterized by that struct rather than the
  single global `sFields`. That generalization is shared with the `struct.get`
  read path and is the same multi-struct-type machinery G1 introduces; the
  `struct.set` *byte encoding is unchanged* (still `fb 05 <typeidx> <fieldidx>`),
  only `<typeidx>` is now computed.

---

## Part B — Module-level mutable GLOBALS

### B.1 i32 global — reference program / command

`/tmp/g2/probe_global.ts`:

```ts
import binaryen from "npm:binaryen@130";
const m = new binaryen.Module();
m.setFeatures(binaryen.Features.GC | binaryen.Features.ReferenceTypes);
m.addGlobal("g", binaryen.i32, /*mutable*/ true, m.i32.const(0));      // let g = 0
const body = m.block(null, [
  m.global.set("g", m.i32.add(m.global.get("g", binaryen.i32), m.i32.const(1))),  // g = g + 1
  m.global.get("g", binaryen.i32),
], binaryen.i32);
m.addFunction("inc", binaryen.createType([]), binaryen.i32, [], body);
m.addFunctionExport("inc", "inc");
console.log(m.emitText());
await Deno.writeFile("/tmp/g2/probe_global.wasm", m.emitBinary());
```

VL equivalent:

```vl
let g = 0                 // module global
function inc(): i32 {
  g = g + 1               // global.set after global.get
  g                       // global.get
}
```

Run:

```
deno run -A /tmp/g2/probe_global.ts
od -An -tx1 /tmp/g2/probe_global.wasm
```

### `.wat`

```wat
(module
 (type $0 (func (result i32)))
 (global $g (mut i32) (i32.const 0))
 (export "inc" (func $inc))
 (func $inc (type $0) (result i32)
  (global.set $g (i32.add (global.get $g) (i32.const 1)))
  (global.get $g)))
```

### Full hexdump (51 bytes)

```
00 61 73 6d 01 00 00 00              ; \0asm, version 1
01 05 01 60 00 01 7f                 ; type section: 1 func () -> i32
03 02 01 00                          ; func section: 1 func, functype 0
06 06 01                             ; GLOBAL section (id 6), size 6, count 1
  7f                                 ;   global type: valtype 0x7f = i32
  01                                 ;   mutability: 0x01 = mut   (0x00 = const)
  41 00                              ;   init constexpr: i32.const 0
  0b                                 ;   end of init expr (0x0b)
07 07 01 03 69 6e 63 00 00           ; export section: "inc" -> func 0
0a 0d 01                             ; code section (id 10), size 0x0d, 1 body
  0b                                 ;   body size 0x0b (11 bytes)
  00                                 ;   0 local groups
  23 00                              ;   global.get 0     ◄──── 0x23, global index 0 (uleb)
  41 01                              ;   i32.const 1
  6a                                 ;   i32.add
  24 00                              ;   global.set 0     ◄──── 0x24, global index 0 (uleb)
  23 00                              ;   global.get 0
  0b                                 ;   end
```

### The encoding that matters

```
global section  =  0x06 <size:uleb> <count:uleb> ( <global> )*
  <global>      =  <valtype> <mut:byte> <init-constexpr> 0x0b
    <valtype>   =  0x7f i32 | 0x7e i64 | 0x7d f32 | 0x7c f64 | 0x64 <ht> (ref) | …
    <mut>       =  0x00 const | 0x01 mutable      (module globals are 0x01)
global.get      =  0x23 <globalidx:uleb>
global.set      =  0x24 <globalidx:uleb>
```

`<globalidx>` is the global's position in the global section (0-based), in the
order the globals are emitted.

### B.2 ref-typed global (struct / array init) — reference program

The real sources also have **ref-typed** module globals: `let gDiags: Diag[] =
[]`, `export let P: Parser = { … }`, `export let T: Checker = { … }`. WasmGC
**`struct.new` (and `array.new_fixed`) are valid constant init expressions**, so
these do **not** require a start function — they can sit directly in the global
section's init constexpr. Verified with `/tmp/g2/probe_global_ref.ts`:

```ts
m.addGlobal("P", structRef, true, m.struct.new([m.i32.const(0)], structHt));  // accepted, validates
```

`od -An -tx1 /tmp/g2/probe_global_ref.wasm` (relevant section 6):

```
06 0a 01                             ; global section, size 0x0a, count 1
  64 00                              ;   valtype 0x64 <ht 0>  = (ref $0)  (non-null)
  01                                 ;   mutable
  41 00                              ;   init: i32.const 0      (the struct's field)
  fb 00 00                           ;   init: struct.new $0    (0xfb 0x00 <typeidx>)
  0b                                 ;   end
```

So a ref-typed global with a struct/array literal initializer lowers to the
**same** `0xfb 0x00`/`0xfb 0x08` construction the emitter already produces for an
expression, placed inside the init constexpr and terminated with `0x0b`.

### B.3 Start-function fallback (non-constexpr initializers)

The TS compiler (`compiler/toWasm.ts`, `ensureGlobal` ~L442) always zero-inits
each global and runs the *real* initializer as a `global.set` inside a
`__program__` **start function** — because a general VL top-level initializer can
be an arbitrary expression, not a constexpr. The G2 self-host slice only needs
the constexpr path above for the literal initializers (`0`, `""`, `[]`, `{ … }`)
in the sources, but for completeness the start-function encoding is:

```
m.addGlobal("g", i32, true, i32.const 0)      ; zero-init placeholder
m.setStart(initFn)                            ; initFn does global.set g (real value)
```

Hexdump (`/tmp/g2/probe_start.ts`):

```
06 06 01 7f 01 41 00 0b              ; global section: g = (mut i32) placeholder 0
08 01 00                             ; START section (id 8), size 1, start func index 0
0a 08 01 06 00 41 2a 24 00 0b        ; code: __program__ body = (global.set 0 (i32.const 42))
```

```
start section  =  0x08 <size:uleb> <funcidx:uleb>
```

Recommendation for G2: prefer the **constexpr init** (B.1/B.2) for the literal
globals — it avoids a start function entirely. Reserve the start-function path
(B.3) only if a top-level initializer is not a constant expression (none of the
G2-target globals are, so it can be deferred).

### B.4 Section ordering — where the global section slots in

WasmGC keeps the canonical wasm section order; binaryen emits exactly this:

```
1 type → 2 import → 3 function → 4 table → 5 memory → 6 GLOBAL → 7 export → 8 START → 9 elem → 10 code
```

So in `compiler/wasmEmit.vl`'s `emitModule` (~L1802), the global section (id 6)
is inserted **after the function section (id 3, ~L1887) and before the export
section (id 7, ~L1909)**, and the start section (id 8, only if used) goes
**after export and before code (id 10, ~L1919)**. The emitter has no
import/table/memory/elem sections, so the live order becomes:

```
emitSection(1, typePayload)     ; type     (existing)
emitSection(3, funcPayload)     ; function (existing)
emitSection(6, globalPayload)   ; GLOBAL   ◄── NEW, here
emitSection(7, exportPayload)   ; export   (existing)
[emitSection(8, startPayload)]  ; START    ◄── only if start fn used
emitSection(10, codePayload)    ; code     (existing)
```

Every section already goes through the one `emitSection(id, payload)` helper
(~L127: `emitByte(id); emitULEB(payload.length); emitBytes(payload)`), so the new
global section reuses it verbatim — build a `globalPayload: i32[]` of `count`
followed by each `<valtype> <0x01> <init…> 0x0b`, then `emitSection(6,
globalPayload)`.

### How to wire into `wasmEmit.vl`

1. **`collectFns` (~L324)** currently fails on any top-level statement that is not
   a `FuncDecl`/`TypeDecl`. Extend it (or add a parallel `collectGlobals` scan) to
   collect top-level `let`/`const` (`VarDecl`) statements into a `globalStmts:
   i32[]` instead of failing — preserving declaration order (that order *is* the
   global index, B.1).
2. **Build a global-name → global-index map** (parallel to `fnNames`/`fnIndices`),
   plus each global's valtype kind (i32 vs struct-ref vs array-ref) so the global
   section can emit the right `<valtype>`.
3. **Emit the global section** in `emitModule` between sections 3 and 7 (B.4),
   each entry `<valtype> 0x01 <init constexpr> 0x0b`. The `<init>` reuses the
   existing `emitExpr`-style literal lowering (`i32.const` → `41 …`, struct →
   `fb 00 …`, array → `fb 08 …`).
4. **Route identifier reads/writes** in `emitExpr`/`emitAssign` to
   `global.get`/`global.set` when the name resolves to a module global rather than
   a local: in `emitAssign`'s `Ident` arm (~L1259), if `localIndexOf(...) < 0` and
   the name is a global, emit `0x24 <globalidx>` instead of failing; symmetrically
   a bare-`Ident` read of a global emits `0x23 <globalidx>` instead of
   `local.get`.

### G1 / G2(a) dependency

The leaf encodings (`0x23`/`0x24`, the section-6 framing) are **independent** of
G1 — a plain `let g = 0` i32 global can land standalone. The *ref-typed* globals
(`P`/`T`/`gDiags`) depend on:

- **G2(a) / G1** for their **type indices**: a `(ref $structTypeIdx)` global
  valtype (`0x64 <ht>`) and a struct-literal init (`fb 00 <typeidx>`) need the
  struct type to exist in the type section — the single-struct cap today, the
  multi-struct machinery under G1. A union-typed global (e.g. a `Node[]`/`Ty`
  field) additionally needs G1's union valtype.

So the **minimum independently-landable** global work is the i32/string globals
(`gPos`, `gSrc`) via the constexpr `i32.const`/string-literal init; the
struct/union-typed globals (`P`, `T`, `gDiags`) ride on G1/G2(a).

---

## Summary of verified encodings

| construct          | bytes                                  | reference / command                         |
| ------------------ | -------------------------------------- | ------------------------------------------- |
| `struct.set`       | `fb 05 <typeidx> <fieldidx>`           | `deno run -A /tmp/g2/probe_struct.ts`       |
| `struct.get` (ref) | `fb 02 <typeidx> <fieldidx>`           | (same dump; already emitted by `emitMem`)   |
| `struct.new`       | `fb 00 <typeidx>`                      | (same dump; already emitted)                |
| global section     | `06 <size> <count> (<vt> 01 <init> 0b)*` | `deno run -A /tmp/g2/probe_global.ts`     |
| `global.get`       | `23 <globalidx>`                       | (same dump)                                 |
| `global.set`       | `24 <globalidx>`                       | (same dump)                                 |
| ref-global init    | `<vt:64 ht> 01 <init…> fb 00 <ti> 0b`  | `deno run -A /tmp/g2/probe_global_ref.ts`   |
| start section      | `08 <size> <funcidx>`                  | `deno run -A /tmp/g2/probe_start.ts`        |
| section order      | `… 3 func, 6 GLOBAL, 7 export, 8 start, 10 code` | binaryen canonical order          |

Operand order for `struct.set`: **struct ref first, then value**, then
`fb 05 <typeidx> <fieldidx>` (matches the existing `emitPush` list-field stores).
Init expressions in the global section are full constexprs terminated by `0x0b`;
`struct.new`/`array.new_fixed` are valid constexprs, so ref-typed literal globals
need no start function.
