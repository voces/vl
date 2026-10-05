# Fixed-length value arrays (`f64[16]`)

**Status: DESIGN, not built. IMPLEMENTATION HOLD (owner): no build starts until sunpa's own
measurements are in and the owner has ruled on §8.** The owner chose direction A on 2026-10-04,
for sunpa SP-036's asks 2 and 3: VL gets a fixed-length array type that behaves like a value, on
the model of Rust's `[f64; 16]`, for small math aggregates (4x4 matrices, vectors and
quaternions written as arrays). Optimiser-only scalar replacement (B) and patterns-only guidance
(C) were not chosen. The direction's words were "returned via multi-value or out-param". Q7
asks which.

This doc proposes the semantics, sketches the lowering, prices it, and gives prototype numbers
for the lowering. §8 is the question list. Critic agents interrogate the doc before question
time, so every assumption is numbered in §2, and each one says whether it was measured.

Contents: §0 summary · §1 motivation and sunpa's real usage · §2 assumptions · §3 survey ·
§4 decisions · §5 lowering sketch and cost · §6 prototype evidence · §7 alternatives
considered · §8 open questions for the owner · §9 revision log · Appendix: prototype sources.

---

## 0. Summary

| decision | recommendation (§4 has the options) |
| --- | --- |
| F1 value or reference | **value**: `b = a` copies, and a callee's writes to its parameter are never seen by the caller |
| F2 type spelling | **`f64[16]`**, the existing `T[]` suffix with a length (a literal or a named `const`); `f64[4][]` is a list of `f64[4]` |
| F3 literal syntax | a list literal of exactly N elements in a `T[N]` position, plus **`[v; N]`** for the fill |
| F4 element types | numeric scalars, `boolean` and nested fixed arrays in v1 |
| F5 `const` | `const a: f64[16]` refuses `a[i] = v` (a value that is constant) |
| F5′ dead writes | an element write to a value that is never read again is an **error**: `f()[0] = …`, a write to a parameter, loop variable or `let` copy that is not read afterwards |
| F6 non-constant index | allowed, traps out of bounds like a list, and lowers to a **`br_table` over the locals**: no allocation, about 1–2 ns per access. A constant out-of-bounds index (literal or `const` only) is a check error |
| F7 storage and the copy invariant | locals, parameters and results hold N scalars. A field, global, map value, list element or shared capture cell holds an **owned box** that nothing else can reach. **Every delivery into a box allocates a fresh box or copies into the destination's own box**, unless the source is provably dead. Allocation-free holds for the locals representation only |
| F8 conversion | the `as` operator both ways: `m as f64[]` (infallible, a fresh list) and the trio `xs as! f64[16]` / `as?` / `as` |
| F9 generics | `T` may be generic (`T[16]`). Length polymorphism comes through un-annotated parameters, keyed per (element, length), which is new. No const-generic syntax in v1 |
| F10 size | no limit in the language. **Per-signature** flattening budget (at most 16 slots per array, at most 64 parameter slots and 16 result slots per function type) and a hint at the 17-slot cliff |
| F11 equality and printing | `==` elementwise like lists. `print` and holes refuse it, like lists and records |
| F12 iteration | `for x in m` iterates the value `m` held when the loop began (a copy only when the body writes `m`) |
| F13 closure capture | the existing by-reference rule (D2339). An element write counts as an assignment |
| F14 lowering route | the compiler emits N locals, N parameters and multi-value results itself, at every rung. This is VL's first representation that spans several wasm values |
| F15 numeric and literal rulings | literals adapt elementwise. A literal-only binding adopts a fixed-array destination, as the record rulings and D3339 do. A conflicting use is an error naming both uses |
| F16 std | none. `.length` (a constant), indexing, `==`, `for`, `as` and `[v; N]` are built in |

**Prototype result (§6), corrected in revision 2.** On V8 (Deno 2.9.6), hand-written wasm for the
proposed lowering of sunpa's `m4Mul` runs 10^6 products in 82–95 ms. Rust `[f64; 16]` takes
89–94 ms, the 16-field struct 87–93 ms with 124 scavenges, `filled` `f64[]` 105–111 ms, and
`push` `f64[]` 127–129 ms. On wasmtime 47 (`vl run`, which the gates use) the proposed lowering
takes 85–89 ms. Rust under wasmtime 49 takes 86–89 ms, and the struct 125 ms, `filled` 201 ms
and `push` 238 ms. The proposed lowering allocates nothing. **The win is Rust parity plus zero
garbage.** It is not the 2x speed-up revision 1 claimed: that figure came from a benchmark whose
result read one row of the matrix, and both LLVM and V8 deleted the other three (§9).

---

## 1. Motivation, and what sunpa actually writes

**SP-027** (`~/sunpa/docs/vl-issues.md`): every `f64[]` vector op allocates, about 15x the
scalar code. The procedural animation toolkit (`src/pose.vl`, `src/ik.vl`, `src/legs.vl`) is
quaternion, vector and 4x4 matrix math throughout. **SP-036**: a `f64[]` 4x4 matrix is a heap
object per call. sunpa measured, on their box, 163 ms as written, 115 ms with `filled(16, 0.0)`
and indexed stores, and 97 ms for Rust `[f64; 16]` `#[inline(never)]`. That was 1,768 scavenges
over their runs. `cameraFrame` alone leaves about 32 KB a frame, and at 240 Hz each 0.5–1 ms
scavenge is a visible hitch. Their asks, in order: (1) reserve `push` capacity, done as D3623;
(2) a fixed-size value type kept in locals or inline in records, with no heap and no bounds
checks past the static size; (3) scalar replacement for a fresh returned array, if (2) is far off.

**The vector and quaternion half is already served by records.** `pose.vl` moved `V3` and `Q`
to records ("they fold into locals"), and D3625's multi-value step returns records of up to
eight fields with no allocation. What records cannot express is the **matrix half**:

* it has 16 elements (past `MV_RECORD_MAX_FIELDS = 8`);
* it is written with **computed indices** in loops (`a[k * 4 + r]`, `o[c * 4 + k] = …`);
* it lives in **lists** (`g: f64[][]`, one matrix per bone; `cascades: f64[][]`);
* the same helper serves different lengths (`put(b: Buf, at: i32, vs: f64[])` takes 3-, 4- and
  16-element arrays);
* it is written **through a parameter** (the `…Into(r, a, b)` reuse pattern in `view.vl`,
  `mulLocalInto(a, p, o, out)` in `pose.vl`), which is how sunpa avoids allocation today.

Usage census over `~/sunpa/src` (read only, 22,284 lines). `f64[]` appears in 31 lines of
`view.vl`, 27 of `pose.vl`, 23 of `legs.vl` and 70 of `anim.vl`. Matrix-shaped uses in
`view.vl`/`pose.vl`:

| shape | example | what the design must do with it |
| --- | --- | --- |
| return a fresh matrix | `m4()`, `perspective`, `ortho`, `lookAt`, `m4Invert`, `compose`, `invertRigid` | multi-value result (F14) |
| 4x4 product in loops | `m4MulInto`, `mul` | constant indices after unrolling (F6, F12) |
| write into a caller's matrix | `m4MulInto(r, a, b)`, `mulLocalInto(a, p, o, out)`, `jittered(o, m)` | out-parameters (F5′, Q7) |
| list of matrices | `g: f64[][]`, `cascades: f64[][]`, `cascadePlanesKept: f64[][]` | `f64[16][]` storage (F7) |
| matrix inside a record | `Skeleton.root: f64[]` | owned box field (F7) |
| module-level matrix | `viewProj`, `lightViewProj`, `sunDir: f64[]` | global storage (F7) |
| length-generic reader | `put(b, at, vs: f64[])` over 3, 4 and 16 | un-annotated parameter (F9) or `as f64[]` (F8) |
| read a window of a longer list | `mul(a, b, ob)` reads `b[ob + …]`; `compose(p, o)` reads a pose STRIDE | stays `f64[]`; the fixed array is the result, not the window |

The last row matters. sunpa's pose is a flat `f64[]` with STRIDE 10 per bone. That is a
structure-of-arrays layout, and a fixed array does not replace it. It replaces the 16-number
products computed from it.

---

## 2. Assumptions (critics: attack these first)

Each assumption is marked **[measured]** (a program was run, quoted), **[read]** (taken from
source or a doc and not run), or **[unverified]**.

* **A1 [read]. WasmGC cannot hold an aggregate inline.** A struct field or an array element is
  one scalar or one reference. "Inline in a struct" therefore means N fields, and "inline in an
  array" means a stride over a flat scalar array (`memory-gc-design.md`'s ceiling table).
* **A2 [measured]. Wasm locals cannot be indexed dynamically**, and a `br_table` switch over
  them costs about 1–2 ns per access with no allocation (§6, rows `pk_*` and `g_brtable`).
* **A3 [read + measured]. The existing unroller is the constant-index machine.**
  `emitRangeUnrolled` fully unrolls a range loop with constant ends of 1–16 trips and at most
  640 AST nodes, and reads the loop variable as a constant in each copy. It **declines** in five
  cases (DECISIONS.md, "Small constant range loops are unrolled"): more than 16 trips or 640
  nodes; the body writes the loop variable; the body holds a function (per-iteration capture);
  the body makes a call that is not an inline memory intrinsic; or a step would wrap. Measured:
  in both of today's `f64[]` builds of `m4Mul`, one of the three loops stayed rolled.
