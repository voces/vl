# Property access: should VL have getters?

> Status: design, for an owner ruling. No compiler or std source is touched by the change that
> carries this doc. Every "today" claim below is a program run with `dist/vl` on master
> `914d64d65` (2026-09-22). Claims about the SIMD surface were run with a compiler built from
> the S3 branch (#3015, head `d5b29007e`) against that branch's `std/`. Where a claim is a
> judgement and not a measurement, the text says so.

**The question (owner, 2026-09-22):** *"Should VL have getters? Are they good language design?
Are they good for VL?"*

**The trigger.** SIMD S3 (#3015) could not ship either lane-read spelling that O3 rules
(`simd-design.md` §F): the named `.x/.y/.z/.w` accessors, and `laneF32x4(v, i)` with a literal
`i`. VL has no property syntax. `buf.length` works only because `Buf` is a struct with a real
`length` field. A std wrapper also cannot pass a literal lane index on to
`__extract_lane_f32x4__`, because once `i` is a parameter it is no longer a literal. The row is
[D1980](inventory/D1980.md).

**The short answer, argued in §C–§E:**

- Getters are a good feature in languages where a field can be private. VL has no private
  fields, and that removes most of the case for them.
- In a structurally typed language, a getter must never satisfy a record type such as
  `{ x: f32 }`. In VL that type is a WasmGC layout and it permits writes.
- VL already has zero-cost computed members: a UFCS `v.x()` compiles to the same optimised wasm
  as a field read (§A2).
- So the recommendation is **a narrow, declared, nominal-only, read-only getter** (`get x(self:
  F32x4): f32`), which exists mainly to honour O3's `.x` and to let a packed scalar newtype
  expose named parts.
- **The getter's body is checked, not trusted.** It must be loop-free, recursion-free,
  allocation-free and effect-free, and it may call only intrinsics and other getters (§D3a).
  That keeps a getter read to a load or a short straight-line sequence. The contract is
  deliberately conservative and will only ever be relaxed.
- **Nothing new in the language is needed to unblock lane reads today.** A literal-union
  parameter (`i: 0 | 1 | 2 | 3`) compiles in std with no compiler change. It is range-checked at
  compile time, and it folds to one `f32x4.extract_lane` at `-O` and `-O3` (§A7).

---

## A. What VL has today, measured

Each probe is at most ten lines and was run as written. The table at the end of this section
lists the outcomes.

### A1. A field read is one `struct.get`, and structural flexibility comes from monomorphization

```vl
type P = { x: f32, y: f32 }
function getx(p: P): f32 { return p.x }
```

`wasm-dis` (`./node_modules/.bin/wasm-dis`) of the `-O0` build shows
`(struct.get $1 0 (local.get $0))` and nothing else. For VL's perf consumers (plumb, veldt and
sunsuz), this is the property the design must keep: **a `.` on a value is a load.** The emitter
depends on it too. `exprEffectFree` (`compiler/emit_base.vl:745`) classifies a `Member` node as
effect-free whenever its object is ("reads qualify … it calls nothing"). That classification
decides whether an object literal's fields may be evaluated out of source order (D1510).

**Structural typing does not reach the emitter as dynamic dispatch.** An un-annotated
`function getx(p) { return p.x }`, or a bounded `function getx<T: { x: f32 }>(p: T)`, called with
`P3 = {x, y, z}` and with `Q = {tag, x}`, compiles to **two instances**. Each is a single
`struct.get` at that receiver's own field index (`struct.get $0 0` and `struct.get $1 1`). An
*annotated* structural parameter `p: { x: f32 }` given a `Q` is refused before codegen:

```
an object value of shape Q flowing into {x: f32} drops the field `tag`: type-valid (structural
width subtyping) but not yet supported by codegen — a struct's wasm type is its own field list …
```

So today a record type is two things at once. At a generic or un-annotated position it is a
per-instance monomorphization key. At an annotated position it is a concrete WasmGC layout. §C
turns on that split.

### A2. A zero-argument UFCS method costs nothing once optimised

`p.x()` with `function x(self: P): f32 { return self.a }` runs and prints the field. At `-O0` it
is one extra `return_call $x` into a `struct.get`. The same loop was written twice, once with the
field (`s = s + p.x`) and once with the method (`s = s + p.x()`), each summing 100 elements:

| build | field `p.x` | method `p.x()` |
| --- | --- | --- |
| `-O0` | 2,418 bytes | 2,452 bytes, plus one `return_call` per read |
| `-O` | 406 bytes | 426 bytes; **function bodies identical**, and the only diff is one unused leftover `(type …)` |
| `-O3` | 348 bytes | 362 bytes; **the wat is identical except the `vl-src` custom section's size** |

**So a getter is not a performance feature in VL.** It changes the syntax only: `v.x` instead of
`v.x()`. Every argument for getters below is about spelling, encapsulation or evolvability, never
about speed.

Three facts about how members resolve today bound the design:

- **A field beats a method of the same name.** With a field `x` and a `function x(self: V)`, `v.x`
  reads the field and `v.x()` is `called value is not a function (f32)`. This is B14 (`DECISIONS.md:1590`):
  "a callable *field* wins, else a free `self`-function".
- **A method is not readable without parentheses.** `v.x` with only `function x(self: V)` in scope
  gives `no field 'x' on V`.
- **A method is not a bound value.** `const f = v.x` gives `no field 'x' on V`. What `c.area`
  without `()` should mean is an open surface decision (`ROADMAP.md:80`, "B14 `c.area` as a bound
  value"). **A getter design takes that syntax for itself** (§D3).

### A3. What `.x` does on a newtype

- **Newtype over a scalar** (`type Meters = new f64`): `m.x` gives `member access '.x' on non-object
  Meters`. On the S3 branch, `f32x4(1.0, 2.0, 3.0, 4.0).x` gives the identical message, with
  `F32x4` in place of `Meters`. That is D1980's witness. A scalar newtype has **no fields at all**,
  so a getter on it could never be ambiguous with a field.
- **Newtype over a struct** (`type V = new { x: f32, y: f32 }`): `v.x` reads the field, and
  **`v.x = 9.0` writes it, from any module**. The brand prevents confusing one type with another.
  It hides nothing. VL has no module-private field and no `readonly` field (`type V = { readonly
  x: f32 }` is a parse error).

### A4. The one property syntax VL already has is compiler-owned, and so is its read-only rule

`xs.length` and `s.length` are compiler-known members. B6 (`DECISIONS.md:1629`) rules this
already, and it is the nearest existing ruling to the question here:

> Size members follow the uniform-access principle. `length` is a contract member via property
> syntax, dispatched to a native lowering … Property syntax (no parens) is reserved for O(1)
> members (`length`/`count`); computing ops (`push`/`map`/`slice`) are methods (parens). `length`
> is read-only.

So VL has **already chosen** that a parenless member means an O(1) read and that property syntax
can be read-only. What it has not chosen is **who may declare one**. Today only the compiler
can. A user's `function length(self: T)` is callable as `t.length()`, and `t.length` gives
`no field 'length' on T`.

**The read-only half of B6 is enforced only by an emitter floor.** `xs.length = 1` and
`s.length = 1` are both `vl check` clean. `vl run` then fails with `emitProgram: field assignment
but no struct type declared`. That is a clause-2 violation: the checker owed this diagnosis.
Unfiled (§G1).

### A5. How std exposes data it means to be read-only: as writable fields

`Buf = { base, length }` is an ordinary struct, and its header calls `.length` "a plain field
read". `F32View`/`I32View = new { base: i32, length: i32 }` are the **checked** views. Their whole
contract is "one range check at view creation, then each access checks only `0 <= i < length`".
This program is `vl check` clean and runs:

```vl
import { Buffer, f32view, getF32 } from "std:buffer"
const b = Buffer(16)
const v = b.f32view(0, 4)
v.length = 1000
print(v.getF32(900))   // prints 0: a read 3.6 KB past a 16-byte view, and no trap
```

This is not the same defect as ROADMAP row 35. Row 35 forges a `Buf` from a literal. Here the
view is a genuine newtype that `f32view` range-checked, and a field write afterwards defeats its
single guarantee. Unfiled (§G2).

**This is the strongest measured case for a VL property mechanism, and a getter does not fix
it.** A getter `get length(self: F32View)` next to a public, writable field `length` hides
nothing. The fix is a field the checker refuses to write: `readonly` fields, which are A9's
generalisation of the shipped `readonly T[]` (`ROADMAP.md:1960` names "a read-only struct or
field" as the next constructor). §E keeps the two questions apart.

### A6. What a bound means by a field

- `<T: { x: f32 }>` is satisfied **by a field only**. A newtype with `function x(self: V): f32` in
  scope is refused: `V does not satisfy {x:f32}: no x`. This matches `DECISIONS.md:1218`: "a
  UFCS-satisfied value does not satisfy a field bound: the directionality falls out of the
  representation".
- `<T: { x(): f32 }>` is satisfied by that method, and a plain `x: f32` field does **not** satisfy it.
- **A field bound permits a write.** `function setx<T: { x: f32 }>(t: T) { t.x = 9.0 }` compiles.
  After `setx(p)`, the caller's `p.x` prints `9`. The un-annotated `function setx(t)` behaves the
  same. So in VL, `{ x: f32 }` means "has a stored field `x` that may be written", not "`x` can be
  read".
- The refusal message for a field bound ends "the bound needs a field of that type **or a
  `x(self: V, …)` function in scope** at this call". The second half is false: the witness above
  has exactly that function in scope and is still refused. Unfiled (§G3).

### A7. The literal lane index, and the substitute VL already has

`checkSimdLaneArg` (`compiler/typecheck.vl:23530`) accepts only a syntactic `NumLit` in 0..3 as
the lane argument, and `simdLaneImm` (`compiler/wasmEmit.vl:14255`) reads the same node back as
the immediate byte. A wrapper `function lane(self: F32x4, i: i32): f32 { return
__extract_lane_f32x4__(self as! v128, i) }` is refused inside the wrapper itself. That is D1980's
second half.

**But VL can already express "one of four known integers" as a type**, a literal union. With
`type Lane = 0 | 1 | 2 | 3` and `function pick(i: Lane)`:

| call | outcome |
| --- | --- |
| `pick(2)` | runs |
| `pick(5)` | `argument 1: expected Lane, got i32` (refused at compile time) |
| `let k = 2; pick(k)` | `expected Lane, got i32` (a plain non-literal is refused) |
| `const k: Lane = 2; pick(k)` | runs (a value already typed `Lane` is accepted) |

So a std wrapper whose body is a four-arm `==` ladder, each arm passing a *literal* to the
intrinsic, compiles today with no compiler change:

```vl
function lane(self: F32x4, i: 0 | 1 | 2 | 3): f32 {
  const r = self as! v128
  if i == 0 { return __extract_lane_f32x4__(r, 0) }
  if i == 1 { return __extract_lane_f32x4__(r, 1) }
  if i == 2 { return __extract_lane_f32x4__(r, 2) }
  return __extract_lane_f32x4__(r, 3)
}
```

Measured on the S3 compiler, with `v` loaded from a `Buf` so that nothing constant-folds away:

| program | `-O0` `extract_lane` count | `-O` | `-O3` |
| --- | --- | --- | --- |
| direct accessor `function y(self: F32x4) { … extract(…, 1) }`, `v.y()` | 2 (1 in `y`, 1 in std) | **1** | **1** |
| literal-union `v.lane(2)` | 5 (the ladder's four, plus std's) | **1** | **1**: `(f32x4.extract_lane 2 (v128.load align=1 …))`, the same shape as the direct accessor |
| `v.lane(k)`, where `k: Lane` comes from `pickLane(b.loadI32(16) + 2)` at runtime | 5 | 4, plus branches | 4, plus branches |

(`match` over a literal union is refused today, with a message that points at the `==` chain.
The ladder is written in the form VL accepts.)

That makes the literal union a **compile-time-checked lane index with no language change**. It
has one semantic difference from O3's wording, which F3 puts to the owner. A runtime value that
is already typed `Lane` is accepted, and it costs a four-way branch rather than being refused.
The default build is unoptimised (`open-rulings.md` "O-default-build-optimizes"), and at `-O0` a
literal `v.lane(2)` costs a call and up to three compares. veldt and sunsuz build their
releases at `-O3`.

### A8. Summary of probes

| # | probe | outcome |
| --- | --- | --- |
| 1 | field read `p.x` | `struct.get`, one instruction |
| 2 | generic / un-annotated `p.x` over two shapes | one instance per receiver, each a `struct.get` at its own index |
| 3 | annotated `{x: f32}` given a wider struct | check reject, "type-valid … not yet supported by codegen" |
| 4 | UFCS `p.x()` vs field in a hot loop | identical wasm at `-O` / `-O3` |
| 5 | field and method both named `x` | field wins; `v.x()` is "called value is not a function" |
| 6 | `v.x` / `const f = v.x` with only a method | `no field 'x' on V` (both) |
| 7 | `.x` on `new f64` / on `F32x4` | `member access '.x' on non-object …` |
| 8 | `v.x = 9.0` on `new {x, y}` | writes, from any module |
| 9 | `xs.length = 1`, `s.length = 1` | check clean, then emit floor (§G1) |
| 10 | `view.length = 1000` then `getF32(900)` | runs, reads outside the view, no trap (§G2) |
| 11 | `<T: {x: f32}>` with only `x(self)` | refused; message offers a fix that does not work (§G3) |
| 12 | `<T: {x: f32}>` body writes `t.x` | compiles, and the caller sees the write |
| 13 | `lane(self, i: 0\|1\|2\|3)` ladder | runs; one `extract_lane` at `-O`/`-O3` |
| 14 | wrapper forwarding `i: i32` to the intrinsic | refused inside the wrapper (D1980) |

---

## B. Survey

The **field privacy** and **structural** columns are the ones that decide VL's answer.

| language | getters? | fields private? | structural? | does a getter satisfy a field requirement? | notes |
| --- | --- | --- | --- | --- | --- |
| **C#** | yes, `{ get; set; }`, auto-properties, `init` | yes | no | an interface declares *properties*; a field cannot implement one | Framework Design Guidelines: use a method, not a property, when the operation is much slower than a field access, has side effects, or returns a different value each call. Changing a field to a property is source-compatible and binary-breaking. Extension properties arrived only in C# 14, eighteen years after extension methods |
| **Swift** | yes: stored and computed `var`, `get`/`set` | yes | no (nominal protocols) | a protocol requires `var x: T { get }` or `{ get set }`; any property satisfies `{ get }`, and only a settable one satisfies `{ get set }` | the stdlib's `SIMD4` lanes `.x/.y/.z/.w` are computed properties over the subscript. Library evolution lets a non-frozen type turn a stored property into a computed one without an ABI break |
| **Kotlin** | every property is accessor-backed (`val` = get, `var` = get+set) | yes | no | an interface `val` can be implemented by a property with any backing | **smart casts are refused through a property with a custom getter** ("Smart cast … is impossible, because 'p' is a property that has open or custom getter") |
| **JavaScript** | `get x() {}` on classes and object literals | `#private` (ES2022) | yes (duck typing) | there are no static requirements | **object spread `{...o}` copies own enumerable properties**: an object-literal getter is *invoked* and snapshotted, while a class getter lives on the prototype and is *dropped* |
| **Python** | `@property` | by convention (`_x`) | duck typing, plus `Protocol` | mypy: a protocol attribute `x: int` needs a settable attribute; `@property def x` in a protocol is satisfied by either kind | PEP 8: "Avoid using properties for computationally expensive operations; the attribute notation makes the caller believe that access is (relatively) cheap." |
| **Rust** | **no**, deliberately | yes | no (traits are nominal) | traits have no fields; RFC 1546 "fields in traits" was postponed | a field access never runs user code (`Deref` is the one exception), and the borrow checker can split a borrow across *fields* but not across *methods*. API guideline C-GETTER: the getter is named `x()`, not `get_x()` |
| **Go** | **no** | yes (lower-case) | **yes: interfaces are method sets** | **never**: an interface holds only methods, so a field cannot satisfy one | Effective Go: the getter for field `owner` is `Owner()`, not `GetOwner()`. Go 1.18 generics **cannot read `x.f` through a type parameter** even when every type in its set has `f` |
| **Zig** | **no** | no | no | — | "No hidden control flow. If Zig code doesn't look like it's jumping away to call a function, then it isn't." `comptime` parameters exist, and `@shuffle` needs a comptime mask |
| **Nim** | **no getter syntax is needed**: `proc x(v: Vec): float` reads as `v.x` through method-call syntax | yes (a `*` export marker) | no | — | the manual: "Nim has no need for get-properties: ordinary get-procedures that are called with the method call syntax achieve the same. But setting a value is different; for this a special setter syntax is needed" (`` proc `x=` ``). **This is the closest analogue: UFCS plus parenless calls** |
| **D** | UFCS plus optional parentheses: `a.foo` calls `foo(a)`; `@property` | yes | no | — | `@property` semantics were never settled and the attribute is effectively a no-op. The ambiguity is between `a.f` returning a delegate and `a.f()` calling it, and over what `&a.f` means |
| **Scala** | uniform access: a parameterless `def x` and a `val x` look the same to callers | yes | no | a `val` may override a parameterless `def` | Meyer's principle (OOSC): services "available through a uniform notation, which does not betray whether they are implemented through storage or through computation". **Scala 3 dropped auto-application**: whether a member is called with `()` is fixed where it is declared, not at the call |
| **TypeScript** | `get`/`set` accessors | `private`/`#x` | **yes** | **yes: a class with `get x()` satisfies `{ x: number }`** | a get-only accessor is inferred `readonly`, **but `readonly` does not affect assignability** (microsoft/TypeScript#13347, open since 2017). So `const p: { x: number } = new C(); p.x = 1` type-checks and throws a TypeError at runtime in strict mode |
| **WGSL / GLSL** | swizzles built in, on vector types only | — | — | — | `.xyzw`/`.rgba`, 1–4 letters, and the two letter sets cannot be mixed. WGSL allows a single component as an assignment target but not a multi-letter swizzle; GLSL allows one without repeated letters. **The compiler knows the vector types; nothing user-defined gets the syntax** |

What the survey says, stated as findings:

1. **Getters come paired with field privacy.** C#, Swift, Kotlin, Python, Go, Rust and Nim all let
   a field be hidden, and in each of them a large share of getter use is "expose a private field
   read-only". Zig has no privacy and no getters. VL has no privacy, so that use is not
   available to it (§A3), and it would need `readonly` fields first (§A5).
2. **Every structural language that admits getters into structural requirements pays for it in
   write soundness.** TypeScript is the worked instance (#13347). Go is structural and took the
   other branch: interfaces are methods only, so a field never satisfies one. Swift and mypy
   answer it by writing the read/write distinction **into the requirement** (`{ get }` against
   `{ get set }`, a `@property` protocol member against a plain attribute).
3. **The two UFCS languages, Nim and D, got getters "for free" by making calls parenless.** D's
   experience is the warning: two decades of `@property` debate, because a parenless call and a
   function value compete for one spelling. That is VL's open B14 `c.area` question. Scala 3
   independently moved the other way and fixed parenlessness at the declaration.
4. **"A field access is a load" is a stated design value in the performance-first languages.**
   Rust, Zig and Go say so. C# and Python put it in their guidelines as "a property should be
   field-cheap", which nothing enforces.
5. **Vector swizzles are compiler-known on compiler-known types**, and nowhere a user feature.
   Swift, the one general-purpose language with named SIMD lanes, spells them as ordinary
   computed properties in its stdlib (the survey's own judgement: Swift has no `.xyz` swizzle
   properties that I can find; multi-lane selection there goes through index vectors).

---

## C. The VL-specific crux: does a getter `x` satisfy `{ x: f32 }`?

### C1. What `{ x: f32 }` means today

§A establishes four things a record type does in VL, each measured:

1. **At an annotated position it is a WasmGC layout.** The refusal says "a struct's wasm type is
   its own field list" (§A1, probe 3).
2. **It permits a write** (§A6, probe 12), and the write is visible to the caller because objects
   are references (B14: "mutation is free, objects are refs").
3. **It is a narrowing place.** `docs/guide/narrowing.md`: "a narrowing is a fact about a place —
   a name (`x`) or a property path (`o.v`, `x.y`)". A property path narrows because two reads of
   a field with no write between them agree.
4. **It is satisfied by stored fields only.** A method does not satisfy a field bound
   (`DECISIONS.md:1218`, probe 11).

### C2. If the answer is YES (getters participate structurally)

- **Annotated positions cannot honour it without a copy.** A getter-backed `F32x4` has no
  `{x: f32}` layout. Passing it to `p: { x: f32 }` would mean building a struct at the boundary,
  a snapshot. `p.x` would then be the value at call time, not a live read, and a write to `p.x`
  would land on the temporary and vanish. That is **check-clean wrong output**, the clause-1
  class this repo ranks worst. This is JavaScript's spread behaviour (§B) given a static type
  that promises otherwise.
- **So YES would in practice mean "YES at generic and un-annotated positions, NO at annotated
  ones".** Monomorphization already produces one instance per receiver (§A1). A getter receiver
  would get an instance whose `.x` is a `call` instead of a `struct.get`, and that is cheap:
  once inlined it is the same wasm (§A2). But the answer would then depend on *where the value
  is delivered*. CLAUDE.md's position-matrix and "two faces, two clauses" rules exist because
  positional splits like this are where silent defects live.
- **Writes become an instantiation-time refusal.** `setx<T: {x: f32}>(t)` compiles on its own
  (probe 12). A getter-only receiver would have to be refused **at the pin**, with the error
  reported at a distance from the body that writes. The check-reject audit
  (`docs/internals/check-reject-audit-2026-09.md`) found eleven converted rows that were exactly
  a refusal "the checker owed at the DIRECT spelling and had merely lost at a monomorphization
  pin". This option would add such a refusal on purpose.
- **Narrowing needs Kotlin's rule, applied per instance.** `if t.v != null { use(t.v) }` narrows
  a field path. Through a getter, two reads need not agree, so narrowing must be withdrawn. In a
  generic body, the checker does not know whether it is looking at a field or a getter until the
  instance exists.
- **Tooling.** In a generic body, hover, go-to-definition and rename on `t.x` would each have to
  answer "field in one instance, function in another".
- **Checker cost.** `checkMemberNode` (`typecheck.vl:35201`) would gain a getter arm for every
  receiver kind (struct, newtype, hole, bounded type parameter), and bound satisfaction
  (`DECISIONS.md:1218`) would gain a second judgement. **Judgement:** this is weeks of work,
  and the kind that produces the position-dependent rows this tree spends most of its effort on.

### C3. If the answer is NO (getters are nominal members only)

- `{ x: f32 }` keeps all four meanings in C1. No existing ruling moves, and
  `DECISIONS.md:1218`'s directionality ("a UFCS-satisfied value does not satisfy a field bound")
  extends unchanged to getters.
- A getter-backed value cannot be passed where `{ x: f32 }` is expected. **That is the Go and
  Rust answer.** A program that wants "anything with a readable `x`" writes a method bound
  `{ x(): f32 }`, which works today (probe `p7b`). Later it could use a **read-only member bound**
  that both fields and getters satisfy, the way Swift's `{ get }` and a mypy `@property`
  protocol member work. In VL's vocabulary that bound would be spelled `{ readonly x: f32 }`,
  reusing the shipped `readonly` keyword. It is additive, and this option leaves it available
  (F5).
- **Cost is local.** A getter is found only through the receiver's *declared name*, by the same
  `homeModuleOf(recvTy)` (`typecheck.vl:22440`) that type-bound UFCS (#3005) already uses. An
  inline structural type has no home module and so has no getters. This is the
  `type-bound-ufcs-design.md` §E boundary, "opt in by being named", and it falls out without a
  special case.

### C4. TypeScript as the cautionary analogue

TypeScript is the one mainstream language as structural as VL, and it chose YES. The result is
the hole in C2, and it is still open. A get-only accessor is treated as `readonly`, `readonly`
is ignored for assignability, and so a getter-only object passes as `{ x: number }` and a write
through that type throws at runtime. TypeScript can afford a runtime `TypeError`, because its
soundness contract is explicitly partial. VL's contract is clause 1 ("if `vl check` accepts
it, it builds and runs correctly"), and it cannot.

### C5. Verdict

**NO.** A getter is a nominal member and never a structural field. This is a measured
conclusion, not taste. Record types in VL are already layouts, write permissions and narrowing
places, and a getter is none of those three.

---

## D. Options

For each option: what it is, where it would be built in this compiler, what it rules out, how
permanent the std names are, how it fits the existing rulings, and what it costs the perf
consumers.

### D1. No getters. Lanes are methods: `v.x()`

- **What.** std exports `x(self: F32x4): f32` and its siblings, reached with no import through
  type-bound UFCS (#3005). O3's "named accessors" would be read as named *methods*.
- **Cost here.** Zero compiler lines. It runs today on the S3 branch (probe `t2`: `v.y()`
  prints the lane; `-O`/`-O3` is one `extract_lane`).
- **Rules out.** Only the parenless spelling. It becomes permanent the moment std ships
  `x()`, because **std has no deprecation story**: adding `get x` later would give a type both
  `v.x()` and `v.x`, or require retracting a std name.
- **Naming.** `x`, `y`, `z` and `w` become permanent exported *function* names in a flat
  namespace. With type-bound UFCS they need no import. But [D1984](inventory/D1984.md) shows that any caller module with its own `x`
  function blocks the fallback. `x` is about the most likely name a graphics program declares
  for itself, for example `function x(self: Vec2)`. Until D1984 is fixed, `v.x()` fails in
  exactly the programs most likely to call it.
- **Rulings.** It agrees with B14 and with the O7 wording ("METHODS on the vector types"). It
  reads O3's `.x` loosely.
- **Perf view.** Ideal: `.` stays a load, and `()` marks every call.
- **Judgement.** This is an honest option, and the survey's Rust/Go/Zig column. It is the right
  answer if the owner's O3 meant "named, not numbered" rather than "parenless".

### D2. Compiler-known lane and swizzle accessors, on vector types only (WGSL style)

- **What.** The checker gives `.x/.y/.z/.w` (and perhaps `.xyz`, `.rgba` …) to vector types
  directly. The emitter lowers `.x` to `extract_lane 0` and `.xyz` to a `shuffle`.
- **Cost here, and the obstacle.** **The compiler cannot tell `F32x4` from `I32x4`.** In
  `std/simd.vl` both are `new v128`, identical except for their names (S3's `tyIsV128Brand`
  answers yes for every brand). `f32x4.extract_lane` and `i32x4.extract_lane` are different
  opcodes. So the compiler would need either **std's type names hard-coded in the checker**
  (breaking the `std:buffer` O1 precedent: "I don't want buffer built into the compiler; I want
  it in std"), or **a new lane-shape annotation on the brand** (`new v128<f32x4>` or similar),
  which is a new language feature anyway, and one less general than D3.
- **Swizzles cost.** A four-lane type has 4⁴ + 4³ + 4² = 336 multi-letter `xyzw` swizzles, and
  as many again for `rgba`. They can only be generated. They also return *vectors*, so each one
  lowers to an `i8x16.shuffle` with a 16-byte immediate.
- **Rules out.** It makes SIMD types special in the checker for good. Nothing else, for example
  a packed `Color = new i32`, can have `.r`.
- **Rulings.** It conflicts with O1 (library, not builtin) and O9 (`v128` is only a substrate).
  O10 already rules arbitrary static shuffles "permanently optional", and swizzle properties are
  exactly that feature under another spelling.
- **Perf view.** Good: each accessor is one instruction.
- **Judgement.** Reject. Swizzles have no consumer ask behind them. veldt's WGSL does use
  `.xyz`, but its CPU-side kernels do not need a swizzle family, and a named shuffle
  (`reverseF32x4`, …) covers the permanent surface O10 rules.

### D3. General getters

#### D3a. Declared, nominal-only, read-only: `get x(self: T): R`

- **What.** A new declaration form, `export get x(self: F32x4): f32 { … }`. It spells like a
  `self`-function with the keyword `get` in place of `function`, as TypeScript and JavaScript
  spell `get x()`. Rules:
  1. **Resolved type-bound only.** On a field miss, `v.x` asks `homeModuleOf(typeOf(v))` for a
     getter named `x`, and only that module (the orphan rule, as for operators in #3003). A
     getter is never looked up lexically, so an import cannot bring one into scope and a local
     `x` cannot shadow one. That makes it immune to D1984 by construction.
  2. **A field wins**, as it does for methods under B14. For a struct-backed newtype, a getter
     with the same name as a field is a declaration-time error (it could never be reached).
  3. **Read-only.** `v.x = …` is a check error naming the getter. There are no setters in v1:
     on a *value* type like `F32x4`, a setter needs write-back semantics (C# refuses
     `list[0].X = 1` with CS1612; Swift builds get/modify/set accessors). `withLane` covers that
     need explicitly.
  4. **Never structural** (§C5), and **never a narrowing place**. A getter path behaves like a
     call result for narrowing (Kotlin's rule).
  5. **Zero-argument, with a CHECKED body contract (§D3a-contract below).** B6 says property
     syntax is reserved for O(1) members. VL checks that rule where C# and Python only state it
     in a guideline.

- **Where it goes.**
  - Parser: `get` as a contextual keyword at declaration start, followed by an identifier and
    `(`. `get` stays usable as an identifier everywhere else; `xs.get(i)` is untouched.
  - Checker: one new rung in `checkMemberNode` / `memberFloorErr` (`typecheck.vl:35201`,
    `:18580`), and a refusal in the assignment-target arm.
  - Body contract: **one walk over the getter body** at its declaration, plus a cycle check over
    the getter-to-getter call graph (which contains only getters, so it is small). The walk is
    a `_`-less match over node kinds, so a node kind nobody has classified is refused until
    someone classifies it. The contract errs toward refusing, in the same direction it will
    later relax. The same walk checks each node's checker type against the non-boxing rep
    list (F9 (a)), so the type rule costs no second pass.
  - Lowering: **rewrite the `Member` node into a `Call` before emit**, so the emitter's "a member
    read is a load" assumption (`exprEffectFree`, §A1) stays true without teaching the emitter
    anything. The rewrite has to preserve source evaluation order; a probe in the same shape as
    D1510 with overloaded `"[]"` confirms that call-shaped member operators keep it today.
  - LSP: the semantic token is `property` with a modifier (the legend has `property` and
    `method`, `lsp/src/typeFeatures.ts:50`). Completion kind is `Property`, and
    go-to-definition lands on the `get` declaration.
  - **Estimate (judgement):** days, not weeks. It is the #3005 rung again, on the member path
    instead of the call path.
- **Rules out.** It does **not** rule out B14's `c.area` as a bound method value, because a
  getter is declared as one and a method stays a method (compare D3b). It rules out a
  getter-only value being passed as a record type, which is intended (§C). It uses the word
  `get` in declaration position.
- **Naming.** std's `get x(self: F32x4)` makes `x` a permanent *member* of `F32x4`, not a
  flat-namespace function, so it costs nothing in the import namespace. **This is the first
  std naming decision where a name is scoped to a type**, which fits the direction #3001 and
  #3005 set.
- **Rulings.** It fulfils O3's `.x` literally and O7's "accessors are part of the vector type".
  It extends B6 from compiler-owned to user-declarable members, under B6's own O(1) contract. It
  is consistent with #3003's orphan rule and type-bound resolution.
- **Perf view.** `.` stops being a guaranteed load on a *nominal* type whose module declares
  getters. At `-O`/`-O3` the measured cost is zero (§A2), and the body contract caps it at tiers
  1–2 at every level. The readability cost is real: a reader of `v.x` has to know that `F32x4`
  is a getter type. Mitigations are the semantic token and
  the fact that getters exist only on named types, never on `{ … }`.

##### D3a-contract. The v1 getter body is checked, not trusted

A getter body is refused unless it is:

- **Loop-free and recursion-free.** It contains no `for` or `while`, and it has no cycle through
  other getters.
- **Allocation-free.** It makes no heap allocation, in the GC heap or in linear memory. A
  `let`/`const` local is fine, because it is a wasm local. The walk refuses construction of a
  struct, list, map, string or closure, string `+` and interpolation, and `Buffer(n)`.
  `Buffer(n)` is also an effect, because it moves the allocator's bump pointer. Allocation that
  VL's rep choice adds without any source syntax is covered below.
- **Effect-free.** It writes only to its own locals. It makes no extern or host calls. It reads
  no mutable module state: `self`'s fields and module `const`s are fine, and a module `let` is
  not. A trap is permitted (an `as!`, or an integer division); by the same reasoning as
  `exprEffectFree`, the program dies either way.
- **Calls intrinsics and other getters only.** No user or std function is callable, no function
  value, and no user operator overload, because `"+"` on a nominal type is an ordinary function
  call.

**Branches are allowed.** `if` and `match` expressions are fine: cost is bounded by the longest
path, and a simple fork often lowers to `select`.

The contract aims at the first two of four cost tiers:

1. **a load**: `.x` reads one field or one lane;
2. **straight-line bounded**: a few loads, ALU ops, compares and branches, such as a packed
   `Color`'s `(self as i32 >> 8) & 255`;
3. **O(1) but allocating**: excluded. It fails the "surprised in a loop" test, because a reader
   of `p.name` in a hot loop does not expect a heap allocation per read;
4. **unbounded**: excluded.

Every getter O3 and E2 name fits. `get x(self: F32x4): f32 { __extract_lane_f32x4__(self as!
v128, 0) }` is tier 1, and a packed-scalar part is tier 2.

###### Implicit allocation from rep choice

A syntax-only walk misses one kind of allocation. **VL boxes some values without any source
syntax**, depending on the rep it chooses for a type. I measured this with `dist/vl` on master:
each function below reads fields of `self` and returns without writing a constructor, and I
counted allocating instructions in its `-O0` body with `wasm-dis`:

| result (or intermediate) type | wasm result | allocating instructions |
| --- | --- | --- |
| `i32 \| string` | `(ref $box)` | 2 `struct.new` (payload box, then tag box) |
| `i32 \| i64` | `(ref $box)` | 3 `struct.new` |
| `i32 \| null` | `(ref $box)` | 2 `struct.new` |
| `f32 \| null` | `(ref $box)` | 2 `struct.new` |
| `A \| B` (two structs, returning a field as-is) | `(ref $box)` | 1 `struct.new` (the `{i32 tag, anyref}` box) |
| a scalar result with an `i32 \| string` *local* | `i32` | 3 `struct.new` at `-O0`; 0 at `-O3`, once binaryen scalarises it |
| `Q \| null` (nullable struct) | `(ref null $Q)` | none (the null niche) |
| `string \| null` | `(ref null $str)` | none |
| `boolean \| null` | `i32` | none (an i32 niche) |
| `"lo" \| "hi"` (string literal union) | `(ref $str)` | none (each literal is a module global) |
| `i32 \| string`, forwarding a field of that type unchanged | `(ref $box)` | none (the existing box is returned) |

So whether a getter allocates depends on its **types**, including the types of its locals, and
not only on its syntax. The last row shows the dependence cuts both ways: the same union type
allocates when a value is widened into it, and costs nothing when an existing box is passed on.

Two ways to close this:

- **(a) Restrict the types.** A getter's result, and every local and intermediate value in its
  body, must have a rep that never boxes. From the table, that means:
  - a scalar (`i32`, `i64`, `f32`, `f64`, `boolean`, `u8`, `v128`) or a `new` brand of one;
  - a literal union (int literals lower to `i32`, string literals to globals);
  - a reference to an existing struct, string, list or map;
  - the null niches: a nullable struct, `string | null`, `boolean | null`.

  Excluded: value unions (`i32 | string`, `i32 | i64`, a union of structs) and nullable
  scalars (`i32 | null`, `f32 | null`). The checker decides this from types alone, before any
  rep is chosen, and a refusal names the offending type.
- **(b) Check after rep selection.** Let the emitter reject a getter whose emitted body
  contains `struct.new`, `array.new` or an allocating helper call. This is exact, and it
  admits the forwarding row. But the refusal would come from the emitter, as a clause-2-shaped
  error. It would depend on the rep choice of the day, which this repo's rep campaigns change
  often. And it would reach the author as an instruction they never wrote.

**Recommend (a) for v1** (F9). It is predictable, it can be explained in one sentence ("a
getter traffics in scalars and existing references"), and every getter known today returns a
scalar: SIMD lanes, packed-scalar parts and `length`-style counts. The cost is that it also
refuses the forwarding row, which does not allocate. That is the conservative direction, and
the function-effects design can relax it.

**This is deliberately conservative, and it will be relaxed, never tightened.** A separate
design, `docs/internals/function-effects-design.md` (in a parallel PR), infers or marks
functions as pure and bounded. Once it lands, a getter may call such functions as well as
intrinsics. Loosening the contract turns refusals into programs that compile. Tightening it
later would break getters that already compile, and std has no deprecation story for that.

#### D3b. Implicit parenless calls (Nim / D style)

- **What.** Any zero-argument `self` function may be read without parentheses: `v.x` means
  `x(v)` on a field miss.
- **Cost here.** Smaller than D3a: no parser change, and the same checker rung.
- **Rules out.** **B14's bound-value question is decided by accident**: `c.area` becomes a call
  and can never be a function value. It also makes every zero-argument method a property
  (`v.normalize`, `xs.reverse`), which **contradicts B6's rule** that parens mark computing
  operations. Scala 3 abandoned auto-application for exactly this reason, and D shows the long
  tail of the ambiguity.
- **Naming.** std can no longer choose which zero-argument exports read as data. Every one
  already shipped (`reverse`, `normalize`, `f32base`, …) becomes parenless-readable
  retroactively and permanently.
- **Judgement.** Reject. It is the cheapest option and the one whose side effects are decided
  by nobody.

#### D3c. Structural-participating getters

Rejected by §C. Listed so that the option appears in the record as considered.

### D4. Compile-time literal parameters (`lane(self, const i: 0 | 1 | 2 | 3)`)

- **What.** A parameter marker meaning "every call site passes a literal, or passes a `const`
  parameter of the enclosing function". The monomorphizer specialises per literal value, so the
  intrinsic inside sees a literal.
- **Cost here.** A parser marker (`const` in a parameter list is a parse error today), a
  call-site check that generalises `checkSimdLaneArg`, and a specialisation key in the
  monomorphizer (`emit_mono.vl`) that includes a literal *value* for the first time. **This is
  const generics in all but name.** O10 rules const generics out *as a dependency of the SIMD
  type family*, and this would introduce the same machinery for parameters.
- **Is it needed?**
  - **One lane parameter: no.** §A7 measures the literal-union ladder at zero compiler lines
    and one instruction at `-O`. A 16-lane `U8x16` in S4 is a 16-arm ladder with the same
    folding (not measured beyond four lanes).
  - **Four or sixteen lane parameters** (a general `shuffle(a, b, i0, i1, i2, i3)`): a ladder
    over 8⁴ = 4,096 combinations is not writable, so this is where D4 would be needed. **O10
    already rules general static shuffles permanently optional.** The named shuffles std
    writes (`reverseF32x4`, the shuffles inside `cross`) pass literals directly, as the S3
    `cross` already does.
- **Rules out.** Nothing if deferred. Building it now introduces a monomorphization key the
  owner declined for the type family.
- **Judgement.** Defer. It has no ruled consumer. File it as the answer if a consumer shows
  that named shuffles are insufficient.

### D5. Combinations

Each of D1, D3a and D4 settles one question independently:

| question | options |
| --- | --- |
| what the lane read is spelled with an index | `v.lane(2)` via a literal union (A7), or `v.lane(2)` via D4 |
| what the named-lane read is spelled | `v.x()` (D1), `v.x` (D3a), or `v.x` (D2) |
| how read-only data is exposed | writable field (today), getter plus private field (VL has no private fields), or `readonly` field (A9) |

The recommendation in §E takes one answer from each row.

---

## E. Recommendation

### E1. Are getters good language design?

**Judgement:** yes, **where a field can be private**. There the getter is how a type exposes
state without giving up its invariants, and uniform access lets a stored value become computed
without breaking callers (C#, Swift and Kotlin all rely on this). They are poor design where
they make a `.` run arbitrary code **invisibly on structural types** (TypeScript's hole, §C4),
or where they arrive by making calls parenless (D's `@property`, Scala 2's auto-application).

### E2. Are they good for VL?

**A narrow form, and not for the reason most languages have them.**

- VL has no private fields, so the main use (a read-only view of private state) is not
  available. The measured read-only problem (§A5) needs **`readonly` fields**, not getters.
- VL's methods already cost nothing at `-O`/`-O3` (§A2), so there is no performance case.
- What remains is real:
  1. **Named parts of opaque nominal values:** a SIMD lane, a packed `Color = new i32`'s
     `.r/.g/.b/.a`, veldt's 2-byte voxel record packed into a scalar. These types have *no
     fields*, so a getter cannot be ambiguous with one, and `p.x * q.y - p.y * q.x` is the
     notation every graphics author writes.
  2. **Uniform access for std, which has no deprecation story.** A std type that exposes a field
     today (`Buf.length`) can never make it computed. A declared getter gives std one way to
     evolve that does not need a retraction.
  3. **O3 already rules `.x`.**
- **The perf consumers' objection has a checked answer.** Their objection is "a `.` is no longer
  a load". Under the v1 body contract (§D3a-contract), a getter read costs a load or a short,
  bounded, allocation-free, effect-free sequence, and the compiler checks this. Convention would
  not be enough for plumb, veldt and sunsuz, and a guideline nothing checks would not survive
  the first user getter that allocates.

So: **adopt D3a (declared `get`, nominal-only, read-only, type-bound, never structural, never a
narrowing place, lowered as a call, with a body checked against the v1 contract), and reject D2,
D3b and D3c.** Separately, **route
read-only-ness to A9 `readonly` fields**. That fixes §A5 and §G1 and gives the future bound
`{ readonly x: f32 }` (F5) its meaning.

### E3. The smallest thing that unblocks SIMD lane reads now

1. **Ship `lane(self: F32x4, i: 0 | 1 | 2 | 3): f32` and `withLane(self: F32x4, i: 0 | 1 | 2 | 3,
   x: f32): F32x4` in `std:simd`** as literal-union ladders over the existing intrinsics.
   There are zero compiler lines, the index is range-checked at compile time, and a literal
   index is one `extract_lane` at `-O`/`-O3` (§A7). The exact spelling (`lane` or
   `laneF32x4`) is F4.
2. **Do not ship `x()`/`y()`/`z()`/`w()` methods.** They would permanently claim the names that
   D3a's getters want (§D1, "rules out"). A caller who wants named lanes before getters exist
   writes `v.lane(0)`.
3. **Build D3a as its own slice.** When it lands, std adds `get x/y/z/w` beside `lane`. Both
   stay: `lane(i)` for indexed access, and `.x` for named access.
4. **Leave D4 unbuilt** until a consumer needs more than the named shuffles.

What this rules out: nothing that is not already ruled out. `lane` with a literal-union index
is the same wasm whether or not D4 ever exists. `get x` is additive over a std that does not
already export `x`. And `readonly` fields are orthogonal to both.

---

## F. Open questions for the owner

**F1. Getters at all?**
(a) no, and O3's accessors are methods `v.x()` (D1); (b) declared, nominal-only, read-only
getters (D3a); (c) implicit parenless calls (D3b).
*Recommend (b).* (a) is defensible and cheapest, but once std ships `x()` it is permanent.
(c) decides B14's `c.area` question as a side effect and turns every zero-argument std export
into a property.

**F2. Do getters participate in structural types?**
(a) never (§C3); (b) at generic and un-annotated positions only; (c) everywhere, with a snapshot
at annotated positions.
*Recommend (a).* (b) makes the answer depend on the delivery position, and (c) is check-clean
wrong output under mutation (§C2). Generic code over "anything with a readable `x`" uses
`{ x(): f32 }` today and `{ readonly x: f32 }` later (F5).

**F3. Is O3 satisfied by a literal-union lane index?**
(a) yes: `i: 0 | 1 | 2 | 3`, where a bare `i32` is refused at compile time, a value already typed
`Lane` is accepted, and a runtime `Lane` costs a four-way branch (§A7); (b) no: O3 means
*syntactically* literal, so build D4 (const parameters) first; (c) (a) now, with a lint that
flags a non-literal `Lane` argument.
*Recommend (a).* It meets O3's purpose, which is that no out-of-range or unchecked index reaches
the immediate. It also delivers O3's deferred runtime-index fallback more cheaply than the spill
O3 imagined, and the branch is visible in the parameter's type. (b) builds const generics for a
single-lane read.

**F4. The spelling of the indexed lane read.**
(a) `laneF32x4(v, i)` / `withLaneF32x4`, following S3's width-suffixed family (`addF32x4`) and
simd-design §D4's own name; (b) `lane` / `withLane` unsuffixed and reached type-bound, following
S3's `dot`/`cross`/`normalize`.
*Recommend (b) once D1984 is fixed, (a) until then.* Unsuffixed names are the direction #3005
exists for, and there is one `lane` per vector type. But while D1984 is open, a caller with its
own `lane` function breaks `v.lane(…)`. This question is about std's naming convention for
SIMD, and S3's review may already have settled it.

**F5. A read-only member bound, `{ readonly x: f32 }`?**
Satisfied by a field or a getter; the body may read `t.x` and never write it. It is Swift's
`{ get }` and mypy's `@property` protocol member.
*Recommend: rule the meaning now and build it later*, alongside `readonly` fields (A9). Nothing
in D3a needs it, and ruling it now stops the next person from reaching for option F2(b).

**F6. `readonly` fields, and the checked views.**
§A5's `view.length = 1000` defeats `F32View`'s only guarantee.
(a) make the views' `base`/`length` `readonly` once A9 fields exist; (b) meanwhile, move the
views' fields behind getters. VL has no private fields, so (b) would need the stored fields
renamed to something a caller would not write (the rejected `.raw` pattern, `newtype-design.md`
§2.2). (c) accept it and document it in `std:buffer`'s header.
*Recommend (a), with (c) until then.* A one-line header sentence costs nothing, and getters
cannot do the job.

**F7. Setters.**
*Recommend: none in v1, and none planned.* A value-type setter (`v.x = 1` on an `F32x4`) needs
write-back semantics (C#'s CS1612, Swift's modify accessors). `withLane` says what happens.
Revisit only if a reference type needs a validating setter and `readonly` fields plus a method
do not cover it.

**F8. Adopt the checked v1 getter-body contract (§D3a-contract)?**
(a) yes, as stated: loop-free, recursion-free, allocation-free and effect-free, with branches
allowed, and calls only to intrinsics and other getters. It is relaxed later by
`docs/internals/function-effects-design.md`. (b) Pure by convention, stated as a guideline and
not checked (C#, Python). (c) Stricter: a single expression with no local bindings.
*Recommend (a).* (b) leaves the perf consumers' guarantee unenforced, and the first allocating
user getter would break it silently. (c) gives no cost bound that (a) lacks, since both
stay in tiers 1–2, and it makes multi-step lane or bit extraction harder to read. The rule that matters is
the direction: (a) can only be relaxed. Starting from (b) and tightening later would break
getters that already compile, and std has no deprecation story for that.

**F9. How does the contract see allocation that VL's rep choice adds (§D3a-contract, "Implicit
allocation from rep choice")?**
(a) Restrict the result type and every local to non-boxing reps: scalars and their brands,
literal unions, existing references, and the null niches (nullable struct, `string | null`,
`boolean | null`). Value unions and nullable scalars are refused. (b) Check the emitted body
after rep selection for `struct.new`, `array.new` or an allocating helper.
*Recommend (a).* The check is by type, before emission, and a refusal names the type. Every
getter known today returns a scalar. (b) is exact, but its refusals would come from the emitter
and would shift whenever the rep layer changes.

---

## G. Found on the way (unfiled; no id range was reserved for this doc)

These are measured on master `914d64d65` and not filed, because this change reserves no
inventory ids. Each should be filed from `TEMPLATE.md` under the coordinator's next range.

- **G1. Writing a compiler-known `.length` passes `vl check` and dies in the emitter.**
  `const xs = [1, 2, 3]; xs.length = 1` (and `const s = "abc"; s.length = 1`): `vl check` rc 0,
  then `emitProgram: field assignment but no struct type declared`. This is clause 2, and the
  checker owes the refusal B6 already rules ("`length` is read-only").
- **G2. A checked view's `length` is writable, which defeats the range check.** The §A5
  program: `v.length = 1000` on an `F32View` from `f32view(b, 0, 4)`, then `v.getF32(900)`,
  runs and reads outside the view with no trap. This is distinct from ROADMAP row 35, which
  forges a `Buf` from a literal. Here the newtype value was created and checked by `f32view`,
  and a later field write undoes the check.
- **G3. A field bound's refusal offers a fix that does not work.** `<T: { x: f32 }>` with a
  `function x(self: V): f32` in scope says "the bound needs a field of that type or a
  `x(self: V, …)` function in scope". The function is in scope and the call is still refused,
  which is correct per `DECISIONS.md:1218`. The message should offer only the field, or point
  at the method-bound spelling `{ x(): f32 }`.
