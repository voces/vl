# Fixed-length value arrays (`f64[16]`)

**Status: DESIGN, not built, waiting on owner rulings.** The owner chose direction A on
2026-10-04, for sunpa SP-036's asks 2 and 3: VL gets a fixed-length array type that behaves
like a value, on the model of Rust's `[f64; 16]`, for small math aggregates (4x4 matrices,
vectors and quaternions written as arrays). Optimiser-only scalar replacement (B) and
patterns-only guidance (C) were not chosen. This doc proposes the semantics, sketches the
lowering, prices it, and gives prototype numbers for the lowering. It ends with the questions
that need a ruling (§8). Critic agents interrogate it before anything is built, so every
assumption is numbered in §2. A claim that rests on one says which.

Contents: §0 summary · §1 motivation and sunpa's real usage · §2 assumptions · §3 survey ·
§4 decisions · §5 lowering sketch and cost · §6 prototype evidence · §7 alternatives
considered · §8 open questions for the owner · Appendix: prototype sources.

---

## 0. Summary

| decision | recommendation (§4 has the options) |
| --- | --- |
| F1 value or reference | **value**: `b = a` copies, and a callee's writes to its parameter are never seen by the caller |
| F2 type spelling | **`f64[16]`**, the existing `T[]` suffix with a length; `f64[4][]` is a list of `f64[4]` |
| F3 literal syntax | a list literal of exactly N elements in a `T[N]` position, plus **`[v; N]`** for the fill |
| F4 element types | numeric scalars, `boolean` and nested fixed arrays in v1. Records, strings and unions come later, additively |
| F5 `const` and parameter writes | `const a: f64[16]` refuses `a[i] = v`. A parameter refuses it too in v1 (lifting that later is additive) |
| F6 non-constant index | allowed, and it traps out of bounds like a list. A constant out-of-bounds index is a check error. Speed is guaranteed only for indices that are constant after unrolling |
| F7 storage | locals, parameters and results hold N scalars. A field, global, map value or capture cell holds an **owned box**, never aliased. A list element is boxed in v1 and flattened later |
| F8 conversion | explicit both ways: `a.toList()` makes a fresh `T[]`, and `xs as! f64[16]` (the `as` trio) goes back |
| F9 generics | `T` may be generic (`T[16]`). The length is polymorphic only through un-annotated parameters, which already monomorphize per call. No const-generic syntax in v1 |
| F10 size limit | no limit in the language. A lowering threshold of 16 scalar slots decides locals versus box |
| F11 equality and printing | `==` compares elementwise, like lists. `print` and template holes refuse it, like lists and records |
| F12 iteration | `for x in a` and `for x, i in a` are unrolled whenever the array is held in locals |
| F13 closure capture | the existing by-reference rule. An element write counts as an assignment |
| F14 lowering route | the compiler emits N locals, N parameters and multi-value results directly, at every rung, `-O0` included |
| F15 numeric rulings | literals adapt elementwise, and a runtime union element converts only when the conversion is exact |
| F16 std | no new std module. `.length` (a constant) and `toList` are built in |

**Prototype result (§6).** Hand-written wasm for the proposed lowering of sunpa's `m4Mul`
runs 10^6 products in **40–44 ms when the call is inlined** (Rust `[f64; 16]` inlined: 41–44 ms)
and **96–97 ms when the call is forced to stay a call** (Rust `#[inline(never)]`: 89–98 ms). It makes
**0 scavenges**, against 123–172 for every heap spelling. Today's `f64[]` spellings take
132–169 ms (`push`) and 108–125 ms (`filled`) on the same box. VL's own compiler already emits
the inlined speed (40–43 ms) from a hand-scalarized source, so this design is a way to write
array-shaped code that compiles to what the hand-scalarized source compiles to.

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
| write into a caller's matrix | `m4MulInto(r, a, b)`, `mulLocalInto(a, p, o, out)`, `jittered(o, m)` | value semantics change this, see F1 and F5 |
| list of matrices | `g: f64[][]`, `cascades: f64[][]`, `cascadePlanesKept: f64[][]` | `f64[16][]` storage (F7) |
| matrix inside a record | `Skeleton.root: f64[]` | owned box field (F7) |
| module-level matrix | `viewProj`, `lightViewProj`, `sunDir: f64[]` | global storage (F7) |
| length-generic reader | `put(b, at, vs: f64[])` over 3, 4 and 16 | un-annotated parameter (F9) or `toList` (F8) |
| read a window of a longer list | `mul(a, b, ob)` reads `b[ob + …]`; `compose(p, o)` reads a pose STRIDE | stays `f64[]`; the fixed array is the result, not the window |

The last row matters. sunpa's pose is a flat `f64[]` with STRIDE 10 per bone. That is a
structure-of-arrays layout, and a fixed array does not replace it. It replaces the 16-number
products computed from it.

---

## 2. Assumptions (critics: attack these first)

* **A1. WasmGC cannot hold an aggregate inline.** A struct field or an array element is one
  scalar or one reference. "Inline in a struct" therefore means N fields, and "inline in an
  array" means a stride over a flat scalar array (`memory-gc-design.md`'s ceiling table).
* **A2. Wasm locals cannot be indexed dynamically.** A local is named by an immediate. An index
  that is not a compile-time constant cannot reach a value held in locals without a `br_table`
  switch or a copy to memory. §6 measures the switch at 2.5x slower than the heap array.