* **A4 [read]. Records, lists and maps stay reference types.** Nothing here changes them.
* **A5 [read]. Two sections of `docs/guide/collections-design.md` are overridden, not
  extended.** §VL.6 (out of scope) and §OQ.2 hold that value-versus-reference is a
  **language-wide** call ("there is no sound case for collections being value types while
  objects stay reference"). F1 answers that a small fixed array of scalars is a numeric
  aggregate (A15), but adopting F1 is an **owner override of §VL.6/§OQ.2** for this one type, not
  an inference from them. §VL.7's committed surface ("`T[]` + inference, no user-facing fixed
  array") is overridden too. Its inferred header-less representation of `T[]` stays a separate
  optimisation and must not share a name with this type. If this design lands, both sections
  get a pointer here.
* **A6 [measured]. Length polymorphism through un-annotated parameters is only half there
  today.** `function g(vs) { vs.length }` runs for `[1.0, 2.0]` and `[1, 2, 3]` (prints 2 and
  3), and an index loop over `vs.length` runs. **But `for v in vs` over an un-annotated
  parameter is refused** ("for-in expects an array, a map or a string, got _"). Instances are
  keyed per ELEMENT type, never per length, since `T[]` carries no length. F9 needs both fixed.
* **A7 [read]. Module exports other than the entry module's are whole-program merged**, not
  wasm exports. Only an entry-module `export` reaches the wasm export section.
* **A8 [measured]. Both engines cap a function type at 1,000 parameters and 1,000 results.**
  V8: "param count of 1001 exceeds internal limit of 1000". wasmtime 49: "function params size
  is out of bounds". The same holds for results. 63 `f64[16]` parameters flattened would be an
  invalid module, so F10's budget is per signature.
* **A9 [measured]. `as` is numeric-only today**: `[1.0, 2.0] as f64[]` refuses with "`as`
  supports numeric conversions only". F8 extends it.
* **A10 [read]. Closures capture variables by reference** (DECISIONS.md, D2339), with a
  copy-into-the-closure fast path for bindings never assigned after capture.
* **A11 [measured]. Printing and equality.** `print` and template holes accept only scalars and
  strings. `[1.0, 2.0] == [1.0, 2.0]` and record `==` print `true` (structural), and a record
  with a list field compares structurally too. `[n] == [n]` with `n = 0.0 / 0.0` prints `false`
  (IEEE elementwise).
* **A12 [measured]. Today's paths share references, and a fixed array must not inherit that.**
  Each of these prints the write made through the other name: `let r = s.root; r[0] = 7.0`
  writes `s.root`; `for m in g { m[0] = 9.0 }` writes `g`; `const h = [...g]; h[0][0] = 9.0`
  writes `g`; `id<T>(a)` returns `a` itself; pushing a narrowed nullable twice stores one list
  twice. `f()[0] = 2.0` compiles (for a list it is meaningful). Parameters are assignable, and a
  `const` list is element-writable (`const xs = [1, 2]; xs[0] = 5` prints 5).
* **A13 [measured]. `[v; N]` and `T[N]` are free syntax**: `[0.0; 16]` is a parse error today
  (the list parser skips the `;` and then wants a `,`), and `let a: f64[16] = []` is a parse
  error ("expected `]` but found `16`").
* **A14 [measured]. The prototype's lowering is hand-written** (§6), not emitted by a compiler
  that implements this design. It is the code F14 commits to emitting.
* **A15 [read]. This is VL's first representation of one value as several wasm values.**
  `F32x4` is one `v128`, and every other VL value is one scalar or one reference. Every place
  in the emitter that assumes one value is one stack slot (expression statements' `drop`,
  `select`, `local.tee`, block result types, call argument counts, globals) is affected. That
  is the build's main architectural cost (§5).
* **A16 [measured]. Containers never widen today.** `const b: f64[] = a` with `a: i32[]`, and
  an `if` joining `f64[]` with `f32[]`, are both refused ("a container never widens
  implicitly … it would be a copy, and a write through either list would not reach the other").
  Only `readonly T[]` is covariant.
* **A17 [measured]. A constant index out of range after unrolling is a run-time trap today,
  not a check error.** `a[k]` over `for k in 0 until 3` on a 2-element list traps at run time.
* **A18 [read, unverified end to end]. The host's multi-value step tolerates multi-result
  functions.** `multivalue.rs` models a call's results by count under wasmparser's validator
  (`results_pushed = rs.len()`). Its own twins are already multi-result functions that chains
  call, and it treats only one-result reference-returning functions as producers. A
  compiler-emitted multi-value function should therefore pass through untouched. This was not
  run, because no compiler emits one yet. S1's fixtures must push a multi-value module through
  `-O` and `-O3`, through the escape step as well.
* **A19 [read]. sunpa SP-032's record spread is ruled**, and `{ ...rec, m }` must deep-copy a
  fixed-array field. It does not parse today (measured: "expected a field name but found
  `...`").

---

## 3. Survey

| language | type | copy on assign / pass | index check | length generics | storage | conversion to a slice |
| --- | --- | --- | --- | --- | --- | --- |
| Rust | `[T; N]` | value. `Copy` if `T: Copy`, else moved | panic at run time; a constant out-of-bounds index is a deny-by-default lint | const generics `const N: usize` (1.51) | inline in structs, `Vec`, stack | `&a` coerces to `&[T]`; `<[T; N]>::try_from(slice)` fails on a length mismatch |
| C | `T a[N]` | **not assignable**; decays to a pointer when passed (no copy); copied inside a struct | none (undefined behaviour) | none (macros) | inline | decay is implicit |
| C++ | `std::array<T, N>` | value (aggregate) | `[]` unchecked, `.at()` throws | non-type template parameter | inline | `std::span` |
| Zig | `[N]T` | value, copied | safety-checked panic; a comptime-known out-of-bounds index is a compile error | `comptime N: usize` parameters | inline | `&a` coerces to `[]T` / `*[N]T` |
| Go | `[N]T` | **value**, copied on assignment and when passed; `range` over an array iterates a copy | panic; a constant out-of-bounds index is a compile error | **none**: generics cannot range over N | inline | `a[:]` makes a slice that **aliases** the array |
| Swift | no fixed array until **`InlineArray<let count: Int, Element>`** (SE-0453, Swift 6.2), with `[N of T]` sugar (SE-0483). Before that, tuples. `inout` parameters are copy-in, copy-out | value, eagerly copied (no copy-on-write) | trap | integer generic parameters (SE-0452) | inline | `span` |
| C# | `fixed double b[16]` (unsafe structs, primitives only); C# 12 `[InlineArray(16)] struct`; `ref`/`out` parameters | value (struct) | checked through `Span<T>` | none | inline in the struct | implicit `Span<T>` |
| AssemblyScript | `StaticArray<T>` | **reference** | trap | none (`length` runtime) | heap, no backing-buffer indirection | copy |
| GLSL | `float a[16]`, `vec3`, `mat4`; `out`/`inout` parameters (copy-out) | value, copied | arrays: undefined or clamped; ES 1.00 restricts dynamic indexing | none | inline | none |
| WGSL | `array<f32, 16>`, `vec3<f32>`, `mat4x4<f32>` | value | no trap: an out-of-bounds dynamic access reads some in-bounds value or zero; a constant out-of-bounds index is a creation error | none (pipeline-overridable sizes only) | inline | none |

Survey facts are from each language's reference as I know it **[unverified]**. The Swift
proposal numbers and WGSL's out-of-bounds wording were not re-checked against a toolchain.

**What the survey says for VL.**

1. **Every language whose fixed array is fast makes it a value** (Rust, C++, Zig, Go, Swift's
   `InlineArray`, C#, GLSL, WGSL). The one reference-typed design, AssemblyScript's
   `StaticArray`, is a heap object, which is SP-036's complaint.
2. **Value-array languages answer "out-parameter" with a parameter MODE**, never with aliasing
   the value: Swift `inout`, C# `ref`/`out`, GLSL `out`/`inout`, Rust `&mut`. Q7 asks whether VL
   wants one.
3. **The length is part of the type everywhere.** Length generics split: Rust, C++, Zig and
   Swift have them, while Go and C# shipped without and are usable.
4. **A constant out-of-bounds index is a compile error everywhere it can be** (Rust, Zig, Go,
   WGSL). A dynamic one traps everywhere except C and the shading languages.
5. **The conversion to a growable sequence either aliases (Go's `a[:]`, Rust's `&a`) or copies.**
   Aliasing needs borrowed references, which VL does not have, so VL's conversion copies (F8).

---

## 4. Decisions

Each decision gives its options with code, the analysis, and a recommendation. §8 repeats them
as one question each, ordered by dependency.

### F1. Value or reference semantics

```vl
let a: f64[16] = [0.0; 16]
let b = a
b[0] = 1.0
print(a[0])          // value: 0    reference: 1
```

* **(a) Value.** Assignment, passing, returning and storing all copy. An element write changes
  only the variable written. No other name can observe the array, so whether it lives in 16
  locals, 16 struct fields or a box is unobservable and may differ per position. That freedom
  is what F7 and F14 spend.
* **(b) Reference with a fixed length.** This is the header-less GC array that §VL.7 already
  plans to infer. Removing the allocation then needs escape analysis, which is option B, the
  one the owner declined.
* **(c) Immutable value.** No `a[i] = v`; the update is `a.with(i, v)`, as `std:simd`'s
  `withLane`. That is sound for free, but matrix code writes elements in loops (`m4Invert`,
  `jittered`, every `…Into`).

**Recommendation: (a).** This needs the owner to override `collections-design.md` §VL.6/§OQ.2
for this type (A5). The argument for the exception is that VL already has one value aggregate
(`F32x4`), and that this type is a numeric aggregate rather than a collection. The cost is
that every path that moves references today must copy (F7's copy invariant), and that the
`…Into` idiom needs a replacement (F5′, Q7).

### F2. Type spelling, nesting order, and how N is written

```vl
let m: f64[16] = …        // (a) suffix, the T[] family
let m: [f64; 16] = …      // (b) Rust
let m: Fixed<f64, 16> = … // (c) a generic name with a value argument
const SIZE = 16
let m: f64[SIZE] = …      // N as a named const
```

* **(a)** reads as a member of the existing `T[]` family: `f64[16][]` is a list of matrices, and
  sunpa's `g: f64[][]` becomes `g: f64[16][]`. In type position `[` followed by an integer is
  free (A13). `x as f64[16]` is a cast. Indexing a cast result needs parentheses, as it does today.
* **(b)** is a second bracket grammar beside `T[]`, and `[f64; 16][]` mixes the two.
* **(c)** needs const generics (roadmap A10, not built).

**Nesting order.** VL's `T[][]` composes from the inside out: `i32[][]` is a list of `i32[]`,
and `readonly T[][]` binds the outermost, last suffix. With (a), `f64[3][4]` is four `f64[3]`,
and `m[i][j]` has `i < 4`, `j < 3`. That is the reverse of C, Java and GLSL, and the same as
Rust's `[[f64; 3]; 4]`. C order would make `f64[16][]` mean "16 lists".

**N as a name.** `f64[SIZE]` and `[0.0; SIZE]` accept an identifier, which must resolve to a
module-level or enclosing `const` bound to an integer literal (or to a const-arithmetic
initialiser under the 2026-09-30 exact-const ruling). The parser accepts an integer literal or
an identifier inside the brackets, and the checker resolves the identifier to a positive
integer. Anything else (a `let`, a parameter, a call) is a check error naming the rule.

**Recommendation: (a), composing inside-out like `T[]`, with N a literal or a `const`.** The
hover and the out-of-range message name both lengths in index order (`m[i][j]: i < 4, j < 3`).

### F3. Literal syntax

```vl
const id: f64[16] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
let o: f64[16] = [0.0; 16]      // fill: value; length
let o = filled(16, 0.0)         // stays f64[] (a list): filled's length is a runtime i32
const r = [rand(); 4]           // rand() runs ONCE; the hint below fires
```

* A **list literal of exactly N elements in a `T[N]` position** is built as `T[N]`, the record
  covariance ruling's "a fresh literal adopts its destination". A literal of the wrong length is
  a check error naming both lengths.
* **Fill `[v; N]`** evaluates `v` once and copies it N times, as Rust does. For scalar elements
  that is unobservable unless `v` has an effect. A **lint hint** (`fill-evaluates-once`) fires
  when `v` contains a call, naming `[f(), f(), f(), f()]` or a loop as the spelling for N calls.
* `;` separates statements elsewhere, but inside `[` … `]` it is currently an error (A13), so
  there is no clash. The formatter keeps `[0.0; 16]` on one line and never re-spells it.

**Recommendation:** exact-length literals in `T[N]` positions, plus `[v; N]` with the hint.

### F4. Element types

```vl
f64[16]  f32[16]  i32[4]  i64[2]  boolean[8]   // (a) scalars
f64[4][4]                                       // nested
V3[4]   string[3]   (i32 | f64)[2]   u8[16]     // later, each additive
```

* **(a) Numeric scalars, `boolean` and nested fixed arrays.** Every element is a wasm value type.
* **(b) Any type.** Go and Swift allow it with shallow copies: `V3[4]` copies four references and
  the records stay shared. That is "value" in name only, and it multiplies the position matrix
  by every element representation.
* **`u8`** is storage-only (owner ruling 2026-08-22). As a value in i32 locals every write would
  truncate. That is coherent, but no consumer asks for it yet.

**Recommendation: (a) for v1.** Every refused element type gets a message naming the supported
set, graded one member per row before it ships (CLAUDE.md).

### F5. `const` fixed arrays

```vl
const m: f64[16] = [0.0; 16]
m[0] = 1.0                       // refused: m is a constant value
```

For a value, `const` means the value is fixed, as `const n = 3; n += 1` is refused. A `const`
list is element-writable (A12) because the binding, not the list, is constant. Under F1(a)
there is no separate object to be mutable. **Recommendation:** refuse, with a message that says
a fixed array is a value and to use `let`.

### F5′. Dead writes, and place versus value expressions

Revision 1 refused element writes to a parameter. That was too narrow (a parameter is only one
way to hold a copy) and too broad (a parameter edited and then read is a legitimate local
edit). It is replaced by a general rule.

**Place and value expressions.** A **place** names storage that outlives the expression:

* a binding (`m`), a field of any record-valued expression (`sk.root`, `f().root`: a record is
  a reference, so the field's storage is the record's);
* an element of a list-valued expression (`g[b]`: a list is a reference);
* an element of a fixed-array **place** (`m[i]`, `sk.root[i]`, `g[b][k]`).

Every other expression is a **value**: a call result (`f()`), an `if`/`match`/`??` result, a
literal, `as`, and an element of a fixed-array **value** (`f()[0]`). An assignment target must
be a place. The new rule is that **an element write whose root is a fixed-array value, not a
place, is a check error**:

```vl
f()[0] = 2.0                 // error: f() returns a fixed array, a value; nothing can read this write
(if c { a } else { b })[0] = 1.0   // error, the same
```

**Dead writes.** A write to a place whose root binding is a COPY that no later code reads is
almost always a port of a reference-list idiom:

```vl
function m4MulInto(r: f64[16], a: f64[16], b: f64[16]) { r[0] = a[0] * b[0] }   // r never read
for m in g { m[0] = 9.0 }                                        // g: f64[16][]; m is a copy
let r = s.root
r[0] = 7.0                                                       // s.root unchanged; r unread
```

**Rule:** an element write to a fixed-array binding that is a parameter, a `for` variable, or a
`let` whose initialiser is a place, and after which the binding is never read (a closure
capturing it counts as a read), is a **check error**: "this writes a copy of … that is never
read; write the original (`g[i][0] = …`), return the result, or …" (the last clause follows
Q7's answer). This is per-binding liveness inside one function, which the checker can compute.
Writes followed by reads are untouched, so a parameter used as a scratch copy is fine.

**Recommendation:** both rules as errors. Rationale: each refused program computes nothing
observable, and every refused shape compiles today with list semantics and does something
(A12), so a silent port is a wrong result rather than a slow one. A warning would let it through.

### F6. Non-constant indexing

```vl
function trace(m: f64[16]): f64 { m[0] + m[5] + m[10] + m[15] }       // constant: local.get
function col(m: f64[16], c: i32): f64 { m[c * 4] }                    // dynamic: br_table
for k in 0 until 4 { s = s + a[k * 4 + r] * b[c * 4 + k] }            // constant after unrolling
m[16]                                                                 // constant, out of range: check error
const K = 20
m[K]                                                                  // `const`: check error
for k in 0 until 20 { s += m[k] }                                     // run-time trap at k = 16, as lists
```

**Semantics (a).** Any `i32` index. Out of range traps, as `l[i]` does on a list. **"Constant",
for the check error, means a source integer literal or an identifier bound to a `const` integer
literal**, and nothing derived by the optimiser. The error is raised once, at the indexing
expression's source position, never per monomorphized instance or unrolled copy. A range
variable is not "constant" for the error, even when the loop unrolls. It traps at run time,
exactly as lists do today (A17), so the check never depends on an unroll budget. Clamping (as
WGSL does) and static-proof-only indexing (as SIMD's `Lane4`) are the rejected options.

**Lowering (revised).** Revision 1 moved any binding with a dynamic index to a heap box. That
brings **garbage** back (one allocation per binding per call: `pk_box` makes 124 scavenges per
10^6 calls), not only slowness, so it is withdrawn. Measured per dynamic read of a 16-f64 value
held in locals (§6):

| lowering | V8 ns per read | wasmtime ns per read | allocates |
| --- | --: | --: | --- |
| `br_table` over the locals | ~2.1 | ~1.0 | no |
| store 16 locals to a linear-memory scratch, then `f64.load` | ~2.6 | ~3.7 | no |
| build a heap box, `array.get` | ~6.7 | ~23.6 | **yes** |

**The `br_table` select is the lowering**, for reads and writes alike. Writes go through a
`br_table` to `local.set`. It never allocates and never changes the binding's representation,
so there is no cliff to garbage and nothing for the checker and the emitter to disagree about.
The linear-memory scratch was considered and declined. It needs a memory in modules that have
none, a fixed scratch address is unsafe under `--shared-memory` (two instances share it), and it
is slower than the switch on both engines. A loop that indexes densely with dynamic indices
pays about 2.3 ns per access: `g_brtable`, the triple loop with no unrolling, takes 229 ms
against 82 ms unrolled on V8. That is the price the unroller exists to remove.

**Unrolling: which vetoes F6/F12 override.** The unroller's five vetoes (A3), and the rule for a
loop that indexes a locals-held fixed array with its range variable:

| veto | override? | why |
| --- | --- | --- |
| over 16 trips or 640 nodes | **yes**, up to a separate cap (proposed 64 trips, 4,096 nodes, measured in S1) | budget, not semantics. sunpa's 4x4x4 nest is 64 inner bodies |
| the body writes the loop variable | no | the next trip steps from the written value |
| the body holds a function | no | per-iteration capture (D2339) would change |
| a call that is not an inline memory intrinsic | no | the run-once/hot heuristics (DECISIONS.md) |
| a step would wrap | no | the rolled loop never ends and must not start ending |

Every declined loop falls back to `br_table` indices: correct, allocation-free, and about 2 ns
slower per access.

**Two producers.** A `vl check` performance hint ("`m[c * 4]` is not constant: each access is a
switch") must agree with the emitter, so **one predicate decides both**: an index is "static" if
it is a literal, a `const`, or a range variable of a loop whose bounds are constants and that
none of the four semantic vetoes blocks, combined with `+ - *` over constants. The emitter
unrolls exactly the loops that predicate names (the budget override makes that total), and the
hint fires exactly where it says no. One function, called from both, so they cannot disagree.

**Recommendation:** semantics (a). The lowering is `br_table` for every non-static index, the
override table above, and one shared predicate.

### F7. Storage, and the copy invariant

```vl
type Skeleton = { count: i32, root: f64[16] }   // field
let g: f64[16][] = []                            // list of matrices
let byName: {[string]: f64[16]} = Map()          // map value
let viewProj: f64[16] = [0.0; 16]                // module global
sk.root[12] = 1.0                                // element write in place (sk is a reference)
const r = sk.root                                // whole read: a copy
sk.root = m4Mul(a, b)                            // whole write: copied into the existing box
```

**Representations.**

| position | representation |
| --- | --- |
| local, parameter, result (within F10's per-signature budget) | N wasm locals, parameters or results |
| `T[N] \| null` local | N locals plus an i32 present flag (so a map read does not allocate) |
| record field, map value, list element (v1), shared capture cell, union member, value past the budget | an **owned box**: one `(array mut T)` of exactly N |
| module global | N wasm globals within the budget; a box past it |
| list `T[N][]` (later) | flattened: one `(array mut T)` of N·len, stride N |

**The copy invariant.** *An owned box is reachable from exactly one slot. Every delivery INTO a
box-held destination either copies the source's elements into that destination's existing box,
or allocates a fresh box, unless the source is provably dead after the delivery (a fresh
literal, a call result, or the last use of a local).* Today's paths that move a reference
instead, all of which must copy when the element type is a fixed array:

| path | today, for a list element | must become |
| --- | --- | --- |
| list spread `[...g]`, `slice`, `concat`, `filter`, `sorted`, `reverse`, `map(x => x)` | shallow: shares inner lists (measured for spread) | one box per element copied (flattened lists: one `array.copy`) |
| narrowing a nullable (`if n != null { g.push(n) }`) | keeps the reference (measured: two pushes share one list) | the push copies |
| generic pins (`id<T>`, `first<T>`, `dup<T>` at a box-held `T`) | returns the same reference (measured) | the instance copies at the box boundary |
| record spread `{ ...rec, m }` (SP-032, ruled) | not parsed yet (A19) | deep-copies fixed fields |
| `??` / `if` / `match` yielding a value past the budget | passes the reference | allocates a box, unless the operand is dead |
| a parameter past the budget, passed as a box | the callee could BORROW the caller's box | **copy on pass**, unless the callee provably cannot observe a write to the source while it runs |
| `for m in g` (box-held elements) | `m` is the element | `m` reads the element's values into locals (no allocation within the budget) |

The borrowed-parameter row is the subtle one. With a box-held `big: f64[64]` captured by a
closure that writes it, a callee that borrowed the caller's box would see the write:

```vl
let big: f64[64] = [0.0; 64]
const poke = () => { big[0] = 1.0 }
function f(x: f64[64], k: () => void): f64 { k(); x[0] }   // must print 0: x is a copy
print(f(big, poke))
```

So a box-held parameter is copied on pass. Borrowing is an optimisation for later that needs a
no-write proof (no capture of the source is written, and nothing the callee calls can reach
it).

**What "allocation-free" covers.** Zero garbage holds **only for values held in locals**:
locals, parameters and results within the budget, and the `T[N] | null` flag form. Storage
positions allocate:

| operation | allocations |
| --- | --- |
| create a record with a fixed field | +1 box per fixed field, once |
| `sk.root = m` (overwrite) | 0: copied into the existing box |
| `g.push(m)` (boxed elements, v1) | +1 box per push (0 once lists are flattened) |
| `byName.set(k, m)` on a new key / an existing key | +1 / 0 |
| `byName[k]` read | 0: copied into N locals plus a flag |
| `[...g]` | +1 box per element (v1) |
| a box-held value past the budget passed, returned or joined | +1 per copy |

sunpa's per-frame code (products, inverses, projections) lives in locals and allocates
nothing. Its per-bone list `g` allocates once per bone at creation in v1, and once per list
when flattened.

**Grading requirement.** Every position-matrix template for this type carries an **aliasing
proof** in both directions: write through the destination and read the source, then write the
source and read the destination, each printing a value that shows the two are independent.
"Runs" without that proof does not grade a copy.

**Recommendation:** the representations and the invariant above. Inline record fields (N struct
fields) and flattened lists are later representation changes, which value semantics allow
without any program noticing.

### F8. Conversion to and from `T[]`

```vl
const xs: f64[] = m as f64[]            // (a) out: infallible, a fresh list
const xs2: f64[] = m.toList()           // (b) out: a built-in method
const m2: f64[16] = xs as! f64[16]      // in: trap on a length mismatch
const m3 = xs as? f64[16]               // in: f64[16] | null
put(buf, 0, m)                          // put(…, vs: f64[]): refused; the message names both fixes
```

* **Out.** Implicit conversion is refused, like every container widening today (A16). It would
  allocate silently and, into a mutable `T[]`, change aliasing silently. The record covariance
  ruling refused copy-on-delivery for that reason. For the explicit form, the owner's corollary
  "when a proposed name is an operator the language already has, spelled as a function, the
  answer is the operator" favours **`m as f64[]`**. It is infallible: bare `as` never yields
  null here because nothing can fail. `toList()` is the function spelling the corollary argues
  against.
* **In.** A length mismatch is a failure, and VL's failure operator for a conversion that may
  not hold is the `as` trio (owner ruling, 2026-09-02). Bare `as` propagates null out of the
  enclosing function, as the numeric trio does.
* Both directions extend `as` beyond numerics for the first time (A9).

**Recommendation:** `as` both ways, with no `toList`. The refusal at a `T[]` delivery names
`m as f64[]` and the un-annotated-parameter alternative (F9).

### F9. Generics

```vl
function trace<T>(m: T[16]): T { m[0] + m[5] + m[10] + m[15] }   // generic element: yes
function put(b: Buf, at: i32, vs) {                              // length via inference
  for i in 0 until vs.length { storeF32(b, (at + i) * 4, vs[i] as f32) }
}
function sum<const N>(vs: f64[N]): f64 { … }                     // const generics: later (A10)
```

* **(a) No length polymorphism.** Every `T[N]` has a literal N, which is Go's position.
* **(b) Length polymorphism through un-annotated parameters.** This is **not free today** (A6).
  `for v in vs` over an un-annotated parameter is refused, and instances are keyed per element
  type only. Building (b) means: (1) the for-in hole fixed for un-annotated parameters; (2)
  **instances keyed per (element type, length)**, with `.length` a constant and `for` unrolled
  in each. The price is one instance per distinct length per function, so sunpa's `put` over 3,
  4 and 16 becomes three instances. Code size grows linearly in distinct lengths, and the
  mono grid (`scripts/mono-tyaram-grid.sh`) needs a length axis.
* **The instantiation-time refusal gap.** An un-annotated body that is legal for `f64[]` and
  not for `f64[16]` (`vs.push(x)`, `vs = []`) is discovered only when an instance with a fixed
  array is made. The refusal must name the instance and the call that made it ("`put` called
  with `f64[16]` at view.vl:955: `push` on a fixed array"), and the checker must raise it at the
  CALL, not lose it at a monomorphization pin. CLAUDE.md records eleven check rejects that were
  lost exactly that way.
* **(c) Const generics** (roadmap A10, not built). They are the general answer, to be designed
  for `Decimal<10, 8>` too.

**Recommendation: generic element types plus (b) in v1**, priced as above, with (c) left to A10.

### F10. Size: a per-signature budget, not a type limit

```vl
let m: f64[16]          // 16 locals
let big: f64[1024]      // a box; `=` is an array.copy
function f(a: f64[16], b: f64[16], c: f64[16], d: f64[16], e: f64[16]): f64[16]   // 80 parameter slots
```

* **No limit in the language** (Rust, Go, Zig, Swift); N ≥ 1. `T[0]` has no use and would add a
  zero-length case to every lowering.
* **Per value:** an array of at most **16 scalar slots** is held in locals. Past that it is
  boxed everywhere, so `f64[17]` is a box. A `vl check` **hint at the declaration** names the
  17-slot cliff ("`f64[17]` is past 16 slots and lives on the heap: copies allocate").
* **Per signature** (A8: 1,000 parameters is a hard engine limit). A function TYPE flattens its
  fixed-array parameters left to right while the running total stays at or under **64 parameter
  slots**. The rest pass as boxes, copied on pass (F7). Its result flattens if it fits in **16
  result slots**, and is returned as a box otherwise. The budget is a function of the TYPE
  alone, never of the body, so a closure value, a `call_ref` site and a direct call of the same
  type agree on one wasm function type. Generic instances compute it per instance type.
* All three constants are lowering constants, measured and recorded in DECISIONS.md like the
  unroll budget, and are not part of the type system.

**Recommendation:** as above.

### F10′. The entry-module export ABI

```vl
export function viewProjection(): f64[16] { … }       // in the entry module: a wasm export
```

An ABI chosen for a host is permanent. Options: (a) **refused in v1** at entry-module export
signatures, with a message naming `as f64[]` or a `Buf`; (b) always flattened (N numbers in,
an Array of N out in JavaScript, which is asymmetric and breaks past 1,000); (c) always a boxed
`(array f64)`, symmetric and stable, which JavaScript can read through the GC JS API.
**Recommendation: (a)** until a consumer asks. sunpa's host reads linear memory.

### F11. Equality and printing

```vl
a == b                 // elementwise ==, like lists and records (A11)
print(m)               // refused, like lists and records
```

Elementwise `==` with each element's own `==` (`NaN != NaN`, `-0.0 == 0.0`) matches lists
(measured, A11). Printing and holes are refused with the list message plus a hint naming
`m[i]`. Aggregate printing is a separate ruling for all aggregates. There is no hashing in v1,
so a fixed array cannot be a map key.

### F12. Iteration

```vl
for x in m { s += x }                                  // value per element
for x, i in m { if i < 15 { m[i + 1] = 0.0 }; s += x } // iterates the ORIGINAL values
```

Within the budget, `m` is held in locals and the loop has N trips, so it is unrolled (F6's
override). Past the budget it stays a loop over the box. **The loop iterates the value `m` held
when it began** (Go's rule for a range over an array). A `T[]` leaves mutation during iteration
unspecified. This is the one place value semantics show in a loop.

**The snapshot is not free.** If the body can write `m` (directly, or through a closure that
captured it), the loop must iterate a copy:

| `m` held in | body does not write `m` | body writes `m` |
| --- | --- | --- |
| locals (within the budget, unrolled) | 0 | up to N extra locals, read before the first write (register pressure, no allocation) |
| a box (a field `for x in sk.root`, or past the budget) | 0 | **one allocation per loop entry** (an N-element copy) |

The compiler proves "does not write" by the same per-function write scan F5′ uses, and a call
the body makes that might reach `m` (through a captured box, or a record field that a callee can
write) counts as a write.

**Recommendation:** the snapshot rule, documented with the cost table.

### F13. Closure capture

```vl
let m: f64[16] = [0.0; 16]
const f = () => m[0]
m[0] = 1.0
print(f())     // 1: captured by reference (D2339)
```

D2339's rule applies unchanged, with an element write counting as an assignment. A captured
array never assigned after capture is copied into the environment (N fields within the budget,
else a box). One assigned after capture lives in a shared box both scopes index, which is the
one owned box with two readers, and is sound because both readers are the same variable.

### F14. How it lowers

| position | proposed (L1: the compiler emits it) | alternative (L2: immutable struct, then the `-O` steps) |
| --- | --- | --- |
| local | N wasm locals; a constant index is `local.get`/`local.set`; a dynamic one is a `br_table` | an immutable struct; a write makes a new one; Heap2Local melts what it can |
| parameter, result | N parameters, N multi-value results (F10's budget) | one struct reference; D3625's step twins it if the bound allows |
| `if`/`match` value | N result locals written in each arm | a struct |
| field, list, map, global | §F7 | struct references |

* **L1** gives "no heap" at every rung, `-O0` included, as a property of the type. It is **VL's
  first value spanning several wasm values** (A15), and it needs multi-result function types in
  the compiler's emitter, which emits none today.
* **L2** reuses D3625's step and Heap2Local, but its "no allocation" is an optimiser outcome,
  bounded at 8 fields today. That is option B. Measured (§6): the struct form keeps 124
  scavenges per 10^6 products after `wasm-opt -O3`, and on wasmtime 47 it takes 125 ms against
  L1's 89 ms.
* The host step must tolerate L1's modules (A18, to be fixture-tested in S1).

**Recommendation: L1.**

### F15. Interaction with the numeric-join and literal rulings

```vl
const v: f64[3] = [1, 2, 3]       // literals adapt: [1.0, 2.0, 3.0]
const w: f64[3] = [i, y, z]       // i: i32, y: f64. Each element converts if exact: i32 → f64 ok
const q: f64[2] = [n64, y]        // n64: i64. Refused: i64 → f64 is not exact; the message names `as`
const p = [1.0, 2.0, 3.0]
takesFixed(p)                     // p holds only a literal: adopts f64[3] (see below)
const s = { root: [1.0, 2.0] }
const t: { root: f64[2] } = s     // s holds only literals: adopts { root: f64[2] } (D3339)
const u = [1.0, 2.0]
u.push(3.0)
takesFixed2(u)                    // conflict: a growing use and a fixed delivery. Error naming both
```

* **Literals adapt** elementwise (owner, 2026-09-30).
* **Runtime numerics** converge per element by the union-delivery rule: exact for every member
  or refused with an `as` fix.
* **Literal-only bindings adopt the destination.** Revision 1 refused `takesFixed(p)` and asked
  for an annotation. That contradicted three rulings at once: the record covariance ruling (a
  binding holding only a literal adopts its destination), **D3339** (owner ruling (A): such a
  binding adopts the destination fully, and every read sees it, even when that changes a
  field's width), and the numeric-join ruling's "no required annotations". The consistent rule:
  a `let` or `const` whose initialiser is only literals (a list literal, or a record literal
  whose fields are) and whose uses include a delivery to a fixed-array type **adopts that type**
  at the declaration. Every use then sees the fixed array. A use that the fixed type cannot
  serve (a `push`, a delivery to `T[]` or to a different length) is a **check error naming both
  uses**, the "conflicting uses" clause of the literal-binding ruling (B′).
* **No per-use typing for `const` aggregates.** Revision 1 stretched ruling C (a literal `const`
  is typed per use) to arrays. For a `const` list that is unsound: a `const` list is
  element-writable and shared (A12), so building it separately at each use would split one list
  into several. Ruling C is about scalars, and a `const` aggregate follows the adoption rule
  above instead.

### F16. std additions

None. The surface is built in: `.length` (a constant), indexing, `==`, `for`, `as` and `[v; N]`.
A `std:mat` is a large speculative surface with no deprecation story. `map`/`fold` over `T[N]`
wait for const generics (A10). Any later std export goes through `std-api-reviewer`.

### F17. Joins, element conversion, `is`, and `as` over elements

```vl
const r = if c { a16f64 } else { a16f32 }  // f64[16] | f32[16]? refused?
const r2 = if c { a3 } else { a4 }         // f64[3] | f64[4]?
const w: f64[2] = i2                       // i2: i32[2]. Implicit elementwise i32 → f64?
if x is f64[16] { … }                      // x: f64[16] | null, or a union
const m = xs as! i32[4]                    // xs: f64[]. Converts elements too, or length only?
```

* **Joins of different fixed types.** Lists refuse such joins because a join would copy (A16).
  A fixed array IS copied, so that objection does not apply. The numeric-join ruling joins
  runtime values of different numeric types as a union. The consistent answer is a **union**,
  `f64[16] | f32[16]` (boxed members, F7), discriminated with `is`. The alternative is refusing
  like lists. Recommendation: union.
* **Elementwise implicit conversion.** A scalar `i32` delivered to `f64` converts when exact. For
  a value array the same rule per element is sound (no aliasing to break), so `i32[2]` → `f64[2]`
  converts implicitly, and `i64[2]` → `f64[2]` is refused with an `as` fix. The alternative is
  explicit only, like lists. Recommendation: implicit when every element's conversion is exact.
* **`is`** discriminates union members, as today. `x is f64[16]` is legal where `x`'s type has
  that member. There is no run-time length test on a `T[]` (`xs is f64[16]` with `xs: f64[]` is
  refused, and `as?` is the test). Recommendation: as stated.
* **`as` over elements.** (a) `xs as! f64[16]` checks the LENGTH only, and the element types must
  already match. (b) It also converts each element with the numeric trio's rule (exact or fail;
  float targets round). (c) Plus `as%` for a wrapping element conversion. Recommendation: (a)
  in v1, with (b) additive later.

### F18. `readonly` over fixed arrays

```vl
function draw(g: readonly f64[16][]) {
  g[0][3] = 1.0      // refused: an element of a value element IS the list's storage
  const m = g[0]     // fine: a copy
}
```

`readonly f64[][]` allows `g[0][3] = 1.0`, because the inner list is a separate object.
`readonly f64[16][]` must refuse it: the fixed element is stored IN the list, so writing into it
writes the list. The same holds for a record: `sk.root[0] = 1.0` is a write to `sk`, and any
future read-only record view (record covariance ruling, option C) must refuse it.

---

## 5. Lowering sketch and cost

**Layers that change.**

| layer | change | risk |
| --- | --- | --- |
| `compiler/parser.vl` | `T[N]` / `T[SIZE]` in the type suffix loop (`parseTypeAtom`'s `[` arm accepts only `]` today); `[v; N]` in the list-literal parser; AST carries N | `vl fmt` must print both and never re-spell them |
| `compiler/typecheck.vl` | a new type kind; assignability (exact N; elementwise exact conversion F17); index typing and the literal/`const` out-of-range error (F6); literal adoption and conflicts (F15); the `as` extensions (F8, F17); `const`, value-root and dead-write errors (F5, F5′); place/value classification; `==`; `for` and its write scan (F12); capture (F13); `readonly` (F18); unions of fixed types and `is` (F17); the export refusal (F10′) | **`is TyArray` appears 345 times in 7 files** (`typecheck.vl` 236, `emit_classify.vl` 65, `emit_mono.vl` 23). A new kind trips `kind-ladder-incomplete` at every closed ladder, which is the safe failure. Folding the length into `TyArray` would let each of the 345 sites treat a fixed array as a list without saying so. For scale, `TyMap` has 179 |
| canon / interner | the length joins the type identity | rep-fuzz gate mandatory |
| `compiler/emit_rep.vl`, `emit_classify.vl` | the multi-slot locals representation (A15), the owned box, the nullable flag form, per-signature budgets (F10) | arena and canon are two producers: both must agree on the representation |
| `compiler/wasmEmit.vl`, `emit_bytes.vl` | N-slot locals; constant index to `local.get`; `br_table` select and store; multi-result function types; N-parameter calls and `call_ref`; result locals for `if`/`match`; every copy of F7's invariant; the shared static-index predicate and the unroll override (F6); the F12 snapshot | **A15: every one-value-one-slot assumption** (expression `drop`, `select`, `tee`, block types, globals). Multi-value is new to this emitter |
| `compiler/emit_mono.vl` | instances keyed per (element, length); un-annotated `for` (A6) | mono grid gains a length axis |
| host | none expected; fixtures for A18 | the multi-value and escape steps over L1 modules |
| LSP | hover, diagnostics, hints | the ci.yml editor suites |
| tests | a `capability-probes/matrix/*.matrix.vl` template per representation (locals, box, flag), all 26 positions in both faces, **each with the two-way aliasing proof (F7)**, plus a generic-element twin and a length-generic twin | the main grading instrument |

**Build order** (CLAUDE.md: build the lowering, wire every delivery, then narrow the gate):

1. **S1: locals, parameters and results.** Constant and `br_table` indices, the unroll override
   and its shared predicate, literals and fill, `==`, `for` with the snapshot, F5/F5′,
   multi-result types, the per-signature budget, and A18's host fixtures. sunpa's `m4Mul`,
   `m4Invert`, `perspective`, `lookAt` and `compose` port here. Every other position is refused
   with a capability message until its slice lands.
2. **S2: owned-box storage and the copy invariant.** Fields, globals, map values (flag form on
   read), boxed list elements, every row of F7's copy table, captures, unions and `is`. `g`,
   `Skeleton.root` and `viewProj` port here.
3. **S3: conversions and adoption.** `as` both ways, elementwise conversion, and F15's adoption.
4. **S4: length-keyed monomorphization** (F9(b)) and the un-annotated `for`.
5. **S5: flattened lists**, a representation change.

**Rough size** (agent lane time): S1 about 1.5 weeks (A15's audit is the bulk), S2 about 1.5
weeks (the copy table's seven paths are each a fixture family), S3 2–3 days, S4 3–4 days, S5 3–5
days. **About five to six weeks in total**, up from revision 1's three to four, because the copy
invariant, the dead-write rule and the per-signature budget were unpriced there. Seed size moves
by the emitter code only, since the compiler uses no fixed arrays.

**Risks, ranked.**

1. **The copy invariant (F7).** Every path that moves a reference today is a place an alias can
   leak. The two-way aliasing proof in every template is the control.
2. **A15's audit.** A missed one-value-one-slot assumption is check-clean invalid wasm.
3. **The position matrix.** Two-plus representations times 26 positions times two faces.
   Refuse per position until wired, then narrow.
4. **Instantiation-time refusals (F9).** A refusal lost at a monomorphization pin is the
   documented failure shape.
5. **Unroll compile time and code size.** A 64-trip override across many matrix functions
   grows modules. The cap is measured in S1, and `vl_scaling_shape_test.ts` needs a row.
6. **Dense dynamic indexing** stays about 2.3 ns per access slower than unrolled. That is
   correct, but it is a perf surprise without the hint.

---

## 6. Prototype evidence

**What was measured.** sunpa SP-036's benchmark: `m = m4Mul(m, t)` 10^6 times. **Revision 2
changed the result** from `m[12]` to `m[12] + m[13] + m[14] + m[15]`, one element from each row.
Row r of a product depends only on row r of the left operand, so `m[12]` alone kept one row
live, and LLVM and V8 deleted the other three in the inlined kernels (§9). Every variant prints
`285.2842828502802` for n = 1000, which the harness asserts.

**V8**: Deno 2.9.6, each variant in its own process, 3 warm-up calls of 10^5, then 7 timed calls
of 10^6, 3 interleaved rounds, min-of-mins and median-of-medians. **wasmtime 47**: `vl run
x.wasm` (the gates' engine) with the program's start function calling `bench(10^6)`, minus the
same module with `bench(0)`, 5 rounds. **wasmtime 49**: the CLI's `--invoke`, minus n = 0, 5
rounds. Everything ran under `nice -n 19` on a shared 24-core box at load 3–9. VL rows used
master `221c7954f`'s seed and host at `-O3`. Rust: 1.x stable, `wasm32-wasip1`,
`opt-level=3`, LTO, with `t` behind `black_box`. Sources are in the appendix.

| row | what it is | V8 ms (default) | V8 ms (`--no-wasm-inlining`) | V8 scavenges per 10^6 | wasmtime 47 ms (`vl run`) | GC collections (wasmtime 47) |
| --- | --- | --: | --: | --: | --: | --: |
| a_push | VL `f64[]`, `push` (SP-036) | 129 / 150 | 127 / 146 | 174 | 238 / 252 | 1 |
| b_filled | VL `f64[]`, `filled` + stores (`view.vl`) | 111 / 123 | 105 / 116 | 149 | 201 / 211 | 1 |
| c_rec16 | VL 16-field record (over D3625's bound) | 91 / 108 | 88 / 91 | 124 | 129 / 135 | 1 |
| f_struct | wasm: immutable 16-f64 struct parameter and result (L2 at a call) | 93 / 105 | 89 / 104 | 124 | 125 / 134 | 1 |
| f_struct_O3 | the same after `wasm-opt -O3` (inlined; the loop-carried merge stays) | 87 / 117 | 89 / 96 | 124 | — | — |
| **e_mv** | **wasm: 32 f64 parameters, 16 results, 16 loop-carried locals (L1)** | 95 / 107 | 95 / 101 | **0** | — | — |
| **e_mvg** | **e_mv with `t` in mutable globals (no constant folding)** | 88 / 107 | 94 / 101 | **0** | **89 / 92** | **0** |
| e_mvg_O3 | e_mvg after `wasm-opt -O3` (single caller inlined) | 83 / 91 | 82 / 93 | 0 | 85 / 88 | 0 |
| d_scalar | VL source scalarized by hand (the compiler's output) | 81 / 91 | 87 / 99 | 0 | 86 / 90 | 0 |
| rust | `[f64; 16]` by value, `#[inline(never)]` | 94 / 103 | 93 / 101 | 0 | (49 CLI) 89 / 93 | — |
| rust_inl | `[f64; 16]`, `#[inline(always)]` | 90 / 106 | 89 / 100 | 0 | (49 CLI) 86 / 88 | — |
| g_brtable | L1's locals, loops NOT unrolled: 64 `br_table` reads per product | 229 / 279 | 238 / 309 | 0 | 240 / 250 | 0 |

On the wasmtime 49 CLI the wasm rows read e_mv 94, e_mvg 90, e_mvg_O3 88 and f_struct 94
(min). wasmtime 47's `VL_GC_STATS` reports one collection for each heap row, so collections
are a coarse instrument there. The time gap is the signal.

**F6's dynamic-read prototypes** (`pk_*`: 10^6 iterations, each one dynamic read of a 16-f64
value held in locals, plus the same 16-local update in every row; min ms):

| row | V8 default | V8 no-inline | wasmtime 49 | V8 scavenges | ns per read over `pk_const` (V8 / wasmtime) |
| --- | --: | --: | --: | --: | --: |
| pk_const (index 0, the floor) | 1.7 | 4.1 | 3.7 | 0 | — |
| pk_br (`br_table` over the 16 parameters) | 3.8 | 4.7 | 4.7 | 0 | 2.1 / 1.0 |
| pk_mem (16 stores to a scratch, one `f64.load`) | 4.3 | 6.7 | 7.4 | 0 | 2.6 / 3.7 |
| pk_box (`array.new_fixed` 16, `array.get`) | 8.4 | 11.6 | 27.3 | 124 | 6.7 / 23.6 |

**Findings.**

1. **The proposed lowering is at Rust parity on both engines.** V8: L1 82–95 ms against Rust
   89–94 (called or inlined; the two regimes now agree, because nothing is dead). wasmtime: 85–89
   ms (wasmtime 47) against Rust 86–89 (wasmtime 49).
2. **It removes the garbage**: 0 scavenges against 124–174. That is the half of SP-036 that
   hurts at 240 Hz.
3. **Against the struct, the speed gain is engine-dependent.** On V8 a 16-f64 struct across a
   call is about as fast (87–93 ms) and differs only in garbage. On wasmtime 47 the struct is
   1.4x slower (125 against 89). Against today's `f64[]` spellings, L1 is 1.2–1.6x faster on V8
   and 2.3–2.7x on wasmtime.
4. **Unrolling is still load-bearing**, at about 2.3 ns per dynamic access (`g_brtable`). But a
   single dynamic read costs 1–2 ns through `br_table`, without allocating, which is why F6 now
   uses it instead of the box.
5. **The multi-value bound in `multivalue.rs` is not a speed bound at 16 f64.** L1's 16-result
   call ties the struct call on V8 and beats it on wasmtime 47.
6. **VL already emits the target code from scalar source** (d_scalar: 81–87 ms on V8, 86 on
   wasmtime 47, 0 allocations). The work is getting from `a[k * 4 + r]` to that shape.

**Caveats.** The wasm rows are hand-written (A14). The box was shared and loaded, so only gaps
over about 10% are claimed. The owned-box storage positions (F7) were not prototyped; their
access cost is assumed to be `b_filled`'s. The host steps were not run over an L1 module (A18).

---

## 7. Alternatives considered

* **Raise `MV_RECORD_MAX_FIELDS` to 16 and use a 16-field record.** It helps records at a call
  boundary (finding 5), but a record has no computed index, no loop and no `T[16][]` list, so
  sunpa's matrix code cannot be written with it. Worth its own row for records regardless.
* **Option B, optimiser-only** scalar replacement of a fresh `f64[]`. The owner chose A, and
  measurement agrees: even a fully visible heap value (f_struct_O3) keeps its allocation through
  a loop-carried merge.
* **SIMD (`F32x4`).** It covers f32 4x4 math as four `v128` columns, but not f64. It is
  complementary: an `f32[16]` could later lower to four `v128` locals.
* **Tuples.** Held by the multi-value ruling (2026-09-29). A homogeneous fixed array is not a
  tuple and does not reopen it.

---

## 8. Open questions for the owner

Ordered by dependency: Q1 decides what every later answer means. Each question is one
decision, with a code sample per option and a recommendation. One question per turn at
question time.

**Q1 (F1). Does `b = a` copy?** This overrides `collections-design.md` §VL.6/§OQ.2 for this type.
* (a) Value: `let b = a; b[0] = 1.0` leaves `a[0]` unchanged.
* (b) Reference: `b[0] = 1.0` changes `a[0]`, and the allocation is removed only where an optimiser proves no alias.
* (c) Immutable value: `a[0] = 1.0` is refused, and `a.with(0, 1.0)` makes a new value.

*Recommend (a).*

**Q2 (F2). Spelling and nesting order?**
* (a) `f64[16]`; `f64[3][4]` is four `f64[3]`; `f64[16][]` is a list of matrices.
* (b) `[f64; 16]`; `[[f64; 3]; 4]`.
* (c) `Fixed<f64, 16>`.

*Recommend (a).*

**Q3 (F2). May N be a named constant?**
* (a) `const SIZE = 16; let m: f64[SIZE]` (literal-bound `const` only).
* (b) Literals only: `f64[16]`.

*Recommend (a).*

**Q4 (F3). How is a value written?**
* (a) An exact-length literal in a typed position, plus `[0.0; 16]` (with a hint when the fill calls a function).
* (b) The literal only.

*Recommend (a).*

**Q5 (F4). Element types in v1?**
* (a) Scalars, `boolean` and nested fixed arrays.
* (b) Any type, with shallow copies (`V3[4]` copies four references).

*Recommend (a).*

**Q6 (F5). Is a `const` fixed array element-writable?**
* (a) No: `const m: f64[16] = …; m[0] = 1.0` is refused.
* (b) Yes, like a `const` list.

*Recommend (a).*

**Q7 (out-parameters). How does a function fill a caller's matrix?** The direction said "multi-value or out-param".
* (a) Return only: `sk.root = m4Mul(a, b)` copies 16 values into the existing box, with no allocation and no out-parameter.
* (b) An `inout` parameter mode, copy-in copy-out (Swift, GLSL): `function m4MulInto(inout r: f64[16], a, b) { … }` called as `m4MulInto(&r, a, b)`, lowered as an extra multi-value result written back.
* (c) Pass a record that holds the array: `function m4MulInto(h: { m: f64[16] }, a, b) { h.m[0] = … }` (works under F7 with no new feature).

*Recommend (a) plus (c) in v1, with (b) as a later additive mode if a consumer needs it.* Under
(a), every sunpa `…Into` call site has a return-based spelling that allocates nothing.

**Q8 (F5′). Dead writes and value roots?**
* (a) Errors: `f()[0] = 2.0`, `for m in g { m[0] = 9.0 }`, and `let r = s.root; r[0] = 7.0` with `r` unread.
* (b) Warnings (lint tier) for the same three.
* (c) Neither: they compile and do nothing.

*Recommend (a).*

**Q9 (F6). What does a non-constant index do?**
* (a) Legal, traps out of range; `m[16]` and `m[K]` (a `const`) are check errors; it lowers to a `br_table`, with no allocation.
* (b) Only constants, constant-bound range variables and literal-union indices; `col(m, c)` is refused.
* (c) Clamp, as WGSL.

*Recommend (a).*

**Q10 (F7). Storage and the copy invariant?**
* (a) Owned boxes for fields, map values, list elements and captures; every delivery copies unless the source is dead (`[...g]` allocates one box per element in v1).
* (b) Inline record fields from v1 (16 struct fields; dynamic field indices are a `br_table`).
* (c) Flattened lists from v1 (`f64[16][]` as one stride-16 array).

*Recommend (a)*, with (b) and (c) as later representation changes.

**Q11 (F8). How does it convert to and from `T[]`?**
* (a) `m as f64[]` out (infallible); `xs as! f64[16]` / `as? f64[16]` / `as f64[16]` in.
* (b) `m.toList()` out; the `as` trio in.
* (c) Implicit out into `readonly f64[]` (a hidden copy).

*Recommend (a).* It extends `as` beyond numerics for the first time.

**Q12 (F17). Is `i32[2]` → `f64[2]` implicit?**
* (a) Yes, when every element converts exactly (`i64[2]` → `f64[2]` is refused with an `as` fix).
* (b) No: `xs.map(…)` or `as`, like lists.

*Recommend (a).*

**Q13 (F17). What does `if c { a16f64 } else { a16f32 }` produce?**
* (a) The union `f64[16] | f32[16]`, discriminated with `is`.
* (b) A check error, like lists.

*Recommend (a)*, consistent with the numeric-join ruling.

**Q14 (F17). Does `as` convert elements?**
* (a) Length only: `xs as! f64[16]` needs `xs: f64[]`.
* (b) Elements too, by the numeric trio: `[1.5] as! i32[1]` traps.

*Recommend (a) in v1.*

**Q15 (F9). Can code be generic over the length?**
* (a) Through un-annotated parameters, keyed per (element, length), after the for-in hole is fixed: `function put(b: Buf, at: i32, vs) { … }`.
* (b) Const generics now: `function put<const N>(…, vs: f64[N])`.
* (c) No length polymorphism.

*Recommend (a)*, with (b) designed with roadmap A10.

**Q16 (F10). Is the size budget per signature?**
* (a) Yes: at most 16 slots per array in locals; at most 64 parameter slots and 16 result slots per function type, the rest boxed; a hint at `f64[17]`.
* (b) A hard cap on N in the type: `f64[17]` is a check error.

*Recommend (a).*

**Q17 (F10′). May an entry-module export take or return a fixed array?**
* (a) Not in v1: `export function f(): f64[16]` is refused, naming `as f64[]` or a `Buf`.
* (b) Flattened: N numbers in, a JavaScript Array out.
* (c) A boxed `(array f64)` both ways.

*Recommend (a).*

**Q18 (F11). Equality and printing?**
* (a) `a == b` elementwise; `print(m)` refused, like lists.
* (b) Also add printing for fixed arrays only.

*Recommend (a).*

**Q19 (F12). Does `for x in m` iterate a snapshot?**
* (a) Yes: `for x, i in m { if i < 15 { m[i + 1] = 0.0 }; s += x }` sums the original values. It costs extra locals in locals, and one allocation per loop entry for a box-held `m` whose body writes it.
* (b) Unspecified, like lists.

*Recommend (a).*

**Q20 (F13). Does an element write count as an assignment for capture?**
* (a) Yes: `const f = () => m[0]; m[0] = 1.0; f()` is 1.0.
* (b) No: captures copy, and `f()` is 0.0.

*Recommend (a).*

**Q21 (F14). Who removes the heap: the compiler (L1) or the `-O` steps (L2)?**
* (a) L1: N locals and multi-value emitted at every rung.
* (b) L2: an immutable struct that the optimiser melts when it can.

*Recommend (a).*

**Q22 (F15). Does a literal-only binding adopt a fixed-array destination?**
* (a) Yes, like records and D3339: `const p = [1.0, 2.0, 3.0]; takesFixed(p)` makes `p: f64[3]`; `p.push(4.0)` elsewhere is then an error naming both uses.
* (b) No: an annotation is required.

*Recommend (a)*, which is what the rulings already imply.

**Q23 (F18). Does `readonly` over a list of fixed arrays forbid element writes?**
* (a) Yes: with `g: readonly f64[16][]`, `g[0][3] = 1.0` is refused.
* (b) No, as for `readonly f64[][]`.

*Recommend (a)*: the element is the list's storage.

**Q24 (F16). Any std module?**
* (a) None.
* (b) A `std:mat` with `mat4Mul`, `identity` and friends.

*Recommend (a).*

---

## 9. Revision log

**Revision 2 (2026-10-04, after critic 1).**

* **Measurement corrected.** Revision 1's "40–44 ms inlined, 2x faster than a call" was dead-code
  elimination: the benchmark returned `m[12]`, row 0 depends only on row 0, and LLVM (16 of 64
  multiplies kept) and V8 dropped three rows. With a result reading every row, the inlined and
  called forms agree (82–95 ms on V8) and Rust is 89–94. The wasmtime 47 rows were added, and
  they show the same parity.
* F5's parameter refusal was replaced by F5′'s place/value and dead-write rules.
* Out-parameters became their own question (Q7).
* F6: the box fallback was withdrawn (garbage); `br_table` was measured and adopted; the
  scratch-memory option was measured and declined; the unroll-veto table was added; "constant"
  was defined as a literal or `const` at the source position; the two-producers rule (one
  predicate) was added.
* F7: the copy invariant, the seven reference-moving paths, the borrowed-parameter example, the
  allocation price table, the nullable flag form for map reads, and the aliasing proof in
  templates were added.
* F9 / A6 corrected (for-in over an un-annotated parameter is refused today; length-keyed
  instances are new) and the instantiation-time refusal gap stated.
* F10 made per signature (A8 measured on both engines), the 17-slot hint added, and the export
  ABI split out (F10′).
* F12's snapshot cost stated. F15 made consistent with D3339 and the record rulings, and the
  `const` per-use bullet dropped. F17 (joins, elementwise conversion, `is`, `as` over elements)
  and F18 (`readonly`) added.
* A5 now names the §VL.6/§OQ.2 override and the correct path; A15 (first multi-slot
  representation), A16–A19 added; each assumption marked measured, read or unverified.
* The status line records the implementation hold.

---

## Appendix: prototype sources

All were written in a scratch directory and run with `nice -n 19`; nothing here is in the
build. Assemble wat with `node_modules/.bin/wasm-as --enable-gc --enable-reference-types
--enable-multivalue x.wat -o x.wasm` (`wasm-opt … -O3` for the `_O3` rows); build the VL rows
with `vl build x.vl -O3 -o x.wasm`.

**VL rows.** `a_push.vl` is SP-036's program with the result changed to `m[12] + m[13] + m[14] +
m[15]` and `print(bench(1000))` appended. `b_filled.vl` is `view.vl`'s
`m4MulInto(filled(16, 0.0), a, b)` with the same `bench`. `c_rec16.vl` and `d_scalar.vl` are
generated. For wasmtime 47, each module's start prints `bench(1000000)` or `bench(0)`, and
`vl run x.wasm` runs the prebuilt module.

**Generator** (`gen.py`, abridged; `I` is the identity, `T` is SP-036's `t`):

```python
I = [1.0,0,0,0, 0,1.0,0,0, 0,0,1.0,0, 0,0,0,1.0]
T = [0.999,0.01,0.0,0.0,-0.01,0.999,0.0,0.0,0.0,0.0,1.0,0.0,0.1,0.2,0.3,1.0]
def fl(x): return repr(float(x))
# o[c*4+r] = sum_k a[k*4+r] * b[c*4+k]; every bench returns m12 + m13 + m14 + m15 (one per row)

def mv_module():   # e_mv.wat: the proposed L1 ABI
  w = "(module\n (type $mv (func " + "(param f64) "*32 + "(result " + "f64 "*16 + ")))\n"
  w += " (func $m4Mul (type $mv)\n"
  for c in range(4):
    for r in range(4):
      terms = [f"(f64.mul (local.get {k*4+r}) (local.get {16+c*4+k}))" for k in range(4)]
      e = terms[0]
      for t in terms[1:]: e = f"(f64.add {e} {t})"
      w += "  " + e + "\n"            # the 16 results, left on the stack in order
  w += " )\n"
  w += " (func (export \"bench\") (param $n i32) (result f64)\n  (local $i i32)\n"
  w += "".join(f"  (local $m{i} f64)\n" for i in range(16))
  w += "".join(f"  (local.set $m{i} (f64.const {fl(I[i])}))\n" for i in range(16))
  w += "  (block $done (loop $top\n   (br_if $done (i32.ge_s (local.get $i) (local.get $n)))\n"
  w += "   (call $m4Mul " + " ".join(f"(local.get $m{i})" for i in range(16)) + " " \
       + " ".join(f"(f64.const {fl(T[i])})" for i in range(16)) + ")\n"
  w += "".join(f"   (local.set $m{i})\n" for i in reversed(range(16)))   # pop 16 results
  w += "   (local.set $i (i32.add (local.get $i) (i32.const 1)))\n   (br $top)))\n"
  w += "  (f64.add (f64.add (f64.add (local.get $m12) (local.get $m13)) (local.get $m14)) (local.get $m15)))\n)\n"
  return w
# e_mvg.wat: mv_module() with `t` in 16 `(mut f64)` globals, an exported `poke` that writes one
#   (so none is constant), and the call reading 16 locals loaded from them before the loop.
# f_struct.wat: (type $M (struct (field f64) x16)); m4Mul (ref $M) (ref $M) -> (ref $M) is one
#   struct.new of the same 16 sums over struct.get; bench carries one (ref $M) local.
# g_brtable.wat: m4Mul with e_mv's signature but SP-036's three loops kept; every a[k*4+r] and
#   b[c*4+k] read and o[c*4+r] write is a br_table over 16 blocks selecting the local.
# pk_{const,br,mem,box}.wat: $pick (16 f64, i32) -> f64 returning param 0 / a br_table select /
#   16 f64.store to address 0 then f64.load at idx*8 / array.get of array.new_fixed 16. bench
#   carries 16 locals (from mutable globals), adds pick(m…, (i*7)&15) to s, and updates every
#   local by s*1e-12 each iteration.
```

**Rust** (`cargo build --release --target wasm32-wasip1`, `crate-type = ["cdylib"]`,
`opt-level = 3`, `lto = true`, `panic = "abort"`):

```rust
#[inline(never)]
fn m4_mul(a: [f64; 16], b: [f64; 16]) -> [f64; 16] {
    let mut o = [0.0f64; 16];
    for c in 0..4 { for r in 0..4 {
        let mut s = 0.0;
        for k in 0..4 { s = s + a[k * 4 + r] * b[c * 4 + k]; }
        o[c * 4 + r] = s;
    } }
    o
}
// m4_mul_inl: the same body, #[inline(always)].
const I: [f64; 16] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
const T: [f64; 16] = [0.999, 0.01, 0.0, 0.0, -0.01, 0.999, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.1, 0.2, 0.3, 1.0];
#[no_mangle]
pub extern "C" fn bench(n: i32) -> f64 {
    let mut m = I;
    let t = core::hint::black_box(T);
    for _ in 0..n { m = m4_mul(m, t); }
    m[12] + m[13] + m[14] + m[15]
}
// bench_inl: the same over m4_mul_inl.
```

**V8 harness** (`deno run -A [--v8-flags=--no-wasm-inlining] bench.ts x.wasm bench 1000000 7`;
every import is stubbed):

```ts
const [file, exp = "bench", nArg = "1000000", runsArg = "9"] = Deno.args;
const mod = new WebAssembly.Module(await Deno.readFile(file));
const imports: Record<string, Record<string, unknown>> = {};
for (const im of WebAssembly.Module.imports(mod)) {
  imports[im.module] ??= {};
  if (im.kind === "function") imports[im.module][im.name] = () => 0;
  else if (im.kind === "memory") imports[im.module][im.name] = new WebAssembly.Memory({ initial: 1 });
}
const inst = new WebAssembly.Instance(mod, imports as WebAssembly.Imports);
const f = inst.exports[exp] as (n: number) => number;
const check = f(1000);                       // asserted == 285.2842828502802 by the driver
for (let w = 0; w < 3; w++) f(100000);
const ts: number[] = [];
for (let r = 0; r < Number(runsArg); r++) {
  const t0 = performance.now(); f(Number(nArg)); ts.push(performance.now() - t0);
}
ts.sort((a, b) => a - b);
console.log(JSON.stringify({ file, exp, check, min: ts[0], median: ts[ts.length >> 1] }));
```

Scavenges were counted with `--v8-flags=--trace-gc`, as the `Scavenge` lines printed between
two markers around one `bench(1000000)` call. wasmtime 47 collections come from `VL_GC_STATS=1`.
The engine limits (A8) came from one-function modules of 1,000 and 1,001 `f64` parameters or
results, compiled by `new WebAssembly.Module` and `wasmtime compile`.
