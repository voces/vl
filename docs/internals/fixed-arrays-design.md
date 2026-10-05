# Fixed-length value arrays (`T[N]`)

**Status: DESIGN, not built. IMPLEMENTATION HOLD (owner, 2026-10-04): no build starts until
sunpa confirms that the existing approach (records, the #3372 multi-value step, scratch
buffers) hits a performance limit.** The owner chose direction A on 2026-10-04 for sunpa SP-036
(asks 2 and 3): VL gets a fixed-length array type for small math aggregates (4x4 matrices,
vectors, quaternions, colours). This is revision 3. It replaces revision 2's per-decision
design with ONE model, whose recommendations come from the 2026-10-04 discussion between the
owner and the coordinator. **The owner has not ruled on any of it**; it is the proposal to
interrogate. Every measurement from revision 2 that still applies is kept (§7).

Contents: §0 the proposal on one page · §1 motivation · §2 assumptions · §3 survey · §4 the
unified model · §5 semantics and typing · §6 codegen per placement · §7 measurements · §8
interop · §9 risks · §10 owner questions and stated defaults · §11 panel dissent · §12
revision log · Appendix: benchmark sources.

---

## 0. The proposal on one page

**`T[N]` is a fixed-length, immutable VALUE.** It has no identity: copying it and sharing it
cannot be told apart, so the compiler may do either. **`a[i] = v` on any assignable place
means "replace the whole value with a copy that differs at `i`"**, defined as the rewrite
`a = a.with(i, v)`. This is Swift's *mutable value semantics*, specified as sugar over an
immutable value. `r.pose[3] = x` is therefore a write to the field `r.pose`, and
`list[k][i] = x` is a write to the list element `list[k]`. Nothing can alias a `T[N]`, ever.

**Placement is the compiler's choice**, and there is no syntax for it:

| where the value lives | placement | an element write costs |
| --- | --- | --- |
| local, parameter, result | N wasm locals / parameters / multi-value results | one `local.set` (a `br_table` when the index is dynamic) |
| record field | INLINE: N struct fields | one `struct.set` |
| list element `T[N][]` | FLATTENED: one backing array of N·len, stride N | one `array.set` |
| map value, union member, nullable, uniform generic slot, past the size cap | BOXED: an immutable heap array, shared freely | a rebuild of the box (O(N) and one allocation); a hint names it |
| `flat type` field | N elements inline in linear memory (offsets and size only) | a store through `std:buffer` |

**What the user writes:** `let m: f64[16] = [0.0; 16]`, `m[5] = 1.0`, `m[k * 4 + r]`,
`type Skeleton = { root: f64[16] }`, `const g: f64[16][] = []`, `xs as! f64[16]`,
`m as f64[]`, `a == b`, `for x in m`, `m.length` (a constant).

**Five owner questions** remain (§10), in dependency order: Q1 the value model, Q2 the
spelling of the type and its fill, Q3 the element types, Q4 whether dead writes are errors,
Q5 whether "no heap" holds at every optimisation level or at `-O` only; plus one adjacent
question about scalar `u8` record fields. Everything else is a stated default (§10.2), each following from an existing
ruling or from the model itself.

**Evidence (§7).** The locals placement runs sunpa's `m4Mul` at Rust parity with zero garbage
(re-run today: 93 ms against Rust's 98 ms on V8, 100 against 96 on wasmtime 49; today's
`f64[]` takes 119 ms with 172 scavenges). **In the browser (V8) the win is the removed
garbage plus about 1.3x speed**; the larger speed-ups are wasmtime's. An inline record field is
3.4x faster than today's `pose: f64[]` field on wasmtime for constant indices and ties it on V8.
A boxed update that rebuilds costs about
18 ns and one allocation per write, which is why it is the placement of last resort.
Flattening a list of matrices is worth 1.3–1.4x only once the list leaves the cache; the
larger win in sunpa's list code is removing the per-product allocation (4x on V8, 8x on
wasmtime), which value semantics gives with or without flattening.

---

## 1. Motivation, and what sunpa actually writes

**SP-027** (`~/sunpa/docs/vl-issues.md`): every `f64[]` vector op allocates, about 15x the
scalar code. **SP-036**: a 4x4 matrix as `f64[]` is a heap object per call. sunpa measured 163
ms as written, 115 ms with `filled(16, 0.0)`, and 97 ms for Rust `[f64; 16]`, with 1,768
scavenges. `cameraFrame` alone leaves about 32 KB a frame, and at 240 Hz each 0.5–1 ms
scavenge is a visible hitch. Asks, in order: (1) reserve `push` capacity (done, D3623); (2) a
fixed-size value type kept in locals or inline in records, with no heap and no bounds checks
past the static size; (3) scalar replacement of a fresh returned array, if (2) is far off.

**Records already serve vectors and quaternions.** `pose.vl` moved `V3` and `Q` to records,
and D3625's multi-value step (#3372) returns records of up to eight numeric fields without
allocating. What records cannot express is the matrix half: 16 elements (past
`MV_RECORD_MAX_FIELDS = 8`), computed indices in loops (`a[k * 4 + r]`), lists of matrices
(`g: f64[][]`, `cascades: f64[][]`), matrices inside records (`Skeleton.root: f64[]`), and
helpers written through a parameter (`m4MulInto(r, a, b)`), which is how sunpa avoids
allocation today.

Usage census of `~/sunpa/src` (read only; `f64[]` in 30 lines of `view.vl`, 27 of `pose.vl`,
23 of `legs.vl`, 70 of `anim.vl`):

| shape | example | what this design does with it |
| --- | --- | --- |
| return a fresh matrix | `m4()`, `perspective`, `lookAt`, `m4Invert` | multi-value result (§6.2) |
| 4x4 product in loops | `m4MulInto`, `mul` | constant indices after unrolling (§6.1) |
| write into a caller's matrix | `m4MulInto(r, a, b)`, `jittered(o, m)` | return the value instead: `sk.root = m4Mul(a, b)` is 16 `struct.set`s (§5.13) |
| list of matrices | `g: f64[][]`, `cascades: f64[][]` | `f64[16][]`, flattened (§6.4) |
| matrix inside a record | `Skeleton.root: f64[]` | inline field (§6.3) |
| module-level matrix | `viewProj`, `lightViewProj` | N globals, or a box (§6.5) |
| length-generic reader | `put(b: Buf, at, vs: f64[])` over 3, 4 and 16 | an un-annotated parameter, one instance per length (§5.10) |
| a pose list at STRIDE 10 | `compose(p, o)` reads `p[o + 3]` | `f64[10][]`, flattened at stride 10: `compose(pose[b])` reads constant indices, one bound check per bone |
| scratch ping-pong | `mA`/`mB` and `scratch()` in `legs.vl`, the push-16-zeros loop in `pose.vl` | disappear: values cannot alias, so `m4MulInto`'s "into `r`, not `a` or `b`" caveat goes too |

---

## 2. Assumptions