* **A3. The existing unroller is the constant-index machine.** `emitRangeUnrolled` already
  fully unrolls a range loop with constant ends of 1–16 trips and at most 640 AST nodes. It
  reads the loop variable as a constant in each copy (DECISIONS.md, "Small constant range loops
  are unrolled"). In both of today's `f64[]` builds of `m4Mul`, one of the three loops stayed
  rolled (counted in the disassembly). The budget therefore needs raising for loops that index
  a locals-held fixed array. That is F6's lowering guarantee.
* **A4. Records stay reference types.** Nothing here changes records, lists or maps.
  `collections-design.md` §VL.6 argued that "there is no sound case for collections being value
  types while objects stay reference". F1 answers that a small fixed array of scalars is a
  numeric aggregate, like `i64` or `std:simd`'s `F32x4` (already a value type in VL), and not a
  collection.
* **A5. `collections-design.md` §VL.7's committed surface was "`T[]` + inference, no
  user-facing fixed array".** That surface removes the length header but not the allocation,
  so it cannot meet SP-036. The owner's direction A supersedes it for the value type. §VL.7's
  inferred header-less representation of `T[]` stays a separate optimisation, and the two must
  not share a name. If this design lands, §VL.7 needs a pointer to this doc.
* **A6. Un-annotated parameters monomorphize per call shape.** Measured:
  `function f(vs) { … vs.length … }` called with `[1.0, 2.0]` and with `[1, 2, 3]` prints `3`
  and `6`. F9 relies on it.
* **A7. Module exports other than the entry module's are whole-program merged**, not wasm
  exports. Only an entry-module `export` reaches the wasm export section (D3598's `bench` does).
  F14's host-boundary rule covers only that case.
* **A8. V8 (Deno 2.9.6) is the deciding engine.** sunpa runs in the browser and a Deno server.
  The documented V8 limits are 1,000 parameters and 1,000 results per function type (wasm
  limits; not re-measured here). wasmtime is not measured in this doc.
* **A9. `as` is numeric-only today.** Measured: `[1.0, 2.0] as f64[]` refuses with "`as`
  supports numeric conversions only". F8's recommendation extends the trio to one non-numeric
  conversion. That is a precedent, and it is flagged as one.
* **A10. Closures capture variables by reference** (DECISIONS.md, D2339), with a
  copy-into-the-closure fast path for bindings never assigned after capture. F13 inherits it.
* **A11. `print` and template holes accept only scalars and strings.** Measured:
  `print([1.0, 2.0, 3.0])` and `print` of a record are check errors, and `err-hole-struct.vl`
  pins the hole refusal. List `==` and record `==` are structural (measured: both print `true`
  for equal contents).
* **A12. Parameters are assignable** (measured: `x = x + 1` on an `i32` parameter compiles and
  the caller is unaffected), and **a `const` list is element-writable** (measured: `const xs =
  [1, 2]; xs[0] = 5` prints 5). F5 departs from the second deliberately.
* **A13. `[v; N]` and `T[N]` are free syntax.** Measured: `[0.0; 16]` is a parse error today
  (the list parser skips the `;` and then wants a `,`), and `let a: f64[16] = []` is a parse
  error ("expected `]` but found `16`").
* **A14. The prototype's lowering is hand-written** (§6), not emitted by a compiler that
  implements this design. It is the code F14 commits to emitting. Whether the emitter reaches
  it in every position is what the build's position matrix grades.

---

## 3. Survey

| language | type | copy on assign / pass | index check | length generics | storage | conversion to a slice |
| --- | --- | --- | --- | --- | --- | --- |
| Rust | `[T; N]` | value. `Copy` if `T: Copy`, else moved | panic at run time; a constant out-of-bounds index is a deny-by-default lint | const generics `const N: usize` (1.51) | inline in structs, `Vec`, stack | `&a` coerces to `&[T]`; `<[T; N]>::try_from(slice)` fails on a length mismatch |
| C | `T a[N]` | **not assignable**; decays to a pointer when passed (no copy); copied inside a struct | none (undefined behaviour) | none (macros) | inline | decay is implicit |
| C++ | `std::array<T, N>` | value (aggregate) | `[]` unchecked, `.at()` throws | non-type template parameter | inline | `std::span` |
| Zig | `[N]T` | value, copied | safety-checked panic; a comptime-known out-of-bounds index is a compile error | `comptime N: usize` parameters | inline | `&a` coerces to `[]T` / `*[N]T` |
| Go | `[N]T` | **value**, copied on assignment and when passed | panic; a constant out-of-bounds index is a compile error | **none**: generics cannot range over N | inline | `a[:]` makes a slice that **aliases** the array |
| Swift | no fixed array until **`InlineArray<let count: Int, Element>`** (SE-0453, Swift 6.2), with `[N of T]` sugar (SE-0483). Before that, tuples `(Double, Double, …)` | value, eagerly copied (no copy-on-write) | trap | integer generic parameters (SE-0452) | inline | `span` |
| C# | `fixed double b[16]` (unsafe structs, primitives only); C# 12 `[InlineArray(16)] struct` | value (struct) | checked through `Span<T>` | none | inline in the struct | implicit `Span<T>` |
| AssemblyScript | `StaticArray<T>` | **reference** | trap | none (`length` runtime) | heap, no backing-buffer indirection | copy |
| GLSL | `float a[16]`, `vec3`, `mat4` | value, copied | arrays: undefined or clamped; ES 1.00 restricts dynamic indexing | none | inline | none |
| WGSL | `array<f32, 16>`, `vec3<f32>`, `mat4x4<f32>` | value | no trap: an out-of-bounds dynamic access reads some in-bounds value or zero; a constant out-of-bounds index is a creation error | none (pipeline-overridable sizes only) | inline | none |

Survey facts are from each language's reference as I know it. The Swift proposal numbers and
WGSL's out-of-bounds wording were not re-verified against a toolchain here.

**What the survey says for VL.**

1. **Every language whose fixed array is fast makes it a value** (Rust, C++, Zig, Go, Swift's
   `InlineArray`, C#, GLSL, WGSL). The one reference-typed design, AssemblyScript's
   `StaticArray`, is a heap object, which is SP-036's complaint. C's arrays are the cautionary
   case: they are neither (not assignable, and they decay on a call), and that is why
   `std::array` exists.
2. **The length is part of the type everywhere.** Length generics split: Rust, C++, Zig and
   Swift have them, while Go and C# shipped without and are usable. VL's monomorphization of
   un-annotated parameters gives most of what const generics give, with no new syntax (F9).
3. **A constant out-of-bounds index is a compile error everywhere it can be** (Rust, Zig, Go,
   WGSL). A dynamic one traps everywhere except C and the shading languages.
4. **The conversion to a growable sequence either aliases (Go's `a[:]`, Rust's `&a`) or copies.**
   Aliasing needs borrowed references, which VL does not have. VL's choice is between copying
   (F8) and an implicit view.
5. **Swift waited a decade** and then shipped `InlineArray` as a separate value type beside a
   copy-on-write `Array`. That is the shape proposed here: a value type beside a reference
   `T[]`, which does not change.

---

## 4. Decisions

Each decision gives its options with code, the analysis, and a recommendation. The question
list in §8 repeats them as one question each, ordered by dependency.

### F1. Value or reference semantics

```vl
let a: f64[16] = [0.0; 16]
let b = a
b[0] = 1.0
print(a[0])          // value: 0    reference: 1

function zeroFirst(m: f64[16]) { m[0] = 0.0 }   // value: invisible to the caller (see F5)
```

* **(a) Value.** Assignment, passing, returning and storing all copy. An element write changes
  only the variable written. **This is the only option that lets the compiler keep the array
  in locals without proving anything.** No other name can observe the array, so whether it
  lives in 16 locals, 16 struct fields or a box is unobservable and free to change per
  position (F7, F14).
* **(b) Reference with a fixed length.** This is the header-less GC array that
  `collections-design.md` §VL.7 already plans to infer. Removing the allocation then needs
  escape analysis, which is option B, the one the owner declined. An alias forces the heap.
* **(c) Immutable value.** No `a[i] = v`; the update is `a.with(i, v)`, as `std:simd`'s
  `withLane`. Value and reference become indistinguishable, so the lowering is free. But matrix
  code writes elements in loops (`m4Invert`, `jittered`, the `…Into` family), and functional
  update of a 16-element value in a loop is 16 copies per write unless the optimiser fuses them.

**Recommendation: (a).** The consistency objection (records and lists are references) is
answered in A4: this is a numeric aggregate, and VL already has one value aggregate
(`F32x4`). The real cost is that sunpa's `…Into` pattern changes meaning. Writing through a
parameter no longer reaches the caller, so a port that keeps `m4MulInto(r: f64[16], a, b)`
would silently compute into a copy. F5 makes that port a check error instead of a silent no-op.

### F2. Type spelling, and the order of nested dimensions

```vl
let m: f64[16] = …        // (a) suffix, the T[] family
let m: [f64; 16] = …      // (b) Rust
let m: Fixed<f64, 16> = … // (c) a generic name with a value argument
```

* **(a)** reads as a member of the existing `T[]` family: `f64[16][]` is a list of matrices,
  sunpa's `g: f64[][]` becomes `g: f64[16][]`, and `readonly f64[16][]` binds the outer list as
  `readonly` already does. In type position `[` followed by an integer is free (A13). In an
  `as` target, `x as f64[16]` is the cast. Indexing a cast result needs parentheses,
  `(x as T)[16]`, as it does today for `T[]`.
* **(b)** is familiar to Rust users and puts the length after the element, but it is a second
  bracket grammar beside `T[]`, and `[f64; 16][]` mixes the two.
* **(c)** needs const generics (A10 on the roadmap, not built), and it reads as a library type
  the user could have written.

**Nesting order.** VL's `T[][]` composes from the inside out: `i32[][]` is a list of `i32[]`,
and the last suffix is the outermost. With (a), `f64[3][4]` is therefore four `f64[3]`, and
`m[i][j]` has `i < 4`, `j < 3`. That is the reverse of C, Java and GLSL, where the first
written dimension is the outermost. Rust's `[[f64; 3]; 4]` composes the same way as (a). The
alternative (C order) would make `f64[16][]` mean "16 lists", which breaks the
`f64[16][]` = "list of matrices" reading and `readonly`'s outer binding.

**Recommendation: (a), composing inside-out like `T[]`.** For non-square nests, the hover and
the diagnostic for an out-of-range constant index should name both lengths in index order
(`m[i][j]: i < 4, j < 3`), since this is the one place a C reader will guess wrong.

### F3. Literal syntax

```vl
const id: f64[16] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
let o: f64[16] = [0.0; 16]      // fill: value; length
let o: f64[16] = f64[16]()      // alternative: a zero-filled constructor
let o = filled(16, 0.0)         // stays f64[] (a list): filled's length is a runtime i32
```

* A **list literal of exactly N elements in a `T[N]` position** (annotation, parameter, field,
  return, element of a `T[N][]` push) is built as `T[N]`. This is the record covariance
  ruling's "a fresh literal adopts its destination" applied to arrays. A literal of the wrong
  length is a check error naming both lengths.
* **Fill:** `[v; N]` (Rust) or a zero constructor. `[v; N]` takes any element value, and `v` is
  evaluated once and copied, which is unobservable for scalar elements (F4). N must be a
  constant expression: an integer literal or a `const` bound to one. `;` already separates
  statements, but inside `[` … `]` it is currently an error (A13), so there is no clash in
  practice. The formatter must keep `[0.0; 16]` on one line.
* An **un-annotated** `let m = [1.0, …16 elements]` stays `f64[]`, as today, and see F15 for
  whether the literal-binding rulings should retype it.

**Recommendation:** exact-length list literals in `T[N]` positions, plus `[v; N]` for the
fill. No constructor spelling, since `f64[16]()` is a call-shaped type, which VL has nowhere
else.

### F4. Element types

```vl
f64[16]  f32[16]  i32[4]  i64[2]  boolean[8]   // (a) scalars
f64[4][4]                                       // nested (F2)
V3[4]   string[3]   (i32 | f64)[2]              // (b) any type
u8[16]                                          // a storage type
```

* **(a) Numeric scalars, `boolean` and nested fixed arrays.** Every element is a wasm value
  type, so the value is N scalars and the copy is N `local.set`s.
* **(b) Any type.** Go and Swift allow it with shallow-copy semantics: `V3[4]` copies four
  references and the records stay shared. That is "value" in name only, and a record element
  written through one copy is seen by the other. It is legal and coherent, but the reasons to
  want it (F7's storage, unions in F15) multiply the position matrix by every element rep.
* **`u8`** is a storage-only type (owner ruling, 2026-08-22). As an element of a value held in
  i32 locals, every write would truncate and every read widen. That is coherent, but it adds a
  rep for no current consumer.
* **Literal unions** (`0 | 1 | 2`) rep as i32 and would work as (a). They are deferred with (b),
  since nothing asks for them.

**Recommendation: (a) for v1.** Records, strings, unions, `u8` and literal unions are each
additive later and each refused today with a message naming the supported set. Following
CLAUDE.md, the supported list is graded one member per row before the message ships.

### F5. Writes through `const` and through a parameter

```vl
const m: f64[16] = [0.0; 16]
m[0] = 1.0                       // ?

function m4MulInto(r: f64[16], a: f64[16], b: f64[16]) { r[0] = a[0] * b[0] }   // ?
```

* **`const`.** For a value, `const` means the value is fixed, as `const n = 3; n += 1` is
  refused. A `const` list is element-writable (A12) because the binding, not the list, is
  constant. Under F1(a) there is no separate object to be mutable.
  **Recommendation:** refuse, with a message that says a fixed array is a value and to use `let`.
* **A parameter.** Writing an `i32` parameter is legal and local (A12), so allowing `r[0] = …`
  is consistent. But the only reason sunpa writes through a matrix parameter today is to reach
  the caller (`…Into`). Under value semantics such a port compiles and silently computes
  nothing, which is a clause-1-shaped trap even though it is not a miscompile.
  **Recommendation:** refuse in v1, with a message naming both fixes: return the result, or copy
  first (`let r2 = r`). Lifting the refusal later breaks no program. The opposite order would.

### F6. Non-constant indexing

```vl
function trace(m: f64[16]): f64 { m[0] + m[5] + m[10] + m[15] }       // constant: free
function col(m: f64[16], c: i32): f64 { m[c * 4] }                    // dynamic index
for k in 0 until 4 { s = s + a[k * 4 + r] * b[c * 4 + k] }            // constant after unrolling
m[16]                                                                 // constant, out of bounds
```

* **(a) Bounds-checked trap**, the list contract (`l[i]` traps out of bounds). The semantics
  never depend on the optimiser. A constant out-of-bounds index is a check error (as in Rust,
  Zig, Go and WGSL).
* **(b) Static proof only.** The index must be a constant, a range variable with constant
  bounds, or a literal-union type such as `std:simd`'s `Lane4`. Anything else is refused. This
  is the SIMD precedent, where `lane(i)` must be compile-time. It is honest about A2, but it
  makes `col(m, c)` unwritable, and whether a loop "counts" must be a syntactic rule, never an
  unroll budget, or programs would compile or not by optimiser setting.
* **(c) Clamp or wrap**, like WGSL. Silent, and it violates "a lossy operation is a failure".

**Lowering under (a).** A binding whose every index is constant after unrolling is held in N
locals with no check. One non-constant index anywhere moves that binding's representation to
the owned box (F7): one `(array mut f64)` allocated at the declaration, indexed with the
engine's own bounds check, and copied in and out at value boundaries. That is a cliff from
40 ms to about 110 ms (§6: the box is the `filled` row's speed). It is never wrong, and
`vl check` can say which index caused it. A `br_table` switch over the locals is the other
lowering, and it measured slower than the box (§6, row `g`), so it is not proposed.

The unroller (A3) must treat "this loop indexes a locals-held fixed array" as a reason to
unroll past its 640-node budget, up to a separate cap. sunpa's `m4Mul` is a 4x4x4 nest of 64
inner bodies, which today's budget leaves partly rolled.

**Recommendation: (a)**, with the cliff reported by a `vl check` hint (not a warning) naming
the index that moved the binding to the box.

### F7. Storage in records, lists, maps, globals and captures

```vl
type Skeleton = { count: i32, root: f64[16] }   // field
let g: f64[16][] = []                            // list of matrices
let byName: {[string]: f64[16]} = Map()          // map value
let viewProj: f64[16] = [0.0; 16]                // module global
sk.root[12] = 1.0                                // element write in place
const r = sk.root                                // whole read: a copy
sk.root = m4Mul(a, b)                            // whole write
```

| position | (i) inline scalars | (ii) owned box | (iii) flattened |
| --- | --- | --- | --- |
| local, parameter, result | N locals / N params / N results | — | — |
| record field | N struct fields | one `(ref (array mut f64))` field, allocated with the record | — |
| list `T[N][]` | not expressible (A1) | `(array (ref $box))`, one box per element | one `(array mut f64)` of 16·len, stride 16 |
| map value | not expressible | box per entry | — |
| module global | N wasm globals | one box global | — |
| captured, written after capture | — | the box doubles as the shared cell | — |

**Owned box.** A heap array of exactly N elements that only its slot can reach. A whole read
copies N values out, and a whole write copies N values in, with no allocation after the slot
is created (`sk.root = m4Mul(a, b)` writes 16 `array.set`s into the existing box). An element
write `sk.root[12] = 1.0` is one `array.set`, visible to every alias of `sk`, which is correct
because `sk` is a reference. **The box is never shared**, so F1's value semantics hold. This is
where value semantics pay: the representation inside a container is the compiler's choice and
can change later without a program noticing.

* Record field, inline (i) or box (ii): inline is fastest for constant indices and costs no
  extra object. A dynamic index into an inline field needs the `br_table` switch, though, which
  is the slow row. Recommendation: **(ii) in v1**, and (i) later for a type whose every index
  program-wide is constant (a whole-program fact the checker can record).
* List: (iii) is the layout sunpa already writes by hand (`pose: f64[]` with STRIDE 10), and it
  makes `g: f64[16][]` one allocation for every bone. It needs a new list rep (`length` =
  backing length / 16, `push` appends 16, `g[b]` copies 16 out, `g[b][k] = v` is one store).
  Recommendation: **(ii) in v1, (iii) as the follow-up**, since the switch is unobservable.
* Global: **(i)** for N up to the F10 threshold (16 globals are cheap and constant-indexable),
  else (ii).
* Map value, capture cell, union or nullable member (`f64[16] | null`): **(ii)**.

### F8. Conversion to and from `T[]`

```vl
const xs: f64[] = m.toList()            // (a) explicit copy out
put(buf, 0, m)                          // put(…, vs: f64[]): implicit copy? (b)
put(buf, 0, m)                          // put(…, vs: readonly f64[]): implicit copy? (c)
const m: f64[16] = xs as! f64[16]       // in: trap on a length mismatch
const m2 = xs as? f64[16]               // in: f64[16] | null
```

* **Out to `T[]`.** An implicit conversion would allocate silently on every call (reintroducing
  the garbage this design removes) and, into a mutable `T[]`, change aliasing silently. The
  record covariance ruling refused copy-on-delivery (its option B) for exactly that reason.
  Into a `readonly T[]` the aliasing argument disappears, since a copy of a value is
  indistinguishable from the value. The allocation remains, though.
* **In from `T[]`.** A length mismatch is a failure, and VL's failure operator for a conversion
  that may not hold is the `as` trio (owner ruling, 2026-09-02: "a lossy conversion is a
  failure"). The owner's own corollary ("when a proposed std name is an operator the language
  already has, spelled as a function, the answer is the operator") argues against a std
  `fixedOf(xs)`. The cost is that `as` stops being numeric-only (A9).

**Recommendation:** explicit both ways. `a.toList()` out, a built-in method rather than std.
The `as` trio in, where bare `as` propagates null exactly as the numeric trio does. The refusal
message at a `T[]` or `readonly T[]` delivery names `.toList()` and the un-annotated-parameter
alternative (F9). sunpa's `put` becomes `function put(b: Buf, at: i32, vs)` and monomorphizes
per length, with no copy.

### F9. Generics

```vl
function trace<T>(m: T[16]): T { m[0] + m[5] + m[10] + m[15] }   // generic element: yes
function sum(vs) { let s = 0.0; for v in vs { s += v }; s }       // length via inference: yes
function sum<const N>(vs: f64[N]): f64 { … }                     // const generics: later
```

* **(a) No length polymorphism.** Every `T[N]` has a literal N. That is Go's position.
* **(b) Length polymorphism through un-annotated parameters.** It already exists (A6): each call
  shape is its own instance, `.length` is a constant in each, and `for v in vs` unrolls in each.
  No syntax is needed. It cannot be written in an annotation, though, so an `export` that wants
  a declared signature cannot be length-generic.
* **(c) Const generics** (roadmap A10, not built), the Rust, Zig and Swift answer. It is a
  general feature (the `Decimal<10, 8>` family wants it too) and should be designed for all of
  them, not invented here.

**Recommendation: generic element types plus (b) in v1, with (c) left to A10.** A generic `T`
instantiated at a non-scalar is refused by F4 at the instantiation, with the instance named.

### F10. Size limit

```vl
let m: f64[16]          // 16 locals
let big: f64[1024]      // 1024 locals? a box?
```

* **(a) No limit in the language** (Rust, Go, Zig, Swift). Every assignment of a 1,024-element
  value copies 1,024 elements, which is what the type means.
* **(b) A hard cap** (16, 64, 256) refused at the type. It is simple, but it makes `f64[17]` a
  check error for a reason that is about registers, not the program.

The lowering needs a threshold either way. V8 allows 1,000 parameters and results (A8), and
register pressure past a few dozen live f64 values turns locals into spills. **Proposed
threshold: 16 scalar slots** (an `f64[16]` and an `f64[4][4]` fit, and a 3x3 `f64[9]` and a
quaternion fit). Past it, every position uses the owned box and `=` copies with `array.copy`.
The threshold is a lowering constant, measured and recorded in DECISIONS.md like the unroll
budget, and is not part of the type system. N must be at least 1, since `T[0]` has no use and
would add a zero-length case to every lowering. That is the one hard rule.

**Recommendation: (a)**, with N ≥ 1 and the 16-slot lowering threshold.

### F11. Equality and printing

```vl
a == b                 // elementwise ==, like lists and records (A11)
print(m)               // refused, like lists and records
print("m = \{m}")      // refused, like lists and records
```

Elementwise `==` with each element's own `==` (so `NaN != NaN` and `-0.0 == 0.0`, IEEE) matches
what lists and records already do. Printing a list or record is refused today, so a fixed array
is refused with the same message. Adding aggregate printing is a separate ruling for all
aggregates, not this type's. No hashing in v1, so a fixed array cannot be a map key, and the
message says so.

**Recommendation:** elementwise `==` and `!=`; no ordering; `print` and holes refused, with a
hint naming `m[i]`.

### F12. Iteration

```vl
for x in m { s += x }          // value per element
for x, i in m { o[i] = x * k } // element and index
```

These work exactly as for `T[]`. When `m` is held in locals the loop has a constant trip count
of N and is **always unrolled** (that is the only way to reach a local, A2), up to the F10
threshold. Past it, `m` is boxed and the loop stays a loop. Writing `m` inside a `for x in m` is
well defined under value semantics, since the loop reads the value it started with (Go's
semantics for a range over an array). This differs from a `T[]`, where mutating during
iteration is unspecified.

**Recommendation:** as above. The "loop reads its starting value" rule is stated in the docs,
because it is the one place the value semantics show in a loop.

### F13. Closure capture

```vl
let m: f64[16] = [0.0; 16]
const f = () => m[0]
m[0] = 1.0
print(f())     // 1, the D2339 rule: captured by reference
```

D2339's rule applies unchanged, with **an element write counting as an assignment** to the
variable (under value semantics it is one). A captured array never assigned after capture is
copied into the closure environment: N fields at or under the threshold, else a box. One that
is assigned after capture is shared through an owned box that both scopes index.

**Recommendation:** as above. No new rule, only the element-write clause.

### F14. How it lowers

| position | proposed (L1: the compiler emits it) | alternative (L2: immutable struct, then the `-O` steps) |
| --- | --- | --- |
| local | N wasm locals; a constant index is `local.get`/`local.set` | an immutable `$f64x16` struct; a write makes a new one; Heap2Local melts what it can |
| parameter | N wasm parameters | one struct reference |
| result | N multi-value results | one struct reference; D3625's step twins it if the bound allows |
| `if`/`match` value | N result locals written in each arm | a struct |
| field, list, map, global | §F7 | struct references |

* **L1** gives the guarantee sunpa asked for ("no heap") at **every** rung, `-O0` included, and
  makes the speed a property of the type rather than of an optimiser's heuristics. It needs
  multi-result function types in the compiler's own emitter, which emits none today (grep:
  multi-value lives only in the host step `scripts/vl-host/src/multivalue.rs`).
* **L2** reuses the multi-value step and Heap2Local and is less compiler work. But its "no
  allocation" is an optimiser outcome. Today it holds only up to 8 fields
  (`MV_RECORD_MAX_FIELDS`), only for functions without `br_if`/`br_table` exits carrying the
  result, and only under the twin and growth bounds. That makes it the option B the owner did
  not choose. §6 measured L2's shape after `wasm-opt -O3` (row `f_struct_O3`): **123 scavenges
  per 10^6 products**, the loop-carried merge D3598 describes.

**At an entry-module export** (A7) a fixed-array parameter is passed as N numbers and a result
comes back as N results, which JavaScript receives as an Array. This is documented and not
hidden.

**Recommendation: L1.** The host step stays as it is and keeps serving records.

### F15. Interaction with the numeric-join and literal-binding rulings

```vl
const v: f64[3] = [1, 2, 3]       // literals adapt: [1.0, 2.0, 3.0]
const w: f64[3] = [i, y, z]       // i: i32, y: f64. Each element converts if exact: i32 → f64 ok
const q: f64[2] = [n64, y]        // n64: i64. Refused: i64 → f64 is not exact; the message names `as`
let m = [0.0; 16]                 // un-annotated fill: f64[16] (the fill only makes fixed arrays)
let p = [1.0, 2.0, 3.0]           // un-annotated list literal: f64[], as today
takesFixed(p)                     // ?
```

* **Literals adapt** (owner, 2026-09-30) elementwise: an integer literal in an `f64[N]` slot is
  an `f64`.
* **Runtime numerics join as a union** (same ruling, extended 2026-10-03 to list literals).
  Delivered into a `T[N]` slot, each element converts only when the conversion is exact for
  every member (`i32 | f64` → `f64` is exact; `i64 | f64` → `f64` is refused with an `as` fix).
  That is the existing union-delivery rule, applied per element.
* **Literal-binding inference (B′/C).** The record covariance ruling lets a binding that holds
  only a literal adopt its destination. Extending that, `let p = [1.0, 2.0, 3.0]` whose every
  use is a delivery to `f64[3]` (and never a `push`, an alias or a `T[]` delivery) could adopt
  `f64[3]`. That is real inference work and a second meaning for an un-annotated list literal.
  **Recommendation: not in v1.** An un-annotated list literal stays `T[]`, a delivery to
  `T[N]` is refused with "annotate `: f64[3]`", and the adoption is a later additive step.
* A **`const` initialised by an exact-length literal** is typed per use under ruling C. For a
  value type that is sound (no aliasing to duplicate), so `const ID = [1.0, …]` used as
  `f64[16]` in one place and as `f64[]` in another builds each at its use. Recommendation: yes,
  as C already says for scalars.

### F16. std additions

The type's surface is built in: `.length` (a compile-time constant), indexing, `==`, `for`,
`toList()`, the `as` trio and `[v; N]`. **No `std:mat`, `std:vec` or `std:fixed` module.** sunpa
owns its math. A `mat4` std module is a large speculative surface with no deprecation story
(CLAUDE.md), and `F32x4` already exists for the SIMD shapes. `map`/`fold` over `T[N]` need
either const generics (F9's (c)) or a compiler builtin, so they wait for A10. Any later std
export goes through `std-api-reviewer`.

---

## 5. Lowering sketch and cost

**Layers that change.**

| layer | change | risk |
| --- | --- | --- |
| `compiler/parser.vl` | `T[N]` in the type suffix loop (`parseTypeAtom`'s `[` arm today only accepts `]`); `[v; N]` in the list-literal parser; AST carries N | `vl fmt` must print both and never re-spell them (the formatter defect family) |
| `compiler/typecheck.vl` | a new type kind or `TyArray` with a length; assignability (exact N, never to or from `T[]`); index typing and the constant out-of-bounds error; literal adoption (F3); the `as` trio (F8); `const` and parameter write refusals (F5); `==`; `for`; capture's element-write clause (F13) | **`is TyArray` appears 345 times in 7 files** (`typecheck.vl` 236, `emit_classify.vl` 65, `emit_mono.vl` 23). A new kind trips `kind-ladder-incomplete` at every closed ladder, which is the safe failure. Folding the length into `TyArray` is cheaper and lets every one of the 345 sites treat a fixed array as a list without saying so, which is the clause-1 failure. **Recommend a new kind.** For scale, `TyMap` has 179 sites |
| canon / interner | `f64[16]` and `f64[9]` are distinct types; the length joins the identity | rep-fuzz gate is mandatory (CLAUDE.md) |
| `compiler/emit_rep.vl`, `emit_classify.vl` | the locals rep (N slots) and the owned-box rep; which positions take which (F7, F10) | "arena and canon are two producers": both must agree on the rep |
| `compiler/wasmEmit.vl`, `emit_bytes.vl` | N-slot locals; constant index to `local.get`; multi-result function types; N-parameter calls; result locals for `if`/`match`; box copy in and out; the forced unroll (F6/F12) | multi-value is new to the compiler's emitter; the unroll budget is a compile-time cost (`vl_scaling_shape_test.ts`) |
| `compiler/emit_mono.vl` | instances per element type and per un-annotated length (F9) | mono grid (`scripts/mono-tyaram-grid.sh`) |
| `std/` | none (F16) | — |
| LSP | hover and diagnostics show `f64[16]`; the F6 hint | the editor suites in ci.yml |
| tests | a `capability-probes/matrix/*.matrix.vl` template per rep (all 26 positions, both faces), plus a generic-element twin (CLAUDE.md: a template that fixes the type cannot see an inferred-type defect) | the position matrix is the build's main grading instrument |

**Build order** (CLAUDE.md: build the lowering, wire every delivery, then narrow the gate):

1. **S1: locals, parameters and results.** Constant indices, the forced unroll, the fill and
   the exact literal, `==`, `for`, F5. sunpa's `m4Mul`, `m4Invert`, `perspective`, `lookAt`
   and `compose` port at this step. Every other position is refused with a capability message
   until its slice lands. Those refusals are clause-2 violations by construction, so the slices
   should land close together.
2. **S2: owned-box storage.** Fields, globals, map values, list elements (boxed), captures,
   `T[N] | null`, and the dynamic-index fallback. Here `g: f64[16][]`, `Skeleton.root` and
   `viewProj` port.
3. **S3: conversions.** `toList()` and the `as` trio.
4. **S4: flattened lists**, (iii) in F7, a pure representation change.
5. Later and additive: records, strings and unions as elements (F4), const generics (F9 via
   A10), literal-binding adoption (F15), inline record fields (F7 (i)).

**Rough size**, in the agent-time unit ROADMAP rows use: S1 is about one week (parser and
checker 2–3 days, rep and emitter 3–4 days, including multi-result function types), S2 is
about one week, S3 is 1–2 days, and S4 is 3–5 days. In total that is three to four weeks of
lane time, plus the critic round and fixtures. Seed size: the compiler uses no fixed arrays,
so seed growth is only the new emitter code, the same shape as the unroller's +0.15%.

**Risks, ranked.**

1. **The position matrix.** Two reps per type (locals and box) times 26 delivery positions
   times both faces. Every unwired position is check-clean invalid wasm until wired, the D965
   shape. Mitigation: refuse at the checker per position until the slice wires it, and only
   then narrow.
2. **The cliff in F6.** One dynamic index moves the binding from about 40 ms to about 110 ms
   with no error. Mitigation: the `vl check` hint, and a perf note in the guide.
3. **The forced unroll's compile time and code size.** A 4x4x4 nest is 64 copies, and a large
   N inside a loop multiplies them. Mitigation: the 16-slot threshold bounds N; the unroll cap
   is a measured constant.
4. **Value-semantics surprise in ports.** The `…Into` pattern (F5 refuses it) and
   `const m: f64[16]` not being element-writable (F5) both behave differently from a list.
5. **Register pressure in V8** past the threshold. Measured fine at 32 live f64 parameters
   (§6); not measured past that.

---

## 6. Prototype evidence

**What was measured.** sunpa SP-036's benchmark, verbatim in shape: `m = m4Mul(m, t)` 10^6
times, returning `m[12]`. Every variant prints the same `-27.41128857588617` for n = 1000, which
the harness asserts. Deno 2.9.6 (V8), each variant in its own process, 3 warm-up calls of 10^5,
then 7 timed calls of 10^6. Rounds were interleaved across variants, 5 rounds per pass,
reported as min-of-mins and median-of-medians, all under `nice -n 19` on a shared 24-core box
at load 7–17. VL builds used master `221c7954f`'s seed and host at `-O3`. The Rust build was
1.x stable, `wasm32-wasip1`, `opt-level=3`, LTO, with `t` behind `black_box`. Sources are in
the appendix.

| row | what it is | allocation per product | ms min / median (V8 default) | ms min / median (`--no-wasm-inlining`) | scavenges per 10^6 |
| --- | --- | --- | --: | --: | --: |
| a_push | VL `f64[]`, `push` (SP-036 verbatim) | list | 140 / 154 | 132 / 149 | 172 |
| b_filled | VL `f64[]`, `filled` + stores (`view.vl`'s spelling) | list | 115 / 126 | 108 / 124 | 147 |
| c_rec16 | VL 16-field record (what records do today; over D3625's 8-field bound) | struct | 89 / 107 | 91 / 103 | 123 |
| f_struct | wasm: immutable 16-f64 struct parameter and result (L2 at a call) | struct | 89 / 109 | 92 / 104 | 123 |
| f_struct_O3 | the same after `wasm-opt -O3` (inlined, loop-carried merge stays) | struct | 95 / 123 (pass 2) | — | 123 |
| **e_mv** | **wasm: 32 f64 parameters, 16 multi-value results, 16 loop-carried locals (L1)** | **none** | 95 / 110 | **97 / 105** | **0** |
| **e_mvg** | **e_mv with `t` read from mutable globals (no constant folding; like-for-like with Rust)** | **none** | **43 / 46** (V8's own inliner took the call: compare the next column) | **96 / 104** | **0** |
| e_mvg_O3 | e_mvg after `wasm-opt -O3` (binaryen inlined the single caller) | none | 41 / 48 | 40 / 45 | 0 |
| d_scalar | **VL source** hand-scalarized: 16 `let`s, product written out (what L1 produces once inlined) | none | 43 / 47 | 40 / 45 | 0 |
| rust | `[f64; 16]` by value, `#[inline(never)]` | none (linear memory) | 92 / 110 | 89 / 102 | 0 |
| rust_inl | `[f64; 16]`, `#[inline(always)]` | none | 42 / 48 | 41 / 49 | 0 |
| g_brtable | wasm: L1's locals but loops **not** unrolled, every index a `br_table` over 16 locals | none | 248–255 / 291–343 (passes 1–2) | — | 0 |

Pass 1 (rows without `e_mvg`) read a_push 151–169, b_filled 113–125, e_mv 99–104, rust 96–98,
e_mv_O3 40–44 and d_scalar 42 on min-of-mins, which is consistent with the table. sunpa's own
box read 163 / 115 / 97 for a_push / b_filled / rust. The brief quotes 137 / 116 / 96 after
D3623's reserve. This box's a_push includes D3623 and reads 132–169.

**Findings.**

1. **The proposed lowering reaches Rust in both regimes.** Called: e_mvg/e_mv 96–97 ms against
   Rust's 89–98 ms over the three passes (89–92 in the third, which ran both columns: 1.05–1.08x,
   inside this box's noise band). Inlined: 40–44 ms against Rust's 41–44 ms. "Called" is forced with `--no-wasm-inlining`, since V8 otherwise decides by itself:
   it inlined e_mvg's call and not e_mv's (an observation, not explained here).
2. **It removes the garbage**, which is the half of SP-036 a faster heap cannot fix: 0
   scavenges against 123–172. sunpa's hitches are scavenges, not throughput.
3. **The heap spellings are not slow because of the call.** A 16-f64 struct across the call
   (f_struct, c_rec16) is as fast as the multi-value call (89–92 ms against 96–97). The cost of
   the struct is the garbage. And once inlined, the struct still is not removed (f_struct_O3,
   c_rec16: the loop-carried merge of D3598).
4. **The multi-value bound in `multivalue.rs` is not a speed bound at 16 f64.** Its comment
   says that past eight fields "the copy at every call grows … and inlining is the better
   route". At 16 the multi-value call matched the struct call's time and allocated nothing.
5. **Unrolling is load-bearing.** The same locals with dynamic indices through `br_table`
   (g_brtable) are 2.5x slower than the heap list. Hence F6's box fallback, and hence the forced
   unroll.
6. **VL already emits the target code from scalar source.** d_scalar is the compiler's own
   output: 40–43 ms, 0 allocations. The work is entirely in getting from `a[k * 4 + r]` to that
   source shape, by unrolling plus constant indices into N locals.

**Caveats.** The wasm rows are hand-written, not compiler output (A14). Only V8 was measured
(A8). The box was shared and loaded, so rows within about 10% of each other are not
distinguishable, and only the large gaps (40 against 90–110 against 108–169 ms, and 0 against
120+ scavenges) are claimed. The owned-box rows (F6's fallback, F7's fields) were not
prototyped separately; their speed is assumed to be b_filled's, since the access is the same
`array.get`/`array.set` on an `(array mut f64)`.

---

## 7. Alternatives considered

* **Raise `MV_RECORD_MAX_FIELDS` to 16 and tell sunpa to use a 16-field record.** It helps the
  call boundary (finding 3 says the bound is not a speed bound). But a record has no computed
  index, no loop and no `T[16][]` list, so sunpa's matrix code (the §1 table) cannot be written
  with it. Raising the bound is still worth a row for records, independent of this design.
* **Option B, optimiser-only** scalar replacement of a fresh `f64[]`. The owner chose A. The
  measured reason it would be weaker: even a heap value the optimiser fully sees (f_struct_O3)
  keeps its allocation through a loop-carried merge.
* **SIMD (`F32x4`) for the matrix.** A 4x4 f32 product is four `F32x4` columns, and that is
  sunpa's possible f32 future. It does not cover f64, where 2-lane f64x2 is not in `std:simd`,
  and it is linear-memory oriented. It is complementary: an `f32[16]` could later lower to four
  `v128` locals.
* **Tuples.** Held by the multi-value ruling (B, 2026-09-29) until B is measured. A
  fixed-length homogeneous array is not a tuple and does not reopen that ruling.

---

## 8. Open questions for the owner

Ordered by dependency: Q1 decides what every later answer means. Each question has a code
sample per option and a recommendation. One question per turn at question time.

**Q1 (F1). Does `b = a` copy?**
* (a) Value: `let b = a; b[0] = 1.0` leaves `a[0]` unchanged, and a callee never writes the caller's array.
* (b) Reference: `b[0] = 1.0` changes `a[0]`. The allocation is removed only where an optimiser proves no alias.
* (c) Immutable value: `a[0] = 1.0` is refused, and `a.with(0, 1.0)` makes a new value.

*Recommend (a).* It is the only option that guarantees no heap; (b) is option B again.

**Q2 (F2). How is the type spelled, and which dimension is outer?**
* (a) `f64[16]`, with `f64[3][4]` meaning four `f64[3]` (like `T[][]`), so `f64[16][]` is a list of matrices.
* (b) `[f64; 16]`, with `[[f64; 3]; 4]`.
* (c) `Fixed<f64, 16>`.

*Recommend (a).* The C-order reading would make `f64[16][]` mean 16 lists.

**Q3 (F3). How is a value written?**
* (a) An exact-length literal in a typed position plus `[0.0; 16]`.
* (b) The literal only (`[0.0, 0.0, …]` sixteen times).
* (c) `f64[16]()` for zero.

*Recommend (a).*

**Q4 (F4). Which element types does v1 allow?**
* (a) Scalars, `boolean` and nested fixed arrays: `f64[16]`, `i32[4]`, `f64[4][4]`.
* (b) Any type, with shallow copies: `V3[4]` copies four references.

*Recommend (a).* The rest is additive.

**Q5 (F5). Are element writes allowed through `const` and through a parameter?**
* (a) `const m: f64[16] = …; m[0] = 1.0` is refused, and `function f(r: f64[16]) { r[0] = 1.0 }` is refused, with the fix named.
* (b) Both allowed: const is element-writable like a list, and the parameter write is local like an `i32`.
* (c) `const` refused, parameter allowed.

*Recommend (a).* It turns the silent `…Into` port into an error, and it is the order that can be relaxed later.

**Q6 (F6). What does a non-constant index do?**
* (a) `m[c * 4]` is legal and traps out of bounds, a constant `m[16]` is a check error, and a dynamic index moves that binding to the heap box, with a hint.
* (b) Only constants, constant-bound range variables and literal-union indices: `col(m, c)` is refused.
* (c) Clamp, as WGSL.

*Recommend (a).*

**Q7 (F7). Where does a fixed array live inside other values?**
* (a) An owned box per field, map value and global past 16 slots; boxed list elements in v1, flattened (`f64[16][]` as one stride-16 array) later.
* (b) Inline record fields (16 struct fields) from v1, where a dynamic index into a field is a `br_table`.
* (c) Flattened lists from v1.

*Recommend (a).* The others are representation changes value semantics allow at any time.

**Q8 (F8). How does it convert to and from `T[]`?**
* (a) Explicit both ways: `m.toList()`; `xs as! f64[16]` / `as? f64[16]` / `as f64[16]`.
* (b) Implicit out into `readonly T[]` (a hidden copy): `put(buf, 0, m)` just works.
* (c) A std function in: `fixedOf(xs)`.

*Recommend (a).* It extends `as` beyond numerics, a first, and that is the cost to rule on.

**Q9 (F9). Can code be generic over the length?**
* (a) Only through un-annotated parameters: `function put(b: Buf, at: i32, vs) { … }` monomorphizes per length.
* (b) Const generics now: `function put<const N>(…, vs: f64[N])`.
* (c) No length polymorphism.

*Recommend (a)*, with (b) designed with roadmap A10.

**Q10 (F10). Is there a size limit?**
* (a) No limit, N ≥ 1, and a 16-slot lowering threshold (past it the value lives in a box and `=` is an `array.copy`).
* (b) A hard cap: `f64[17]` is a check error.

*Recommend (a).*

**Q11 (F11). Equality and printing?**
* (a) `a == b` elementwise; `print(m)` refused like lists.
* (b) Also add printing `[1, 0, 0, …]` for fixed arrays only.

*Recommend (a).* Printing aggregates is one ruling for all of them.

**Q12 (F12). Does `for x in m` read the value it started with?**
* (a) Yes: `for x in m { m[0] = 9.0 }` iterates the original values (Go's semantics for arrays).
* (b) Unspecified, like lists.

*Recommend (a).* It is free under value semantics.

**Q13 (F13). Does an element write count as an assignment for capture?**
* (a) Yes: `let m = …; const f = () => m[0]; m[0] = 1.0` makes `f()` see 1.0.
* (b) Captures always copy, so `f()` sees 0.0.

*Recommend (a).* It is D2339's rule unchanged.

**Q14 (F14). Does the compiler emit the N-locals / multi-value code itself (L1), or rely on the `-O` steps (L2)?**
* (a) L1: no heap at any rung, more emitter work (multi-result function types).
* (b) L2: less work, and the allocation is gone only when the optimiser manages it (8-field bound today; 123 scavenges measured for the loop-carried case).

*Recommend (a).*

**Q15 (F15). Does an un-annotated list literal ever become a fixed array?**
* (a) No in v1: `let p = [1.0, 2.0, 3.0]; takesFixed(p)` is refused with "annotate `: f64[3]`".
* (b) Yes: a literal-only binding whose every use is a `f64[3]` delivery adopts `f64[3]`.

*Recommend (a)*, with (b) as a later additive step.

**Q16 (F16). Any std module?**
* (a) None; the surface is built in (`.length`, `toList`, indexing, `==`, `for`).
* (b) A `std:mat` with `mat4Mul`, `identity` and friends.

*Recommend (a).*

---

## Appendix: prototype sources

All were written in a scratch directory and run with `nice -n 19`; nothing here is in the
build. Reproduce by generating the wat with the Python below, assembling with
`node_modules/.bin/wasm-as --enable-gc --enable-reference-types --enable-multivalue x.wat -o
x.wasm` (and `wasm-opt … -O3` for the `_O3` rows), building the VL rows with `vl build x.vl -O3
-o x.wasm`, and timing with the harness.

**VL rows.** `a_push.vl` is SP-036's program verbatim, with `print(bench(1000))` appended.
`b_filled.vl` is `view.vl`'s `m4MulInto(filled(16, 0.0), a, b)` with the same `bench`.
`c_rec16.vl` and `d_scalar.vl` are generated below.

**Generator** (`gen.py`; `I` is the identity, `T` is SP-036's `t`):

```python
I = [1.0,0,0,0, 0,1.0,0,0, 0,0,1.0,0, 0,0,0,1.0]
T = [0.999,0.01,0.0,0.0,-0.01,0.999,0.0,0.0,0.0,0.0,1.0,0.0,0.1,0.2,0.3,1.0]
def fl(x): return repr(float(x))
# o[c*4+r] = sum_k a[k*4+r] * b[c*4+k]

# c_rec16.vl: a 16-field record M4 = { m0: f64, ... m15: f64 }, m4Mul builds the literal.
# d_scalar.vl: bench with `let m0..m15`, `const t0..t15`, and per iteration
#   `const o{c*4+r} = m{r}*t{c*4} + m{4+r}*t{c*4+1} + m{8+r}*t{c*4+2} + m{12+r}*t{c*4+3}`
#   followed by `m{i} = o{i}`.

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
  w += "   (local.set $i (i32.add (local.get $i) (i32.const 1)))\n   (br $top)))\n  (local.get $m12))\n)\n"
  return w
# e_mvg.wat: mv_module() with `t` in 16 `(mut f64)` globals, an exported `poke` that writes
#   one (so none is constant), and the call reading 16 locals loaded from them before the loop.
# f_struct.wat: (type $M (struct (field f64) x16)); m4Mul (ref $M) (ref $M) -> (ref $M) is one
#   struct.new of the same 16 sums over struct.get; bench carries one (ref $M) local.
# g_brtable.wat: m4Mul with e_mv's signature but SP-036's three loops kept, every a[k*4+r],
#   b[c*4+k] read and o[c*4+r] write a br_table over 16 blocks selecting the local.
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
    m[12]
}
// bench_inl: the same over m4_mul_inl.
```

**Harness** (`deno run -A [--v8-flags=--no-wasm-inlining] bench.ts x.wasm bench 1000000 7`;
every import is stubbed, and VL's start function prints through the stub):

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
const check = f(1000);                       // asserted == -27.41128857588617 by the driver
for (let w = 0; w < 3; w++) f(100000);
const ts: number[] = [];
for (let r = 0; r < Number(runsArg); r++) {
  const t0 = performance.now(); f(Number(nArg)); ts.push(performance.now() - t0);
}
ts.sort((a, b) => a - b);
console.log(JSON.stringify({ file, exp, check, min: ts[0], median: ts[ts.length >> 1] }));
```

Scavenges were counted with `--v8-flags=--trace-gc`, as the `Scavenge` lines printed between
two markers around one `bench(1000000)` call.