Each is **[measured]** (a program was run on today's master seed, `0502ce8f0`), **[read]**
(from source or a doc), or **[survey]** (from a language's documentation).

* **A1 [read]. WasmGC cannot hold an aggregate inline.** A struct field or an array element is
  one scalar or one reference, so "inline in a record" means N struct fields and "inline in a
  list" means a stride over one scalar array (`memory-gc-design.md`'s ceiling table).
* **A2 [measured]. Wasm locals cannot be indexed dynamically.** A `br_table` over N locals
  costs about 1 ns per access on V8 at every N measured (4 to 256), about 3x a mutable
  `array.get`, and its code grows by about 18 bytes per arm per access site (§7.4).
* **A3 [read]. The unroller is the constant-index machine.** `emitRangeUnrolled` unrolls a
  range loop with constant ends of 1–16 trips and at most 640 AST nodes, and declines when the
  body writes the loop variable, holds a function, makes a call that is not an inline memory
  intrinsic, or a step would wrap (DECISIONS.md, "Small constant range loops are unrolled").
* **A4 [read]. Records, lists and maps stay reference types.** Nothing here changes them.
* **A5 [read]. This overrides two sections of `docs/guide/collections-design.md`.** §VL.6 and
  §OQ.2 hold that value-versus-reference is a language-wide call. Q1 makes `T[N]` the
  exception: a numeric aggregate, not a collection. §VL.7's "one user-facing collection" is
  overridden too; its inferred header-less representation of `T[]` stays a separate,
  invisible optimisation and must never be called a "fixed array" in user docs.
* **A6 [measured, rev 2]. `for v in vs` over an un-annotated parameter is refused today**
  ("for-in expects an array, a map or a string, got _"); `vs.length` and index loops work.
* **A8 [measured, rev 2]. Both engines cap a function type at 1,000 parameters and 1,000
  results** (V8 and wasmtime 49).
* **A9 [measured]. `as` is numeric-only**: `[1.0, 2.0] as f64[]` gives "`as` supports numeric
  conversions only".
* **A10 [read]. Closures capture variables by reference** (D2339), copying into the closure
  only bindings never assigned after capture.
* **A11 [measured]. `==` is structural** on lists and on records, including a list of records
  (`[p] == [q]` prints `true` for two equal-field records). `print` takes scalars and strings
  only.
* **A12 [measured, rev 2]. Today's paths share references**: `let r = s.root; r[0] = 7.0`
  writes `s.root`, and `for m in g { m[0] = 9.0 }` writes `g`. **Loop variables and
  parameters are assignable** (measured today: `for m in g { m = 3.0 }` and
  `for i in 0 until 3 { i = 5 }` both compile and run). A port that keeps these shapes
  compiles under value semantics and silently does nothing (§5.14).
* **A13 [measured]. `T[N]` and `[v; N]` are free syntax**: `let a: f64[16] = []` fails with
  "expected `]` but found `16`", and `[0.0; 16]` with "expected `,` but found `16`".
* **A15 [read]. No VL value spans several wasm values today** (`F32x4` is one `v128`). The
  emitter assumes one value is one stack slot everywhere. §6.2 keeps that assumption true in
  the emitter by doing the scalarisation in the host's multi-value step.
* **A16 [measured, rev 2]. Containers never widen**: `const b: f64[] = a` with `a: i32[]` is
  refused because "it would be a copy, and a write through either list would not reach the
  other". Only `readonly T[]` is covariant.
* **A18 [read]. The host's multi-value step (`scripts/vl-host/src/multivalue.rs`) already
  scalarises immutable records**: a struct type no `struct.set` reaches, used only field by
  field, becomes N locals and N results, with twins per call site, loop-carried locals
  included. It runs at `-O`/`-O3` only. Its bound is 8 fields.

---

## 3. Survey

Each subsection gives the type, its semantics, its storage, the cost of a dynamic index, and
what its users complain about. Facts are **[survey]**; the Swift, Julia, Zig and Valhalla
points were checked against current sources on 2026-10-04 (links in the appendix).

### 3.1 Rust `[T; N]`

A value. `Copy` when `T: Copy`, otherwise moved. Stored inline everywhere: on the stack, in a
struct, and contiguously in `Vec<[T; N]>` (the model for §6.4). A dynamic index is
bounds-checked (a panic); LLVM removes the check when it can prove the range, and a constant
out-of-range index is a deny-by-default lint. Length generics are const generics (`const N:
usize`, 1.51). `&a` coerces to `&[T]`, and `<[T; N]>::try_from(slice)` fails on a length
mismatch. **Complaints:** a large array built on the stack overflows it
(`Box::new([0; 1 << 20])`); arithmetic on lengths (`[T; N * 2]`) is still unstable; moving a
large array is a `memcpy` the source never shows; `array::map` and `from_fn` have generated
poor code for large N.

### 3.2 C `T[N]` and C++ `std::array`

C's array is not assignable, decays to a pointer when passed (no copy), and is copied only
inside a struct. No bounds checks. C++'s `std::array<T, N>` is an aggregate value: copied on
assignment and pass, inline, `[]` unchecked, `.at()` throws. **Complaints:** decay (`sizeof`
on a parameter), C's missing assignment, and in C++ the verbose spelling and the size
deduction that needed `std::to_array` (C++20).

### 3.3 Go `[N]T`

**A value**: copied on assignment, when passed, and by `range` (which iterates a copy). Inline
everywhere. Arrays are comparable with `==` and may be map keys. A dynamic index panics; a
constant out-of-range index is a compile error. Generics cannot abstract over N. `a[:]` makes
a slice that **aliases** the array. **Complaints:** silent copies of large arrays on every
pass (people pass `*[N]T` instead), the `range` copy surprising people who write into the
array in the loop, and the aliasing slice. Go's arrays are seldom used directly; slices are
the everyday type. **Lesson:** a value array beside a growable reference sequence is a known,
workable pairing; the copy cost must be visible somewhere.

### 3.4 Swift `Array` (copy-on-write) and `InlineArray` (Swift 6.2)

`Array` is a value with reference-counted copy-on-write storage: a copy is free until a write,
which checks uniqueness and copies if shared. `a[i] = v` mutates in place under *mutable
value semantics*: a `var` of value type is exclusively owned, so a write cannot be observed
through any other name. **Complaints:** hidden copies when a buffer turns out to be shared,
the cost of the uniqueness check, and exclusivity-checking surprises. Before 6.2, fixed C
arrays imported as tuples (`(Int8, Int8, …)`), which cannot be indexed.

`InlineArray<let count: Int, Element>` (SE-0453, with integer generic parameters SE-0452, and
the sugar `[4 of Int]` from SE-0483) is a fixed-size, inline value: stack-allocated in a local,
stored inline in a class, never an implicit heap allocation. It is **eagerly** copied (no
copy-on-write) and deliberately does **not** conform to `Sequence` or `Collection`, because
those protocols would invite implicit copies. **Lesson:** Swift chose the same "value, inline,
eager copy" contract and the same element-assignment syntax; its update rule is this design's
rewrite rule. Its refusal of the sequence protocols is the cautionary note for VL's generic
list functions over `T[N]` (§5.10).

### 3.5 Zig `[N]T`

A value, copied on assignment, inline. A comptime-known out-of-range index is a compile error;
a runtime one is a safety-checked panic. Coerces to a slice `[]T`. `comptime N` parameters
give length generics. Separate SIMD type `@Vector(N, T)`. **Complaints, and the most relevant
one in the survey:** Zig allows the compiler to pass a by-value parameter **by reference**
when it judges that safe (the "parameter reference optimisation") and to write results in
place (result location semantics). When the caller also holds a mutable pointer to the same
memory, the aliasing becomes observable: the callee sees its "copy" change (ziglang/zig
#5973, #12251, #22906). **Lesson for VL:** a design that says "value semantics, the compiler
picks the placement" is only sound if no placement can let a write reach a value another name
holds. VL's answer is that the value is immutable and every write is a whole-value
replacement of a *place* (§4.2), so the compiler never needs a no-alias proof to share.

### 3.6 C# `InlineArray`, fixed buffers, `readonly struct`

Arrays are reference types. `fixed double b[16]` exists only in `unsafe` structs over
primitives. C# 12's `[InlineArray(16)] struct` is an inline value convertible to `Span<T>`.
**Complaints:** *defensive copies*: calling a method on a non-`readonly` struct held in a
`readonly` field copies the whole struct first, silently; `readonly struct` and `in`
parameters exist largely to stop that. **Lesson:** hidden copies of value aggregates are the
known performance trap; VL's immutable value makes a read never copy (§6.5), and the copies
that do happen (a boxed update, a whole read of an inline field into locals) are bounded and
hinted.

### 3.7 Java Valhalla value classes and flattened arrays

JEP 401 (preview) value classes have no identity and only final fields; an update constructs
a new value. The JVM chooses whether to flatten a value into its containing object or array
or to keep a reference: **placement is the runtime's choice**, as here. Flattening is limited
by nullability (null-restricted types are a separate JEP) and by atomicity: a mutable
flattened field or element must be read and written atomically, which today limits it to
about 64 bits unless the class opts out of atomicity. **Lesson:** Valhalla is the closest
large-scale precedent for "immutable, no identity, placement chosen for you". Its two limits
do not bind VL: wasm has no threads sharing GC objects (tearing is impossible), and VL keeps
the nullable case boxed (§6.5).

### 3.8 Julia StaticArrays (`SVector`, `MVector`, `setindex`)

`SVector{N, T}` is an immutable `isbits` struct over an `NTuple`. It lives in registers, and a
`Vector{SVector{3, Float64}}` stores its elements contiguously (flattened). Updates are
`setindex(v, x, i)`, returning a new value; Accessors.jl adds `@set v[i] = x` as the
mutable-looking spelling. `MVector` is the mutable variant (heap unless the compiler proves it
does not escape). Code is fully unrolled. **Complaints:** compile time and code size explode
with N; the documented rule of thumb is to use an ordinary `Array` past about 100 elements; a
length the compiler cannot infer makes code type-unstable and slow. **Lesson:** this is the
nearest design to this one (immutable value, update by rebuild, flattened in arrays, unrolled
code) and it is a success for small N. Its one hard limit is the same as VL's: past some N,
unrolling and register placement cost more than they save (§6.6).

### 3.9 GLSL / WGSL `vecN`, `matNxM`, `array<T, N>`

Value types, copied. `out`/`inout` parameters are copy-in copy-out. WGSL never traps: an
out-of-range dynamic index reads some in-range value or zero, and a constant one is a
creation-time error. **Complaints:** a dynamic index into a function-local array forces the
GPU compiler to spill the array to scratch memory (the same choice as §6.1's `br_table`
versus spill); buffer layout rules (`vec3<f32>` aligned to 16 bytes in uniform and storage
buffers) produce silent padding mismatches with CPU-side structs. **Lesson:** GPU-bound
layouts need explicit padding, which VL's `flat` already demands (§8.3).

### 3.10 OCaml `floatarray`

OCaml boxes floats, except in a `float array`, which it stores flat. The representation is
chosen at **run time** from the element tag, so every polymorphic array access checks for the
float case; `floatarray` names the flat case explicitly, and a configure flag removes the
hack. **Complaint:** the hidden representation switch taxes all generic array code.
**Lesson:** a placement switch must be decided statically. VL monomorphises, so each
instance knows its placement at compile time.

### 3.11 D, Kotlin and Scala, briefly

**D** is the closest *spelling* precedent: `int[4]` is a static array, a **value** (D2
changed it from D1's by-reference passing), beside `int[]`, a growable reference slice;
`a[]` slices (aliases) a static array. Its users' complaint is that `auto a = [1, 2, 3]`
infers a dynamic array, so a static one needs an annotation or a helper. **Kotlin** has
reference arrays (`DoubleArray`) and single-field value classes; multi-field value classes
wait on Valhalla. **Scala** uses JVM arrays. Neither has a fixed-length value array.

### 3.12 Comparison and lessons

| language | semantics | storage | dynamic index | length generics | element update |
| --- | --- | --- | --- | --- | --- |
| Rust `[T; N]` | value (copy or move) | inline; contiguous in `Vec` | checked, panic | const generics | in place (`&mut`) |
| C `T[N]` / C++ `std::array` | C: not assignable, decays; C++: value | inline | unchecked / `.at()` | templates | in place |
| Go `[N]T` | value, copied on pass and `range` | inline | checked, panic | none | in place on a variable |
| Swift `InlineArray` | value, eager copy | inline | checked, trap | integer generics | in place under exclusivity |
| Zig `[N]T` | value; compiler may pass by reference | inline | checked | comptime | in place |
| C# `InlineArray` | value (struct) | inline | through `Span`, checked | none | in place |
| Java value class | immutable, no identity | VM's choice; flattened if small and null-restricted | n/a (fields) | none | rebuild |
| Julia `SVector` | immutable value | registers; flattened in arrays | checked | type parameter | `setindex` rebuild; `@set` sugar |
| WGSL `array<T, N>` | value | registers or scratch | clamped, no trap | none | in place |
| OCaml `floatarray` | mutable reference | flat, chosen at run time | checked | n/a | in place |
| **VL `T[N]` (proposed)** | **immutable value, no identity** | **compiler's choice by placement (§4)** | **checked, trap** | **none in v1** | **rewrite to `a = a.with(i, v)`** |

**What VL should take.**

1. **Every fast fixed array is a value.** The only reference-typed design in the survey that
   aims at speed (AssemblyScript's `StaticArray`, in revision 2) is a heap object, which is
   SP-036's complaint.
2. **Immutable plus a mutable-looking update is a proven pair** (Julia `setindex` + `@set`,
   Swift's mutable value semantics, Valhalla withers). It gives value semantics without any
   no-alias proof, which is where Zig went wrong.
3. **Placement chosen by the implementation works when the value has no identity**
   (Valhalla, Swift `InlineArray`, Julia), and fails when it does (Zig, OCaml's run-time
   switch).
4. **Large N is the universal limit** (Julia's 100, Rust's stack overflows). The cap must be
   measured and the switch to a heap representation must be priced where it happens.
5. **Hidden copies are the universal complaint** (Go, C#, Swift CoW). VL's model has two kinds
   of copy (a boxed rebuild, a whole read of an inline field into locals); §6 bounds both and
   §5.16 hints the expensive one.
6. **Length generics are optional.** Go and C# ship without them and are usable; Rust and Swift
   added them years after the type.

---

## 4. The unified model

### 4.1 One type

`T[N]` is a value of N elements of type `T`, where N is a positive integer literal or a
`const` bound to one. It is **immutable** and has **no identity**: VL has no reference
equality, so nothing can tell two equal `T[N]` values apart, or tell a copy from a share.

### 4.2 One rewrite: element assignment replaces the whole value

`p[i] = v`, where `p` is an assignable **place**, means `p = p.with(i, v)`. **`with` is
specification notation, not a name**: there is no `with` method or function a program can
call, and adding one would be a std export under the built-in-methods ruling and
`std-api-reviewer`. `p` is assignable exactly where `p = e` would be: a `let` binding, a
parameter, a loop variable, a record field, a list element, a module global. Compound forms
nest: `p[i][j] = v` is `p[i] = p[i].with(j, v)`, which is `p = p.with(i, p[i].with(j, v))`.
`+=` and friends rewrite the same way.

**Each subexpression of a place is evaluated once, left to right**, and then the
read-modify-write happens: the receiver, every index, and any user index operator (`"[]"` /
`"[]="`, B14). `g[f()][k] += h()` calls `f` once and `h` once, as `g[f()] += 1.0` on a list
does today (measured). `idt[k][i] = v` on a B14 container holding `f64[16]` values calls
`"[]"` once to read the element and `"[]="` once to store the rebuilt one, so it needs both
operators. The rewrite's nested spelling above is notation for the value written, not the
evaluation order; the position matrix carries a row that counts evaluations.

Everything else follows from existing rules about `=`:

| program | why | result |
| --- | --- | --- |
| `const m: f64[16] = …; m[0] = 1.0` | `m = …` is refused for a `const` | refused, the `const` message |
| `f()[0] = 2.0` | `f() = …` is not a place | refused, "not assignable" |
| `sk.root[12] = 1.0` | `sk.root = …` is a field write | writes `sk`'s field, seen by every name for `sk` |
| `g[j][k] = x` with `g: f64[16][]` | `g[j] = …` is a list element write | writes the list |
| `g[j][k] = x` with `g: readonly f64[16][]` | `g[j] = …` is refused through `readonly` | refused |
| `let b = a; b[0] = 1.0` | `b = …` rebinds `b` only | `a` unchanged |
| `const h = () => m[0]; m[0] = 1.0; h()` | an assignment to a captured variable (D2339) | `1.0` |
| `f().pose[3] = x` | `f().pose = …` is a field write on a returned reference | legal, writes that record |
| `m[k][i] = v` with `m: {[string]: f64[16]}` | `m[k]` is `f64[16] \| null`, which cannot be indexed (as today: "cannot index non-array f64[] \| null") | refused; write `const p = m[k] ?? …; m[k] = …` |
| `u[0] = 1.0` with `u: f64[4] \| f32[4]`, not narrowed | the place's type is a union | refused, naming `is`; per-member dispatch is additive later |
| `p: readonly f64[16]` | a value is already unwritable through any other name | a hint: `readonly` is redundant on a value |

**Narrowing.** An element write assigns a value of the binding's own type, so it never
retires a narrowing of that binding by itself. It *is* a write for D2390's `callMayWrite`: a
call to a closure that element-writes a captured array ends narrowings of that binding, which
is new relative to lists (whose element writes are not writes to the binding).

There is no special rule for any of these rows; that is the point of defining the update as a
rewrite.

### 4.3 Storable everywhere; placement by position

| tier | positions | placement | constant-index read / write | dynamic read / write | whole read | whole write |
| --- | --- | --- | --- | --- | --- | --- |
| **value** | `let`, `const`, parameter, result, `if`/`match` value, captured-and-never-reassigned | N locals; N params; N multi-value results | `local.get` / `local.set` | `br_table` | N moves | N moves |
| **record field** | `type R = { m: T[N] }` | inline: N struct fields | `struct.get` / `struct.set` | `br_table` over the fields | N `struct.get` | N `struct.set` |
| **list element** | `T[N][]` | flattened: one backing of N·len, stride N | `array.get` / `array.set` at `j*N + k` | the same (index arithmetic, no `br_table`) | N `array.get` | N `array.set` |
| **global** | module `let` | N wasm globals | `global.get` / `global.set` | `br_table` | N | N |
| **boxed** | map value, union member, `T[N] \| null`, a captured cell that is reassigned, a uniform generic slot, any value past the size cap | an immutable `(array T)` of N, shared, never copied on delivery | `array.get` / **rebuild** | `array.get` / **rebuild** | 1 reference | 1 reference (or one allocation if the source is unboxed) |
| **linear memory** | a field of a `flat type` | N elements at `Type.field + k * size(T)` | load / store through `std:buffer` | the same | N loads | N stores |

The placement of a value is a property of where it is **stored**, never of its type, and it is
unobservable: every row above implements the same value semantics. That is what lets each
placement land in its own build slice (§6.7) without any program changing meaning.

### 4.4 What is NOT in the model

* No reference to a `T[N]`, no `inout`, no `&`. A function that "fills a caller's matrix"
  returns it (§5.13).
* No length generics, no const-generic syntax (§5.10).
* No element-wise arithmetic (`a + b` over arrays). That is a std or SIMD question for later.
* No printing, hashing or map keys in v1 (§5.5).

---

## 5. Semantics and typing

### 5.1 The type and its spelling

`f64[16]` extends the `T[]` suffix family with a length (Q2 weighs `[f64; 16]` and
`[16 of f64]`). Suffixes compose inside out, as `T[][]` does: `f64[16][]` is a list of
matrices, and `f64[3][4]` is **four** `f64[3]`, so `m[i][j]` has `i < 4` and `j < 3`. That is
Rust's order (`[[f64; 3]; 4]`) and the reverse of C's. `readonly` binds the outermost suffix,
as today. N may be a name (`f64[SIZE]`) when it resolves to a module-level or enclosing
`const` whose value is a positive integer literal or exact const arithmetic (owner ruling,
2026-09-30); anything else is a check error naming the rule. `T[0]` is refused.

### 5.2 Literals and adoption

A list literal of exactly N elements in a `T[N]` position builds a `T[N]`; a wrong length is a
check error naming both lengths. Elements adapt as scalars do: `const v: f64[3] = [1, 2, 3]`
is `[1.0, 2.0, 3.0]`, a runtime `i32` element converts to `f64`, and an `i64` element into
`f64` is refused with an `as` fix (the numeric lattice).

**Adoption (D3339 style), restricted.** A binding whose initialiser is only a literal, whose
uses include a delivery to a `T[N]` type, and whose OTHER uses are only reads and deliveries,
**adopts** that type at the declaration, and every use sees it:

```vl
const p = [1.0, 2.0, 3.0]
takesV3(p)                 // takesV3(v: f64[3]): p is f64[3] everywhere
const u = [1.0, 2.0]
u.push(3.0)
takesV2(u)                 // error naming both uses: `push` needs a list, `takesV2` a f64[2]
```

This is the record covariance ruling's "a fresh literal adopts its destination" and D3339's
"adopts fully, every read sees it". **The restriction is what keeps it sound**: D3339 and B′
adopt within one kind (a wider number, a wider field), but list to value changes aliasing,
which record covariance refused. So a binding that is element-written, aliased into another
binding, field or list, or captured does **not** adopt; a `T[N]` use of it is refused with the
annotate fix (`const p: f64[3] = …`). Otherwise a use further down would change what a write
further up means:

```vl
let p = [1.0, 2.0]
const q = p
q[0] = 9.0                 // a list write, seen through p ...
takesV2(p)                 // ... unless this use made p a value: refused instead, "annotate p"
```

With no fixed-array use, a literal stays a `T[]`, so no existing program changes type.

### 5.3 Construction beyond a literal

Recommended (part of Q2, since the fill's spelling follows the type's bracket family): the fill
`[v; N]`, which evaluates `v` once, plus element writes, which are free in the value tier:

```vl
let m: f64[16] = [0.0; 16]
for i in 0 until 4 { m[i * 5] = 1.0 }          // unrolled: four local.set
const z: f32[64] = [0.0; 64]
```

A lint hint (`fill-evaluates-once`) fires when `v` contains a call. A generator
(`f64[16].from((i) => …)`) is a later, additive option (stated default D24): it needs a type in
expression position, which VL has nowhere else, and an unroll-and-inline guarantee for its
closure, and the fill-plus-loop already compiles to the same code.

`[...a, ...b]` is a literal whose length is known when every spread operand is a `T[N]`, so
`const h: f64[4] = [...v3, 1.0]` is legal (homogeneous coordinates). A spread of a `T[]`
operand has a run-time length and is refused in a `T[N]` position, naming `as!`.

### 5.4 Conversion: `as` both ways

```vl
const xs: f64[] = m as f64[]          // out: infallible, a fresh list
const m2: f64[16] = xs as! f64[16]    // in: traps on a length mismatch
const m3 = xs as? f64[16]             // f64[16] | null
```

`as` checks the length first and then converts **each element under the same trio**, because
`as` is VL's exact-or-fail conversion operator ("a lossy conversion is a failure"):
`[1.5] as! i32[1]` traps (1.5 is not exact), `[2.0] as! i32[1]` is `[2]`, and `as%` wraps
element-wise for integer targets. Implicit delivery converts element-wise only when exact for
every element type (§5.11), so the explicit operator does at least what the implicit path does.
Bare `as` propagates null as the numeric trio does. This extends `as` beyond
numbers for the first time (A9), which is the owner's corollary "when a proposed name is an
operator the language already has, spelled as a function, the answer is the operator", over a
`toList()` method. There is no implicit conversion either way: a `T[N]` delivered to a `T[]`
parameter is refused with both fixes named (`as f64[]`, or an un-annotated parameter).

### 5.5 Equality, printing, hashing

`a == b` is element-wise, with each element's own `==` (`NaN != NaN`, `-0.0 == 0.0`), exactly
as lists and records compare today (A11). `print(m)` and template holes refuse a `T[N]` with
the list message, naming `m[i]`; aggregate printing is a separate decision for all
aggregates. A `T[N]` is not a map key in v1 (Go allows it; it is additive later).

### 5.6 Iteration

`for x in m` and `for x, i in m` evaluate `m` once and iterate that value. A write to `m` in
the body rebinds `m` and does not change the iteration: this is not an extra rule, it is what
"`m` is a value" means. Over a locals-held `m` with constant N the loop unrolls; a body that
writes `m` costs at most N extra locals (the snapshot), never an allocation. Over an inline
field (`for x in sk.root`) the loop reads the field's elements as it goes when the body
cannot write `sk.root`, and snapshots them into locals when it can.

### 5.7 `.length`

A compile-time constant `i32`. `for i in 0 until m.length` therefore has constant bounds and
unrolls under the existing rule.

### 5.8 Indexing

Any `i32` index. Out of range traps, as a list does. A **constant** out-of-range index (a
literal or a `const`, at the source position) is a check error, raised once per source
position and never per instance or unrolled copy. A range variable is not "constant" for this
rule even when its loop unrolls, so the check never depends on an unroll budget; it traps at
run time exactly as lists do today.

### 5.9 Element types

Recommended v1 (Q3 (c)): numbers, `u8`, `boolean` and nested arrays. Numeric records are
Q3 (a), described here so the question is concrete.

* **Numbers**: `i32`, `i64`, `f32`, `f64`, `u32`/`u64` once they exist.
* **`u8`**, under `u8[]`'s existing rule: packed in storage (`(mut i8)` struct fields, an
  `(array (mut i8))` backing, one byte in a `flat` layout), an `i32` when read, and a
  computed store keeps the low byte while an out-of-range literal is a check error
  (`collections-design.md`, "u8 is an ELEMENT type only"). In the value tier a `u8[4]` is four
  `i32` locals, and every write masks to the low byte, so the storage still enforces the range
  the type claims (the owner's "a type must not claim a range it does not enforce").
* **`boolean`**, except in a `flat` field (flat refuses `boolean` for its own reason).
* **Nested fixed arrays**: `f64[4][4]`, placed recursively (16 locals, 16 fields, stride 16).
* **Numeric records, if Q3 (a)** (`type V3 = { x: f64, y: f64, z: f64 }`, every field a number,
  `boolean`, `u8` or nested such record): stored **by field** (`V3[4]` is 12 slots in every
  placement), copied in on a write and copied out on a read. `const v = a[0]` is a fresh `V3`;
  `v.x = 1.0` does not change `a`; `a[0].x = 1.0` does, through the rewrite
  (`a = a.with(0, { ...a[0], x: 1.0 })`). A copied-out record that is only read field by field
  never allocates at `-O`, through the existing multi-value step. A `new { … }` record keeps
  its brand through the copy.
* **Not in v1** (any Q3 answer): strings, lists, maps, closures, unions, nullable elements. Strings are
  immutable and would be sound; lists and maps would make the array a value of shared mutable
  references ("value" in name only). Both are additive later. Each refused element type gets a
  message naming the supported set, graded one member per row before it ships (CLAUDE.md).

**Why records are not recommended for v1.** Stored by field, a record behaves as a value or as
a reference depending on what holds it: with `a: V3[4]`, `const v = a[0]; v.x = 1.0` leaves
`a` unchanged; with `a: V3[]`, the same two lines change `a`. That is per-container value
semantics for records, the copy-on-delivery the record covariance ruling refused because it
"silently changes aliasing", and `collections-design.md` §VL.6 calls value-versus-reference a
language-wide call. It may be worth it (`V3[4]` is sunpa's next shape after matrices), but it
is a second concept and the owner should rule on it knowing that, after v1. Flattening `V3[]`
lists is a separate question again.

### 5.10 Generics

Element generics work as for any type: `function trace<T>(m: T[16]): T` instantiates per
`T`. **No length generics in v1**: there is no `<const N>`. An **un-annotated parameter**
instantiates per argument type as it always does, and `f64[3]` and `f64[16]` are different
types, so sunpa's `put(b, at, vs)` over 3, 4 and 16 elements becomes three instances, each
with a constant `vs.length` and an unrolled loop. That needs A6's for-in hole fixed; until
then the index loop over `vs.length` works.

An un-annotated body that is legal for `f64[]` and not for `f64[16]` (`vs.push(x)`) is found
only when the fixed instance is made. The refusal names the instance and the call that made it
and is raised **at the call**, never lost at a monomorphisation pin (CLAUDE.md records eleven
check rejects lost that way).

**std list functions over `T[N][]`** (`map`, `filter`, `sorted`) instantiate with `V = T[N]`
and run correctly on the flattened list, since the list's element accessors are the
compiler's, **but they allocate one box per element at `-O`**: their callback goes through
`call_ref`, and the host step twins only direct calls. Fast whole-list passes are written as
loops until the step learns `call_ref` twins. std functions taking `T[]` do not accept a `T[N]`; there is no sequence interface
in v1 (Swift made the same call for `InlineArray`, for the same reason: a generic sequence API
over a value invites hidden copies).

### 5.11 Joins, unions, nullables, implicit conversion

* **Joins** of different fixed types follow the numeric-join ruling: `if c { a16f64 } else {
  a16f32 }` is the union `f64[16] | f32[16]` (boxed members), discriminated with `is`. Lists
  refuse such joins because a join would copy; a value is copied anyway, so that objection does
  not apply.
* **Element-wise implicit conversion** follows the scalar rule: `i32[2]` delivered to `f64[2]`
  converts (exact for every element); `i64[2]` to `f64[2]` is refused with an `as` fix. Sound,
  because there is no aliasing to break.
* **Nullable** `T[N] | null` is boxed (null is the null reference). A narrowed read
  (`if p != null { p[0] }`) reads the box.
* **`is`** discriminates union members as today. There is no run-time length test on a `T[]`:
  `xs is f64[16]` with `xs: f64[]` is refused and names `as?`.

### 5.12 Closures

D2339 applies unchanged, because an element write IS an assignment (§4.2). A captured array
never reassigned after capture is copied into the closure environment (N fields within the cap,
else a box reference). One reassigned after capture lives in a shared cell, which is boxed: its
element writes rebuild the box (§6.5), and a hint names it.

### 5.13 Out-parameters: return the value

The `…Into(r, a, b)` idiom exists to avoid an allocation. Under value semantics the return
costs none, and storing it into a place writes in place:

```vl
sk.root = m4Mul(a, b)       // multi-value call, then 16 struct.set into sk's inline field
g[j] = m4Mul(g[j], t)       // 16 array.get, the call, 16 array.set into the flattened list
```

There is no `inout` in v1. Swift's `inout`, GLSL's `out` and C#'s `ref` are the precedents if a
consumer later needs one; each would be additive.

### 5.14 Dead element writes

A ported program that kept a list idiom compiles and computes nothing (A12):

```vl
function m4MulInto(r: f64[16], a: f64[16], b: f64[16]) { r[0] = a[0] * b[0] }   // r is never read
for m in g { m[0] = 9.0 }                                                        // m is a copy
```

**Proposed (Q4): an element write to a parameter, a loop variable, or a `let` initialised from
a place, after which the binding is never read, is a check error**, naming the fix ("write
`g[i][0] = …`, or return the value"). A closure capturing the binding counts as a read. Writes
followed by reads are untouched, so a parameter used as scratch is fine. This is per-binding
liveness within one function. It is an error rather than a warning because every refused
program computes nothing observable, and each one is a silent wrong result for a program ported
from list code.

**The same hazard through a call result.** sunpa's `m4MulInto` writes `r` and then *returns* it,
and its callers ignore the result (`m4MulInto(viewProj, proj, view)`, `view.vl:697`). The rule
above does not fire (`r` is read by the return), and today's `unused-pure-expression` lint
covers only literal and identifier statements. **Proposed (Q4): a call statement whose
result is a `T[N]` and is discarded is a check error**, naming the fix
(`viewProj = m4Mul(proj, view)`). A message for a dead write through a list element
(`mulLocalInto(…, out[b])`) names `out[b] = …`.

### 5.15 Spread

* **List spread**: `[...v3, 1.0]` contributes N elements statically (§5.3); `[...g]` over a
  `T[N][]` copies the flattened backing with one `array.copy`.
* **Record spread** (`docs/internals/record-spread-design.md`, PR #3377): `{ ...sk, root: m }`
  copies a `T[N]` field like any value field. Revision 2 needed spread to deep-copy fixed
  fields; under this model a field's value has no identity, so the shallow copy record spread
  already does is the correct one.
* **Call spread** into fixed parameters (`lookAt(...eye, ...target)`) is NOT in v1; it is
  additive later and would expand N arguments statically.

### 5.16 Hints

Two `vl check` hints, each driven by the same predicate the emitter uses, so they cannot
disagree (the two-producers rule):

* `fixed-array-boxed-update`: an element write to a value in a **boxed** placement inside a
  loop, or two or more such writes in one function ("each write rebuilds the 16-element array:
  …"); it also fires when a value passes boxed because a signature is past its slot budget.

* `fixed-array-dynamic-index`: an index the emitter cannot make constant, on a value-tier
  binding, in a loop ("`m[c * 4]` is a switch over 16 locals").

And one **build** report, because a hint cannot predict what the `-O` host step will decline
(§6.2): `vl build -O`/`-O3` prints, by default, one warning per function in which a
value-tier `T[N]` box survives the step, with the step's reason (what `VL_MV_EXPLAIN=1`
prints today for records). The wasm alone cannot tell a value-tier box from an intentionally
boxed one (a map value is the same `(ref $F)`), so the emitter records its value-tier locals
in a custom section the step reads and strips.


### 5.17 Entry-module exports

A `T[N]` in an entry-module export signature is refused in v1, naming `as f64[]` or a `Buf`. An
ABI chosen for a host is permanent, and no consumer asks yet.

### 5.18 The one-page explanation (for the guide)

| you have | write | it is | copies |
| --- | --- | --- | --- |
| a growable sequence, shared between owners | `f64[]` | a list, a reference | never implicitly |
| a small math value (vector, matrix, colour) | `f64[16]`, `u8[4]` | a value with the length in its type | always (the compiler makes it cheap) |
| bytes, compactly | `u8[]` | a list of bytes, packed, read as `i32` | never implicitly |
| memory a host or GPU reads in place | `Buf` (`std:buffer`) | an extent of linear memory | `storeF32` etc. copy in |
| a byte layout inside a `Buf` | `flat type` | a record whose offsets are constants | through the `Buf` |
| four f32 lanes in one instruction | `F32x4` (`std:simd`) | one `v128` | a value |

The guide's rule of thumb: **a `T[]` is a container you share; a `T[N]` is a number with
several parts.**

### 5.19 The amendment `collections-design.md` §VL.7 gets on Q1 (a)

§VL.7 says the fixed-size gap "closes without a second user-facing type", calls its inferred
lowering "fixed-array", and floats `List<T>`/`Array<T>` forcing names. If Q1 is ruled (a), that
section gets, in the same PR as the ruling: the lowering renamed **"header-less list"** (never
"fixed array" in user docs); its "no second type" rationale struck, with a pointer here; the
`Array<T>` forcing name withdrawn (`T[N]` is the explicit fixed form); and a statement of
whether the header-less lowering is still planned. This design recommends keeping it as an
invisible optimisation for never-grown lists that are not small math values, and not
building it before a consumer measures the header cost.

---

## 6. Codegen per placement

### 6.1 The value tier: N locals

A constant index is `local.get`/`local.set`. The unroller (A3) makes most matrix loops
constant; this design adds an unroll override for loops indexing a value-tier array with the
range variable (up to 64 trips and 4,096 nodes, measured in the build). It keeps the three
semantic vetoes (the body writes the loop variable; the body holds a function; a step would
wrap) and **drops the call veto** for such loops: that veto is a cost heuristic (a call
outweighs the saved test), and here the alternative is a `br_table` per access, which §7.1's
`g_brtable` row prices at 229 ms against today's 119. Without the override, sunpa's
`frustumPlanesInto` (a `sqrt` call in the outer body) would port about 2x slower than today.
`std:buffer`'s `storeF32`/`loadF32` must count as inline memory intrinsics for the same reason.
A non-constant index is a `br_table` over the N locals, for reads and writes (A2).

**`br_table` versus spill (measured, §7.4).** A `br_table` costs about 1 ns per access on V8
and 1.2–1.6 ns on wasmtime, flat in N, with no allocation. A mutable heap array is about 3x
faster per access (0.3 ns) but must be allocated, which brings garbage back once per call
(revision 2's `pk_box`: 124 scavenges per 10^6 calls). The decision: **`br_table`**, and a
binding whose dynamic access sites would exceed a code budget (N × sites × ~18 bytes, budget
about 4 KB per function) is demoted to a frame-private box (allocated once per call, mutated in
place because no other name can reach it), with the `fixed-array-dynamic-index` hint naming the
allocation.

### 6.2 Parameters and results: reuse the #3372 host step

Revision 2 had the emitter emit N locals and multi-value results itself, VL's first
multi-slot representation (A15), with an audit of every one-value-one-slot site in the emitter.
**This revision proposes the cheaper route the owner's direction names**: the emitter emits a
value-tier `T[N]` as an immutable `(array T)` box (no `array.set` can reach that type, by
construction), and the host's multi-value step, extended from immutable structs to immutable
fixed arrays, scalarises it at `-O`/`-O3`:

* `array.new_fixed $F N` plays the role of `struct.new`, `array.get $F` with a constant index
  the role of `struct.get`, and `array.len` folds to N;
* a box used only element-wise becomes N locals, a producer gets a twin returning N results,
  and loop-carried values (`m = m4Mul(m, t)`) qualify, as they do for records today;
* the rebuild `a.with(i, v)` with a constant `i` is emitted as `array.new_fixed` of N gets with
  one replaced, which the step sees as one more `struct.new` of fields; with a run-time `i` it
  is `array.new_fixed` of N `select(v, a[k], i == k)`, which scalarises to N selects (the
  write half of the `br_table`, without a branch);
* a dynamic `array.get` on a scalarised box becomes the `br_table`;
* the bound is per array (64 slots, §6.6), separate from `MV_RECORD_MAX_FIELDS = 8`;
* **packed `u8` elements**: today the step admits only full-width storage
  (`StorageType::Val`), so a `u8[N]` box would never scalarise, and if it were taught packed
  storage naively a `u8` local could hold 300. S1 teaches it packed `i8` arrays with the mask
  in the step: `i32.and 255` at every operand of `array.new_fixed` and every rebuild, and
  `array.get_u` becomes a plain `local.get`. Each value position gets a matrix row that stores
  300 into a `u8[4]` and prints 44. A `u8[N]` with N ≤ 4 (≤ 8) may instead be packed into one
  `i32` (`i64`) local, `c[k]` a shift and a mask and a store one little-endian `i32.store`; the
  choice is invisible to the model and is the build's to measure.

**What the step must be taught** (read against `multivalue.rs`, panel critic (d)):

* **The length is not in the wasm type.** The emitter mints one final, non-subtyped
  immutable `(array T)` type per (T, N), inside the type section's single rec group, so two
  identical `(array f64)` at different indices stay different types. Nothing collides today:
  every array type the emitter mints is mutable, the string backing included. The step learns
  N by checking that every allocation of the type is `array.new_fixed $F N` (so the fill
  `[v; N]` is emitted as `array.new_fixed` of N copies, never `array.new`), and its
  `by_index` table counts array types as well as structs.
* **D3630's write rule is moot**: `array.set`, `array.fill` and `array.copy` cannot validate
  against an immutable array type, so qualification is simpler than for records.
* **"Element-only" is an adjacency test, and the step runs before binaryen.** The step
  recognises `struct.get` right after the reference; an `array.get` takes its index from the
  stack, so the pattern is `local.get a; i32.const k; array.get`. Unrolled loop variables reach
  the step as `i32.const; i32.const; i32.mul; …`, not as one constant. **S1's prerequisite is an
  emitter constant folder** that emits every static index (`k * 4 + r` after unrolling) as one
  `i32.const`; the shared static-index predicate (§6.1) is that folder's test, and the matrix
  carries a `k * 4 + r` row.
* **The growth bound must be per function.** Today a module over 4,096 twins or 64 KiB plus
  half its code section gets no step at all; one heavy matrix function could switch #3372 off
  for every record in sunpa's module. `vl_scaling_shape_test.ts` gains a writes × N axis.
* **Binaryen already removes intra-function rebuilds.** Probed by the panel: two chained
  rebuilds of an immutable `(array f64)` with constant indices lose every array op under
  `wasm-opt -O3` (Heap2Local); a dynamic index keeps three. So at `-O` the step's real new work
  is cross-call twins, the dynamic-index `br_table`, and the packed-`u8` mask.

The emitter's one-value-one-slot invariant stays true. The price: **`-O0` allocates** (one
box per rebuild), so a debug build is a correct but garbage-producing build, and the "no
heap" guarantee is a property of `-O`, not of the type. Revision 2's hand-written lowering of
exactly what the step would produce (`e_mvg`) is the measurement (§7.1). If the step declines
a function (a `br_table` exit, a growth bound), the program still runs, with boxes, and the
build says so (§5.16). Q5 asks whether this route, or the emitter's, carries the no-heap promise.

### 6.3 Record fields: inline

The emitter lays a `T[N]` field out as N struct fields (`(mut f64)` × 16; `(mut i8)` × 4 for a
`u8[4]`). A constant-index element write is one `struct.set`; a dynamic one is a `br_table`
over the fields (§7.2: about 0.6 ns per access slower than an array on V8, 0.3 on wasmtime). A
whole read (`const p = sk.root`) is N `struct.get` into the value tier; a whole write
(`sk.root = m4Mul(a, b)`) is N `struct.set` from the call's results. No box is ever made for
a field. Revision 2's "owned box per field" and its copy invariant are gone: there is nothing
for a second name to reach.

### 6.4 List elements: flattened

`T[N][]` is a list whose backing is one `(array (mut T))` of N·capacity, stride N, with the
list header holding the element count. `g[j]` reads N elements at `j*N`; `g[j] = v` writes N;
`g[j][k] = x` is one `array.set` at `j*N + k`, with **no `br_table` even for a dynamic `k`**.
`push` appends N; `pop` reads N; `[...g]`, `slice` and `concat` are one `array.copy`.
**The bounds check is per element access, not per scalar**: check `j < len` once, then `k < N`
statically or once. Today's VL codegen for a hand-flattened `f64[]` re-checks the header on
every `g[b + k]` and so runs *slower* than `f64[][]` in cache (§7.3); the flattened lowering
must not inherit that.

### 6.5 Boxed placements: immutable, shared, rebuilt on write

A map value, union member, nullable, reassigned capture cell, a value past the cap, and any
generic slot VL keeps uniform hold an immutable `(array T)`. Because it is immutable it is
**shared, never copied on delivery**: `byName.set(k, m)` stores the reference if `m` is
already boxed, and boxes once if `m` was in locals. An element write builds a new box (O(N) and
one allocation; §7.2 measures about 18 ns per write on V8 and 15 on wasmtime, with garbage),
which `fixed-array-boxed-update` hints. A later optimisation can mutate in place when the box
is provably unique (freshly built by this function and not yet stored, passed, captured or
returned); that is invisible, because nothing else can observe the box.

### 6.6 The size cap

Measured (§7.4):

* `br_table` time does not grow with N, but its code does: about 18 bytes per arm per site,
  so a dynamic access is ~290 bytes at N = 16, ~1.1 KB at 64 and ~4.6 KB at 256;
* passing N parameters ties passing one array reference up to N = 64 (V8 29.6 against 27.5 ms
  per 10^6 calls; wasmtime 36.7 against 36.8) and loses at 256 (148 against 104 on V8);
* both engines cap a signature at 1,000 parameters and results (A8).

**Stated default: 64 scalar slots** per value for the value tier (locals, parameters,
results, globals), counted after nesting and records (`V3[16]` is 48 slots), with a
per-signature budget of 256 parameter slots and 64 result slots (the rest pass boxed). Past
the cap the value is boxed. Inline fields and flattened lists have **no cap**: a field's cost
is the record's size, and a list's stride is arithmetic. Julia's rule of thumb is 100 elements;
64 is the nearest power of two under it that the measurements support. All three numbers are
lowering constants recorded in DECISIONS.md, not part of the type system. Crossing the cap is
silent placement plus a hint (D25), never a type error.

### 6.7 Build slices, sized in agent-days

Each slice is unobservable to programs from the previous one, so each ships alone; the
position matrix (`scripts/capability-probes/matrix.py`) grades every slice, with a template per
placement and, in every template, an **aliasing proof** in both directions (write the
destination and read the source, then the reverse, printing values that show independence).

| slice | content | agent-days |
| --- | --- | --- |
| S0a semantic core | parser (`T[N]`, `[v; N]`); a new type kind (not a flag on `TyArray`: 345 `is TyArray` sites would treat it as a list silently) **and a `nameIsFixedArray` predicate in `tyname.vl`**, because the emitter classifies lists by SPELLING (`nameIsArray`, a trailing-`[]` test, ~180 uses in `emit_*.vl`), where `f64[16]` falls to each ladder's default and `f64[16][]` peels into the ref-list machinery; the rewrite, place rules, literal and fill, index, constant-index errors, `==`, `for`, `.length`, dead writes; locals, parameters, results and fields as an immutable box. `T[N][]`, unions, nullables, map values, adoption and `as` are refused until S0b | 4 |
| S0b the rest of the semantics | union and nullable members (a new union-box member kind: a rep change, so `rep-fuzz-check.sh` is mandatory), map values, `as`, adoption, joins, closures | 3–4 |
| S1 value tier | the host step learns immutable fixed arrays (§6.2: per-(T, N) types, the constant folder, per-function growth bound, the custom section), the `br_table` rewrite, the unroll override, the cap, packed `u8` | 2–3 |
| S2a globals | N wasm globals per module-level `T[N]` | 1 |
| S2b inline fields | N struct fields per `T[N]` field: a VL-field → wasm-slot-base map threaded through construction, the D1510 evaluation-order stash, record spread, record `==`, D622 prefix subtyping, union boxing and `mAssignTypeIndices` (the emitter assumes one VL field is one wasm field: `sFieldCount` at 78 sites, ~330 raw-ordinal `struct.get`/`set` emissions) | 4–5 |
| S3 flattened lists | stride-N backing through ~25 list-op emitters (`emitPush`, `PushMany`, `Pop`, `PopOr`, `ArrSlice`, `ArrSpread`, `ListConcat*`, `emitIndex`, …) and D3623's build-region pushes | 5–6 |
| S4 `flat` and `u8` | `flat` fields of `T[N]`, `u8[N]` fields and elements, folded element offsets | 1–2 |
| S5 numeric record elements, if Q3 (a) | by-field storage, copy-in and copy-out | 2 |

**About 22–28 agent-days in total**, with S0a + S1 (6–7 days) delivering SP-036's ask 2 for
locals, parameters and results. This is the implementer critic's pricing after reading the
emitter, against the coordinator's first estimate of 14–17; the owner's note that the
coordinator overestimates is recorded beside it in §11. Revision 2 priced a smaller scope at
five to six weeks.

**Whether S0 ships alone is measured, not assumed.** At `-O0`, S0 boxes every placement and
rebuilds on every element write, so a ported `m4MulInto` allocates 16 boxes per product where
today's code allocates one. At `-O3`, binaryen's Heap2Local already removes the intra-function
rebuilds when the indices are constant (§6.2), leaving about one box per call, roughly today's
cost. D21: measure S0a at `-O3` on sunpa's `m4Mul`; if it is no worse than today it ships, and
otherwise it waits for S1.

**The position matrix needs an optimisation-level face.** `scripts/capability-probes/run.py`
runs `vl run` with no `-O`, so everything S1 adds would be invisible to it; the matrix grades
2 faces × 2 levels (`-O0`, `-O3`). Templates, one per placement: local, parameter, result,
loop-carried, field, global, list element, map value, union member, nullable, capture never
reassigned, capture reassigned; a generic template that leaves `T` open (`f<T>(m: T[16])`), per
CLAUDE.md's rule that a matrix with a type parameter needs one; one row per assignment form;
the evaluation-count row (§4.2); the `k * 4 + r` row; and the aliasing proof in both directions
in every template.

Compile-time and seed-size: the compiler itself uses no `T[N]`, so the seed grows by the new
code only. The seed-size red line is +3% (about 121 KB on today's 4,035,184-byte baseline);
S0a and S0b each read `seed-size.vl --check` and rebaseline in the same PR if needed. Unrolling at 64 trips grows user modules; `tests/vl_scaling_shape_test.ts` gains an
N axis, and the cap is re-measured on the guest-fuel instrument before S1 lands.

---

## 7. Measurements

Everything ran under `nice -n 19` on the shared 24-core box (load 5–14 during the runs). V8 is
Deno 2.9.6 (3 warm-up calls, then 7 timed calls, 3 rounds; the minimum is quoted, medians are
in the raw output). wasmtime is the 49.0.0 CLI (`--invoke bench`, the same module at `n = 0`
subtracted, 5 rounds, minimum quoted). Scavenges are V8 `--trace-gc` lines during one call.
Only gaps over about 10% are claimed. Sources are in the appendix.

### 7.1 The prototype (revision 2, re-run today)

sunpa's benchmark: `m = m4Mul(m, t)` 10^6 times, the result reading one element per row (row r
of a product depends only on row r, so revision 1's single-element result let LLVM and V8
delete three rows; corrected in revision 2).

| row | what it is | V8 ms rev 2 / **today** | wasmtime rev 2 (47, `vl run`) / **today (49 CLI)** | scavenges |
| --- | --- | --: | --: | --: |
| b_filled | VL `f64[]` + `filled`, today's best spelling | 105–111 / **119** | 201 / — (imports `print`) | 149–172 |
| f_struct | an immutable 16-f64 struct across the call | 87–93 / **97** | 125 / **104** | 124–147 |
| **e_mvg** | **the value-tier lowering: 32 params, 16 results, 16 loop-carried locals** | 82–95 / **93** | 89 / **100** | **0** |
| rust | `[f64; 16]` by value, `#[inline(never)]` | 93–94 / **98** | 89 (49) / **96** | 0 |
| g_brtable | e_mvg with the loops NOT unrolled (64 dynamic reads per product) | 229 | 240 | 0 |
| a_push | VL `f64[]` + `push` (SP-036 as written) | 127–129 | 238 | 174 |
| d_scalar | VL source scalarised by hand | 81–87 | 86 | 0 |

**Finding:** the value tier is at Rust parity on both engines with zero garbage, today as in
revision 2. `e_mvg` is exactly the code §6.2's host step would produce.

Revision 2's dynamic-read rows (10^6 reads of a 16-f64 locals value, ns per read over a
constant read): `br_table` 2.1 (V8) / 1.0 (wasmtime); 16 stores to a linear-memory scratch
then a load, 2.6 / 3.7; a fresh heap box, 6.7 / 23.6 with 124 scavenges.

### 7.2 Inline record field versus boxed (new)

A record `{ count: i32, pose: f64[16] }` held in a module global. **W**: 10^6 iterations, each
reading and writing all 16 elements at constant indices (`pose[k] = pose[k] * 0.999 + x`).
**D**: 10^7 iterations, each one dynamic write (`pose[i & 15] += 1`) and one dynamic read
(`pose[(i * 7) & 15]`).

| placement | W: V8 / wasmtime ms | D: V8 / wasmtime ms | scavenges (W / D) |
| --- | --: | --: | --: |
| **inline: 16 struct fields** (§6.3) | **2.8 / 4.3** | **19.1 / 24.5** (`br_table`) | 0 / 0 |
| mutable box, written in place (revision 2's owned box) | 3.3 / 14.8 | 7.2 / 18.7 | 0 / 0 |
| immutable box, rebuilt per write (§6.5) | 12.4 / 26.1 | 187.8 / 150.7 | 147 / 1,471 |
| VL today: `pose: f64[]` field, built by the master seed | 2.8 / 13.1 | 6.5 / 18.8 | 0 / 0 |

**Findings.**

1. **Constant-index access: inline wins on wasmtime by 3.0–3.4x** over any box or today's list
   field. On V8 W is latency-bound (16 independent multiply-add chains) and every non-rebuilding
   placement ties.
2. **Dynamic access through `br_table` over fields is the one place inline loses**: about
   0.6 ns per access on V8 against a mutable array (0.3 on wasmtime). A mutable box is not
   available under value semantics without a uniqueness proof, so the fair comparison is the
   immutable box, which inline beats by 10x on V8 and 6x on wasmtime.
3. **A boxed rebuild costs about 18 ns per write on V8 (15 on wasmtime) and one 16-element
   allocation.** That is the price §6.5 hints, and why boxing is the placement of last resort.

### 7.3 Flattened `T[N][]` versus `T[][]` (new)

1,024 4x4 matrices. **Stream**: per pass, every element of every matrix is read and written.
**Bone pass**: per pass, `g[j] = g[j] × t` for every matrix (sunpa's per-bone loop), 1,000
passes (10^6 products).

| row | layout | V8 ms | wasmtime ms | scavenges |
| --- | --- | --: | --: | --: |
| VL today, stream | hand-flattened `f64[]`, stride 16 | 6.6 | 17.6 | 0 |
| VL today, stream | `f64[][]` | 4.4 | 19.0 | 0 |
| VL today, bone pass | hand-flattened, scalar product in locals | 11.2 | 27.7 | 0 |
| VL today, bone pass | `f64[][]`, product in locals written back in place | 8.2 | 22.5 | 0 |
| VL today, bone pass | `f64[][]`, `g[j] = m4Mul(g[j], t)` (sunpa's code) | 33.9 | 176.3 | 49 |
| raw wasm, stream, 1,024 matrices (128 KB) | flat `(array f64)` | 4.2 | 13.4 | 0 |
| raw wasm, stream, 1,024 matrices | array of 1,024 row arrays | 3.4 | 14.6 | 0 |
| raw wasm, stream, 65,536 matrices (8 MB), 16 passes | flat | 6.6 | 24.8 | 0 |
| raw wasm, stream, 65,536 matrices | array of rows | 9.5 | 32.5 | 0 |

**Findings.**

1. **The allocation, not the layout, is sunpa's cost**: `g[j] = m4Mul(g[j], t)` over `f64[][]`
   is 4.1x the in-place form on V8 and 7.8x on wasmtime. Value semantics removes it in any
   placement (the result is written into the element, not a new list).
2. **Layout alone is a tie in cache** (128 KB) and **1.3–1.4x for flat once the list leaves the
   cache** (8 MB), plus one GC object instead of 1,025 (today's `f64[][]` is two objects per
   matrix: header and backing).
3. **Today's hand-flattened VL code runs slower than `f64[][]` in cache** because every
   `g[b + k]` reloads the list header and re-checks the bound. The flattened lowering must check
   `j` once per element access (§6.4), or flattening ships a regression.

### 7.4 The size cap (new)

Dynamic access: 10^7 iterations of one `br_table` read and one `br_table` write over N locals
(`dl`), against an `(array (mut f64))` (`db`). Calls: 10^6 calls passing N `f64` parameters
(`cm`) against one array reference the callee reads N times (`cb`).

| N | `dl` V8 / wt | `db` V8 / wt | `dl` module bytes (2 sites) | `cm` V8 / wt | `cb` V8 / wt |
| --: | --: | --: | --: | --: | --: |
| 4 | 7.5 / 7.1 | 8.4 / 13.4 | 238 | 2.5 / 3.3 | 2.9 / 1.5 |
| 16 | 19.3 / 23.1 | 5.8 / 13.6 | 634 | 7.2 / 8.4 | 8.5 / 7.8 |
| 64 | 19.9 / 26.4 | 5.5 / 13.8 | 2,218 | 29.6 / 36.7 | 27.5 / 36.8 |
| 256 | 20.0 / 30.4 | 5.4 / 13.7 | 9,473 | 148.0 / 198.6 | 104.1 / 168.5 |

**Findings.** `br_table` time is flat in N (about 1 ns per access on V8); its code grows about
18 bytes per arm per site. N parameters tie a reference through 64 and lose 1.2–1.4x at 256.
Hence the 64-slot cap and the per-function code budget for dynamic sites (§6.1, §6.6).

---

## 8. Interop

### 8.1 `flat type`

A `flat` field may be a `T[N]` of flat-able elements (`i32`, `i64`, `f32`, `f64`, `u8`, a
newtype over one, a flat record), laid out as N consecutive elements with no padding, so
`flat type Bone = { m: f32[16], tint: u8[4] }` has `Bone.m = 0`, `Bone.tint = 64`,
`Bone.size = 68`. This extends flat's field rule (`flat-records-design.md` §3), which today
admits only 4- and 8-byte scalars; **`u8` fields and `u8[N]` come with it** (1-byte storage,
which the owner ruled legal for flat). A 2-byte type does not exist in VL, so 2-byte fields
wait for one. `boolean` stays refused. A flat record used as a GC value holds its `T[N]` field
inline (§6.3), as any record does. The rules that follow from flat's existing ones:

* **Element offsets are derived, never hand-computed** (flat §9's rule). `Bone.m[k]` in a layout
  expression folds to `Bone.m + k * 4` (a type name cannot be indexed today, so the syntax is
  free); a constant `k` folds to a constant, a dynamic `k` is arithmetic. `Bone.m.length` folds
  to 16. Nesting composes: `Skin.j[k] + Joint.x`, and a `Joint[4]` field is `4 * Joint.size`.
* **The cycle guard covers arrays**: `flat type A = { a: A[2] }` is the same infinite-layout
  reject as `{ a: A }`.
* **No alignment, no padding**, as today: an `f64[2]` at offset 4 is legal and the user owns
  the alignment, which wasm's unaligned loads tolerate.
* **Little-endian**, as all of wasm. A big-endian field (a network header) is read as `u8[4]`
  plus shifts; a byte-swap helper is a later std question, filed rather than implied.
* **Erasure stays exact** (flat §4: "flat adds validation and subtracts nothing"). A `u8[N]`
  field is legal in every record (§6.3: `(mut i8)` struct fields), so a flat record with one is
  byte-identical to the same declaration without `flat`. A **scalar** `u8` field breaks that
  unless plain records admit it too, so this design admits a scalar `u8` field in every record
  (packed `(mut i8)`, read as `i32`, a computed store keeps the low byte): the same
  storage-backed argument the `u8` ruling makes for list elements. That amends
  `collections-design.md`'s "no field may hold a `u8`" (D19).

### 8.2 `Buf` and views

A `Buf` is linear memory; a `T[N]` is a GC-side value. Moving one into the other is N loads or
stores, written as an unrolled loop, which is free in the value tier:

```vl
let m: f32[16] = [0.0; 16]
for i in 0 until 16 { m[i] = b.loadF32(at + i * 4) }      // 16 f32.load into 16 locals
for i in 0 until 16 { b.storeF32(at + i * 4, m[i]) }      // 16 f32.store
```

For a value-tier N this IS the best code possible, which is why no helper is proposed in v1. A
later `storeF32s(b, at, m)` can be written today through an un-annotated parameter (one instance
per N); its twin `loadF32s(b, at): f32[16]` cannot, because no argument carries N and v1 has
no length generics. It needs length generics or a builtin, which is recorded in D18.

### 8.3 GPU upload and bulk copies

**There is no bulk path from a GC array to linear memory.** `array.copy` copies only between
GC arrays and `array.init_data` reads data segments, not memory; a host cannot view a GC array
as bytes either (V8 exposes no typed-array view of one). So a flattened `f32[16][]` bone
palette uploads as N·len scalar stores, every time. **Guidance: per-frame GPU data lives in
`Buf`-backed `flat` rows and is computed in the value tier**; a `T[N][]` list is for data that
is not uploaded every frame.

**GPU layouts pad where flat does not, and flat will never infer GPU stride.** A tight
`f32[N]` matches WGSL storage (std430-like) layout for scalars and `mat4x4<f32>`; it does NOT
match these, and the doc pins the flat spelling that does:

| WGSL type (address space) | size / stride | the matching flat spelling |
| --- | --- | --- |
| `mat4x4<f32>` (any) | 64 bytes | `m: f32[16]` |
| `vec3<f32>` (any) | 12, aligned 16 | `p: f32[3], _p: f32` |
| `array<vec3<f32>, N>` (any) | stride 16 | `flat type V3p = { v: f32[3], _p: f32 }`, then `ps: V3p[N]` |
| `mat3x3<f32>` (any) | 48 bytes (three columns of stride 16) | `m: V3p[3]` (not `f32[9]`, which is 36) |
| `array<f32, N>` (uniform) | stride 16 | `flat type F16 = { v: f32, _p: f32[3] }`, then `a: F16[N]` |
| `array<f32, N>` (storage) | stride 4 | `a: f32[N]` |

### 8.4 SIMD

`F32x4` stays the SIMD type: a `v128` with lane-wise operators. A value-tier `f32[4]` *could*
be held in one `v128` local (constant index = `extract_lane`/`replace_lane`; dynamic index =
a `br_table`), but VL defines no arithmetic on arrays, so nothing would use the vector
instructions. Not in v1. The conversions `f32[4]` ↔ `F32x4` are a later std question. Both
that and an `f64x2`-lane lowering of `m4Mul`'s inner products are **follow-ups, not
rejections**: the value tier already reaches Rust's scalar speed without them.

### 8.5 Records and the multi-value step

S1 extends the existing step rather than adding a second one: the same twins, the same
growth bound, a separate per-array bound (64). A record with an inline `T[N]` field counts its
fields after expansion against `MV_RECORD_MAX_FIELDS`, so a `{ root: f64[16] }` record is not
returned as multi-value; the record's own result rule is unchanged.

### 8.6 What never crosses a boundary

**A `T[N]` does not cross an `extern function` or an entry-module export in v1** (D17), and the
reason is stronger than "no consumer asks": its placement depends on the build flag (a box at
`-O0`, N scalars at `-O`, §6.2), so an ABI taken from the placement would change with `-O`. C
passes arrays by pointer, so the honest mapping is a `Buf` base and length, as
`docs/guide/extern.md` already does for bytes. If arrays ever cross, it is as a `Buf`, never as
an expanded N-parameter signature.

### 8.7 Bits are preserved

Every placement keeps exact bits: locals, struct fields, flattened elements, the boxed rebuild
(including the `select` form), and `f32.store`/`f32.load` through a `Buf`. No placement
round-trips an element through another width. Element-wise conversions (§5.11) are exactly the
scalar ones, with the scalar caveats: `f32 → f64` promotion is exact for numbers, and wasm does
not fix a NaN's payload through `f64.promote_f32`, so sunpa's determinism contract
(same bits on every host) keeps NaN payloads out of converted arrays as it does for scalars.
S0's matrix carries a payload-NaN row per placement, read back with `reinterpret`.

---

## 9. Risks

1. **The rewrite has to reach every assignment form.** `p[i] op= v`, nested places, `++` if it
   ever exists, places inside closures. A missed form either refuses a legal program or (worse)
   writes a temporary. Control: one rewrite function in the checker, and a position matrix row
   per assignment form, each with the aliasing proof.
2. **`-O0` allocates** (§6.2). A consumer profiling a debug build will see garbage the release
   build does not have. The S1 alternative is the emitter-level multi-slot representation of
   revision 2 (A15), deferred, not rejected.
3. **The host step can decline** (a `br_table` exit, the growth bound, a module it cannot
   validate). The program then runs with boxes, correctly but with garbage. Control:
   `VL_MV_EXPLAIN=1` already says why; S1 adds fixed arrays to its report, and the
   `plumb-shape-cost.py` and fuel instruments gain a fixed-array shape.
4. **Boxed placements rebuild on every write.** A loop writing a map-held matrix element by
   element is O(N²) with garbage. Control: the hint (§5.16), and the uniqueness optimisation
   later (§6.5).
5. **Flattening can regress in-cache code** if the per-element bound check is per scalar
   (§7.3, finding 3).
6. **Dead-write errors may refuse a pattern someone relies on** (a parameter written for its
   side effect in a closure is a read, so is safe; the risk is a false positive in the liveness
   scan). Control: the error names the binding and the last write; it is per-function and
   needs no interprocedural analysis.
7. **Adoption (§5.2) changes a binding's type from its uses.** Every adoption ruling so far has
   had to be all-or-nothing per binding (D3339); the same discipline applies.
8. **Seed and compile time.** The new type kind trips `kind-ladder-incomplete` at every closed
   ladder in the checker (the safe failure); unrolling to 64 trips grows user modules. Both are
   measured before S1 lands.
9. **The emitter's spelling ladders are not closed kind sets**, so the kind-ladder lint does
   not protect them: `f64[16]` fails `nameIsArray` and falls to each ladder's default, and
   `f64[16][]` passes it and is routed into the ref-list machinery. Control: S0a's
   `nameIsFixedArray` predicate, an audit of `arrLeafNameOf`, `repKeyOf` and the mono pins, and a
   probe pass of every list operation on both spellings.
10. **One heavy function can switch the host step off for a whole module** while its growth
   bound is module-wide (§6.2). Control: a per-function bound before S1.
11. **The unified model may be one concept too many for newcomers** (`T[]`, `T[N]`, `u8[]`,
   `Buf`). §5.18's table is the test; the panel's newcomer read it (§11).

---

## 10. Owner questions and stated defaults

### 10.1 Questions, in dependency order (one per turn at question time)

**Q1. Is `T[N]` an immutable value whose element assignment replaces the whole value?**
This overrides `collections-design.md` §VL.6/§OQ.2 for this one type.

```vl
let a: f64[4] = [0.0; 4]
let b = a
b[0] = 1.0
print(a[0])
const xs: f64[] = [0.0];    xs[0] = 1.0     // a list: legal, as today
const m: f64[4] = [0.0; 4]; m[0] = 1.0      // a value: refused, as `m = …` is
```

* (a) **Value, update by rewrite**: prints `0`. `b[0] = 1.0` means `b = b.with(0, 1.0)` (`with`
  is notation, not a name); the `const` line is refused, so `const` on a list and on a `T[N]`
  read differently, which is the most visible consequence; `f()[0] = 1.0` is not a place.
* (b) **Fixed-length reference** (§VL.7's representation made nameable): prints `1`, and the
  allocation is removed only where an optimiser proves no alias (option B, declined on
  2026-10-04).
* (c) **Value without element assignment**: `b[0] = 1.0` is refused; an update builds a new
  value (a literal, or a std function that would need its own review).

*Recommend (a).* (b) is SP-036's complaint; (c) makes every matrix routine (`m4Invert`,
`jittered`) a chain of rebuilds, which the rewrite in (a) produces anyway.

**Q2. How are the type and its fill spelled?** The fill follows the type's bracket family.

```vl
let m: f64[16] = [0.0; 16]        // (a) the T[] suffix family + Rust's fill; f64[3][4] is four f64[3]
let m: [f64; 16] = [0.0; 16]      // (b) Rust both ways; [[f64; 3]; 4]
let m: [16 of f64] = [16 of 0.0]  // (c) Swift 6.2 both ways; [4 of [3 of f64]]
```

*Recommend (a)*: one bracket family for types (`f64[16][]` is a list of matrices), D's spelling,
and the syntax is free (A13). Its cost is the inside-out nesting order, the reverse of C
(`f64[3][4]` is four rows of three), and a fill borrowed from a different family; (b) and (c)
make the order explicit and pair the fill with the type, at the cost of a second bracket
grammar.

**Q3. Which element types are in v1?**

```vl
f64[16]  u8[4]  boolean[8]  f64[4][4]      // (a), (c)
V3[4]                                      // (a) only: V3 = { x: f64, y: f64, z: f64 }
const v = a[0]; v.x = 1.0                  // a: V3[4] → a unchanged;  a: V3[] → a changed
```

* (a) (c) plus numeric records stored by field, copied in and out, so a record held in a `T[N]`
  behaves as a value and one held in a list as a reference.
* (c) Numbers, `u8`, `boolean` and nested arrays. A value-tier `u8[4]` is four masked `i32`
  locals (or one packed `i32`): a `u8` held as a local, which the u8 ruling's "illegal as a
  local or parameter" did not foresee; the storage still enforces 0..255.

*Recommend (c)* for v1, with records as a later question once the aliasing split above has been
seen in use. References (strings, lists) are additive under either answer.

**Q4. Are dead element writes and discarded `T[N]` results errors or lint warnings?**

```vl
function m4MulInto(r: f64[16], a: f64[16], b: f64[16]): f64[16] { r[0] = a[0] * b[0]; r }
m4MulInto(viewProj, proj, view)    // result discarded: viewProj never changes
for m in g { m[0] = 9.0 }          // m is a copy, never read
```

* (a) **Check errors** for exactly these two shapes on `T[N]` (the porting hazards), as §5.14
  proposes.
* (b) **One general `unused-assignment` lint and one `discarded-value` lint**, at warning tier
  with fixes, for every type: `s = 5` never read and `r = {…}` never read warn too.
* (c) Neither.

*Recommend (a)* for the two `T[N]` shapes: each refused program computes nothing observable,
and a port from list code is otherwise a silent wrong result. The panel's purist argues (b)
(§11): a dead store is not a design violation, and `print(r[0])` silences the error while the
port stays wrong. Census today's dead stores before choosing (b) at error tier.

**Q5. Is "no heap" a property of the type at every optimisation level, or of `-O` only?**

```vl
function m4Mul(a: f64[16], b: f64[16]): f64[16] { … }
for i in 0 until n { m = m4Mul(m, t) }    // allocates nothing at -O3; at -O0?
```

* (a) **`-O` only, through the host step** (§6.2, revision 3): the emitter boxes, the existing
  multi-value step scalarises; `-O0` allocates. Guaranteed at `-O` by fixtures asserting zero
  `array.new` in every value-tier position, and `vl build -O` warns by default for each function
  where a box survives.
* (b) **Every level, in the emitter** (revision 2's L1): the emitter emits N locals and
  multi-value itself, VL's first multi-slot representation (A15); `-O0` allocates nothing.
* (c) **Best effort at `-O`**: as (a) without the guarantee and the warning.

*Recommend (a)*: it reuses #3372 and keeps the emitter's one-value-one-slot invariant, and
sunpa builds `-O3` only. (b) is the cleaner contract and costs the A15 audit; it stays
available later, since placement is unobservable.

**Adjacent question (not this type, needed for exact `flat` erasure). May an ordinary record
hold a scalar `u8` field?** `flat type C = { r: u8, g: u8, b: u8, a: u8 }` is legal under the
owner's u8 ruling; flat's erasure rule (flat §4) needs the same declaration without `flat` to be
legal too. (a) yes, a packed `(mut i8)` field read as `i32`, the storage-backed argument the
ruling already makes; (b) no, and flat's erasure becomes "subtracts nothing except `u8`
fields". *Recommend (a)*; until ruled, `flat` admits `u8[N]` fields and not scalar `u8`.

### 10.2 Stated defaults (each follows from a ruling or from the model; say so to overturn)

| # | default | follows from |
| --- | --- | --- |
| D1 | N is a positive integer literal or a `const` bound to one; `T[0]` refused | the exact-const ruling |
| D2 | an exact-length literal in a `T[N]` position builds one; elements adapt as scalars | numeric rulings |
| D3 | a literal-only binding whose other uses are reads and deliveries adopts a `T[N]` destination; an element-written, aliased or captured one is refused with the annotate fix | record covariance, D3339, restricted so aliasing never changes (§5.2) |
| D4 | `as` both ways; length first, then each element under the same trio (`as%` wraps integers); `m as f64[]` infallible | the `as`-trio corollary, "a lossy conversion is a failure" |
| D5 | no implicit `T[N]` ↔ `T[]` conversion | A16, record covariance |
| D6 | `==` element-wise; `print` refused like lists; not a map key | A11 |
| D7 | `for` iterates the value at loop start | the model |
| D8 | `.length` is a constant `i32` | the model |
| D9 | dynamic index traps out of range; a constant out-of-range index is a check error at the source position | lists; Rust/Go/Zig |
| D10 | element generics yes; NO length generics; un-annotated parameters instantiate per length | the coordinator's recommendation; Go, C# |
| D11 | joins of different fixed types are unions; element-wise implicit conversion when exact | numeric-join ruling |
| D12 | closures capture by reference; an element write is an assignment | D2339 + the rewrite |
| D13 | `readonly T[N][]` refuses `g[0][3] = x` | the rewrite |
| D14 | no `inout`; return the value | the model |
| D16 | placement is the compiler's, per §4.3 | the owner's direction |
| D17 | `T[N]` in an entry-module export or an `extern function` signature is refused in v1, naming `as f64[]` or a `Buf` | its placement changes with `-O`, so no stable ABI exists (§8.6) |
| D18 | no std additions in v1; `[v; N]`, indexing, `==`, `for`, `as`, `.length` are built in. A bulk `storeF32s(b, at, m)` for GPU upload is DEFERRED, not rejected, and goes through `std-api-reviewer` when a consumer measures `put`; its `loadF32s` twin needs length generics or a builtin (§8.2) | the built-in-methods ruling (storage ops only) |
| D19 | `flat` fields of `T[N]`, including `u8[N]`; `Bone.m[k]` and `Bone.m.length` fold; little-endian, no padding; scalar `u8` fields wait for the adjacent question in §10.1 | the owner's direction, the u8 storage ruling, flat §4/§9 (§8.1) |
| D20 | `[...v3, 1.0]` builds a `T[4]`; call spread into fixed parameters is later | variadics |
| D21 | S0a ships to consumers only if it measures no worse than today at `-O3` on sunpa's `m4Mul`; otherwise with S1 | §6.7 |
| D23 | the unroll override drops the call veto for loops indexing a value-tier array | §6.1 |
| D24 | construction is the literal, `[v; N]` and element writes; a generator is later and additive | §5.3 |
| D25 | the size cap (64 slots) is silent placement plus the `fixed-array-boxed-update` hint, never a type error | Julia's and Rust's experience; §6.6 |
| D26 | each place subexpression is evaluated once, left to right; map-read places and un-narrowed union places are refused | §4.2 |

---

## 11. Panel dissent

(Filled after the panel review.)

---

## 12. Revision log

**Revision 3 (2026-10-04, lane FA2).** Rewritten as one model after the owner and coordinator
discussion: an immutable value with update-by-rewrite replaces revision 2's mutable value,
which removes revision 2's copy invariant, owned boxes, F5′'s place/value classification (now
the existing assignability rule) and the deep-copy requirement on record spread. Storage is
placement by position (inline fields, flattened lists, immutable shared boxes) instead of an
owned box for every storage position. The value tier reuses the #3372 host step instead of a
multi-slot emitter. Added: the survey with Swift `InlineArray`, Zig's aliasing, Valhalla,
Julia StaticArrays, OCaml, D; the inline-field, flattened-list and size-cap measurements;
interop with `flat`, `Buf`, GPU and SIMD; numeric-record and `u8` elements; build slices in
agent-days. 24 owner questions collapsed to 5, with 21 stated defaults.

**Revision 2 (2026-10-04, after critic 1).** Corrected revision 1's dead-code-eliminated
benchmark (40 ms "inlined" was three deleted rows); measured `br_table`, scratch memory and
heap boxes for dynamic indices; added the copy invariant and dead-write rules.

---

## Appendix: benchmark sources

All benchmarks were written in a scratch directory; nothing here is in the build. Wat was
assembled with `node_modules/.bin/wasm-as --enable-gc --enable-reference-types
--enable-multivalue --enable-bulk-memory`; VL rows were built by the master seed (`0502ce8f0`)
with `vl build x.vl -O3`. VL modules with no `print` import nothing, so both engines run them
directly.

**Revision 2's prototype** (`e_mvg`, `f_struct`, `g_brtable`, the Rust crate and the V8
harness) is unchanged; its generator is summarised here: `m4Mul` with the signature
`(param f64 × 32) (result f64 × 16)` whose body leaves the 16 sums on the stack; `bench`
carries 16 locals, loads `t` from 16 mutable globals, calls `m4Mul` and pops 16 results per
iteration, and returns `m[12] + m[13] + m[14] + m[15]`. `f_struct` is the same over one
immutable 16-f64 struct. Rust: `fn m4_mul(a: [f64; 16], b: [f64; 16]) -> [f64; 16]` with the
triple loop, `#[inline(never)]`, `opt-level = 3`, LTO, `t` behind `black_box`.

**§7.2 record field** (`gen2.py`): types `$R` = `(struct (mut i32) (mut f64) × 16)`, `$RB` =
`(struct (mut i32) (ref $A))` with `$A = (array (mut f64))`, `$RI` = the same with a mutable
field; the record lives in a mutable global re-read every iteration. W updates 16 elements with
constant indices; D does `pose[i & 15] += 1` and reads `pose[(i * 7) & 15]`. The inline D row
selects the field with a 16-arm `br_table` for the write and another for the read. The rebuild
rows use `array.new_fixed $A 16` (W) and `array.new` + `array.copy` + `array.set` (D), then
`struct.set`. The VL rows are:

```vl
import { filled } from "std:array"
type R = { count: i32, pose: f64[] }
let g: R = { count: 0, pose: filled(16, 0.0) }
export function bench(n: i32): f64 {
  g = { count: 0, pose: filled(16, 0.0) }
  let s = 0.0
  for i in 0 until n {
    const r = g
    const j = i & 15
    r.pose[j] = r.pose[j] + 1.0          // W: for k in 0 until 16 { r.pose[k] = r.pose[k] * 0.999 + x }
    s = s + r.pose[(i * 7) & 15]
  }
  let t = s
  for k in 0 until 16 { t = t + g.pose[k] }
  t
}
```

**§7.3 lists** (`gen2.py`, `gen4.py`): the VL rows build 1,024 identity matrices either as one
`f64[]` of 16,384 (pushed) or as `f64[][]`; the stream kernel is `g[b + k] = g[b + k] * 0.999
+ x` (flat) or `m[k] = m[k] * 0.999 + x` with `const m = g[j]` (nested); the bone kernels read
16 elements into `const a0 … a15`, write the 16 products with `t` read once per call into
`t0 … t15`, and the allocating row is revision 2's `b_filled` `m4Mul` storing into `g[j]`. The
raw rows are one `(array (mut f64))` of 16·L against `(array (mut (ref null $A)))` of L rows of
16, with the same 16 updates per matrix, L = 1,024 (1,000 passes) and 65,536 (16 passes).

**§7.4 cap** (`gen3.py`): `dl_N` holds N `f64` locals and per iteration selects the read with
an N-arm `br_table` into `$v`, then writes `$v + 1` through another; `db_N` does the same with
`array.get`/`array.set` on one `(array (mut f64))`. `cm_N` calls `$sum` with N `f64`
parameters (an add chain) from N locals, updating one local per iteration so nothing is
hoisted; `cb_N` passes one array reference and the callee reads N constant indices.

**Survey sources** checked on 2026-10-04: Swift SE-0453/SE-0483 and the `InlineArray`
`Sequence` discussion (forums.swift.org, "SE-0483: InlineArray Type Sugar"; Hacking with Swift,
"What's new in Swift 6.2"); Zig's hidden pass-by-reference (github.com/ziglang/zig issues
5973, 12251, 22906); JEP 401 and the null-restricted types draft (openjdk.org/jeps/401,
openjdk.org/jeps/8316779); StaticArrays.jl's 100-element rule of thumb (its README and
JuliaArrays/StaticArrays.jl issue 506).
