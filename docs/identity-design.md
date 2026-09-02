# Reference identity in VL — `===`, `IdentityMap`, `IdentitySet`

**Status: RULED, 2026-09-01.** The owner took the ten decisions in
`docs/internals/identity-critique-synthesis.md` §4 one at a time; **§0 below is the ruling**
and supersedes the proposal where they differ (P2, P4 and P5 are amended in place). Written
by the tooling track at the owner's request; this is the language question serde decision D
split off (`docs/internals/serde-critique-synthesis.md`, OQ-11 in `docs/serde-design.md`),
and it resolves the half of A15 that `DECISIONS.md` left as "would be `===` or
`identical(a, b)` — deferred". Every fact below marked **(RUN)** was measured on the live
seed on 2026-09-01; the rest was examined by three critics and then ruled on.

The owner's framing, verbatim: *"Reference identity keys are useful for cyclic dependencies,
right? I think it does make sense to support referential equality. Can even use === for
that? Similar to JS? Or is that a footgun?"*

## 0. The ruling

Ten decisions, in the synthesis's order, each as the owner ruled it. Build order and
acceptance are in `ROADMAP.md` A15; the rationale is in `DECISIONS.md` A15.

1. **Spelling: `===` / `!==`.** Kotlin kept `===` with structural `==` and retrofitted
   diagnostics for the value-typed cases; Dart removed it. VL takes Kotlin's route knowing
   Dart's, because the rep restriction (3) is a compile error at every JS-reflex site.
2. **Operands: every reference rep** — struct, list/array, map, function value, or a nullable
   of one — and a **union of struct arms compares the PAYLOAD**, never the per-widening-site
   `{tag, payload}` box: `u === u` is `true` outside an `is` guard. Rides D989's unboxing.
3. **Scalars and `string` are check errors**, and so is any union with a scalar/string arm —
   one template, three arms, rendered at the USER's spelling (a newtype `Id` prints as `Id`,
   never as the erased `string`). A string is a value in VL; `"ab" === "a" + "b"` being
   `false` is exactly the surprise the rule forbids.
4. **`null === null` is `true`, statically.** `x === null` is legal and gets a hint pointing
   at `== null`. No prerequisite: the static fold already exists for `==` (D1018, #2279).
5. **`Map`/`Set` keys: key-eligible = `==`-comparable.** The Rust-style field restriction
   (no `f64`, no lists) was REFUSED — everything `==` accepts keys. Hash and `==` share ONE
   lowering (D1017 is why that matters). Consequences go in the `Map` header rather than
   being special-cased: a NaN inside a struct key is inserted and never found (IEEE; Go's
   behaviour — JS `Map` and Java special-case NaN, VL keeps one relation), the hash folds
   `-0.0` into `0.0` so `0.0 == -0.0` finds its entry, a key mutated after insertion is lost.
6. **`IdentityMap<K, V>` / `IdentitySet<K>` are concrete types that SATISFY `{[K]: V}`.**
   The critics' F9 ("off the interface") was refused: the index signature is the CAPABILITY
   that both `Map` and `IdentityMap` provide, and a signature names `Map<K, V>` or
   `IdentityMap<K, V>` when it wants the specific one. Two things the ruling asked for do
   not exist today and are build items: the concrete names as annotation types
   (`Map<string, i32>` is `unknown type` today — only `{[string]: i32}` works) and TS-style
   explicit type arguments on a call (`Map<string, i32>()` is a parse error today; `Set<T>`
   itself is C2.2, unbuilt).
7. **`K` for the identity containers = anything `===` accepts** — struct, list, map,
   function, nullable, union of struct arms. `flat` classes (field order is byte layout)
   get no serial slot and stay on the scan. And, ruled here because it fell out of (2):
   **functions compare only by `===`.** `==` on two functions becomes a check error
   pointing at `===`, and a struct with a function field refuses `==` by field name (Go's
   rule). Today's `==` lowering on functions (table index + `ref.eq` on the captured
   environment) becomes the `===` lowering: `mk(1) === mk(1)` is `false` with equal
   captures; `const a = f; const b = f; a === b` is `true`.
8. **Generics refuse per instance, at the call, on the offending argument** — the body's
   `===` is an inferred constraint on `T` like `+` is today
   (`operator '+' is not defined for boolean and boolean (the call's argument types)`).
   **A newtype has exactly its base's identity**: over a struct, `===` is identity of the
   underlying object; over a scalar or string it is (3)'s error rendered as the brand name;
   cross-brand `===` rejects like every mixed-brand operator.
9. **Six doc corrections**, all made in the same PR as this section: "A custom `==`
   overrides" deleted (there is no custom `==` — `function "=="` is a parse error); the A15
   bullets rewritten; §3 below cites Kotlin only (Swift's `===` is `AnyObject`-restricted, a
   different shape) with the Dart note; `Map` joins the `===` operand list; OQ-11 closes;
   key-eligibility text says `==`-comparable.
10. **Ship the flat scan first; the serial only when a program measures the scan as a
    problem.** The API is identical either way, so nothing waits on it. When built: lazy
    `i64` on a private heap type per keyed class (the `repCanonKey` seam), 0 = unassigned,
    mixed through `fbI32HashMix`, resolved by `ref.eq` (a SEED, never an identity);
    prerequisite is a declared-vs-rep field split in the emitter; acceptance is the
    synthesis's §2c four cells plus the N/4N timing probe.

## 1. What is already true

VL structs, arrays and maps are shared WasmGC references with **structural `==`**. Both halves
are observable today **(RUN)**:

```vl
type P = { x: i32, y: i32 }
const a: P = { x: 1, y: 2 }
const b: P = { x: 1, y: 2 }
print(a == b)      // true  — structural: same contents, different objects
const c = a        // alias
c.x = 9
print(a.x)         // 9     — the write through c is visible through a
print(a == b)      // false — a is {9,2} now, b is still {1,2}
```

So *identity already exists* — a program can tell two structurally-equal objects apart by
mutating one and reading the other. What VL lacks is a way to **ask** the question directly.
Refusing the operator does not remove the concept; it forces graph, DAG and cycle-detection
code to fake it with serial numbers of its own.

Other measured ground truth **(RUN)**:

* `===` is a parse error today (`expected an expression but found EQUAL`).
* `==` on **function values is identity**: `const a = f; const b = f; a == b` → `true`,
  `a == g` → `false` for a `g` with the same body. This is A15's "data by value, functions by
  identity" rule, live.
* A struct-keyed map is refused at the checker: `A P-keyed Map isn't supported yet —
  `Map`/`Set` keys must be `string` or `i32``. Keying by anything but a string or an i32 is
  NEW ground either way this proposal goes.
* `Set<T>` is designed and unbuilt (`docs/guide/collections-design.md` C2.2), and the design
  already says its membership is keyed by **element value**.
* `==` between two VALUES of a scalar-carrying union refuses at emit: `type U = i32 | string`,
  `const a: U = 1; const b: U = 1; a == b` → `vl check` rc 0, then `emitProgram: union `==`
  atom has no value box` — in every spelling tried (string arms, i32 arms, parameter
  position). `a == 1` and `s == "ab"` (union against a literal) RUN — that is what D972
  closed. Union-against-union is an open clause-2 gap, reported to vl-de; it matters here
  because any rule for `===` on unions inherits whatever `==` on unions does.
* WasmGC gives `ref.eq` and **no address**: there is no identity hash to be had for free,
  which is the single fact that makes this a *language* question in VL where it is a
  library question in Go, Java or JS.

## 2. The proposal

**P1. `===` and `!==` are the identity operators.** `a === b` is one `ref.eq`. Both operands
must have a **reference rep**: a struct, an array, a map, a `List`/`Set`, a function value,
or a nullable of one of those (`null === null` is `true`, and `x === null` gets a hint
pointing at `== null`). Anything else is a **check error**, with the operator named:

> `===` compares identity, and `i32` has none — use `==`

That rule covers `i32`/`i64`/`f64`/`boolean`, **`string`** (a string is a reference in
WasmGC, so `"ab" === "a" + "b"` would be `false` — exactly the surprise the rule exists to
forbid), and any union with a scalar or string arm (whose rep may be an unboxed niche or a
`{tag, payload}` box, neither of which answers identity). A union of struct arms is fine.

**P2. `==` is unchanged.** ~~Structural on data, identity on functions (A15, already live).~~
**AMENDED by ruling 7:** `==` is structural on DATA ONLY; on a function value it is a check
error pointing at `===`, and a struct with a function field refuses `==` by field name.
`===` on a function value is what `==` used to mean there (table index + env `ref.eq`).

**P3. `Map`/`Set` keys over structs are STRUCTURAL.** Consistent with `==` and with the
collections design's "membership keyed by element value". The structural hash walks the
same shape the serde derive walks — one mechanism, two customers. (The unbuilt part today is
the struct-key lowering, not a decision.) **Ruling 5 fixes the eligibility:** any
`==`-comparable type keys — `f64`, lists and nested structs included — with the NaN,
`-0.0` and mutable-key consequences in the `Map` header.

**P4. `IdentityMap<K, V>` and `IdentitySet<K>` are the identity-keyed containers** — Java's
`IdentityHashMap` split, not an option on `Map`. ~~`K` must be a struct type, a union of
struct types, or a nullable of one.~~ **AMENDED by rulings 6, 7 and 10:** `K` is anything
`===` accepts; both containers SATISFY `{[K]: V}` / the sequence read core; v1 is a flat
`ref.eq` scan on the existing map struct, and the hidden serial — lazy `i64`, per keyed
class, on a private heap type — is built only when a program measures the scan as a
problem. The whole-program observation stands: the serial, when built, costs exactly the
identity-keyed classes and nothing else.

**P5. Consequences accepted up front.** ~~Arrays, maps and function values … are
`===`-comparable but not identity-keyable — a check error naming the limitation, never a
silent linear probe.~~ **AMENDED by rulings 7 and 10:** they ARE identity-keyable, and v1 is
the linear scan for every `K` — announced in the header, not silent. The serializer's cycle
seen-set (serde decision D) is an `IdentitySet<T>` on the path where the static
acyclic-shape predicate fails.

**P6. Spelling alternatives, and why not.** Python's `is` collides with VL's narrowing
keyword. `identical(a, b)` is the fallback if the cross-examination judges `===` a footgun:
it costs nothing in semantics, only in ergonomics. Making `==` mean identity on structs
(JS/Java) is off the table — A15 ruled structural, and D751/D752 built it.

## 3. Why `===` is not the JS footgun

In JS, `===` vs `==` is about **coercion**; both are reference equality on objects. VL's `==`
does not coerce, so a VL `===` would mean something JS's never did — **identity versus
structure**. That is Kotlin's split (`==` equals / `===` referential), structural `==` like
ours, used by a large JS-adjacent population — Kotlin kept it and retrofitted diagnostics
for `===` on value-typed operands, which is what P1's rep restriction does from day one.
(Swift's `===` is restricted to `AnyObject` and is a different shape; the earlier draft
cited it and the crosslang critique corrected that. Dart went the other way and removed
`===` — the choice here is made knowing both.) The trap to avoid is OCaml's: `=`
structural, `==` physical, and the *short* spelling is the wrong one. `===` is the longer,
rarer operator for the rarer operation.

The residual footgun is JS reflex — writing `===` everywhere. P1's rep restriction turns
`x === 1` and `s === "a"` into compile errors rather than wrong answers; what survives is
`p === q` on two value-shaped structs, which is the Kotlin situation and is answerable by
the error message pointing at `==`.

## 4. Costs and unknowns the examination should press on

(Each of these was examined — `docs/internals/identity-critique-{perf,consistency,crosslang}.md`
— and ruled; §0 carries the answers. Kept as the questions that were asked.)

1. **`ref.eq` and Heap2Local.** An identity compare may pin an allocation that binaryen's
   Heap2Local would otherwise scalarise. One `wasm-opt` run settles it; it should be run,
   not asserted.
2. **The serial.** Eager (at construction) vs lazy (on first keying, needs a mutable field
   and a branch at hash time); `i32` vs `i64` (an eager `i32` counter wraps after 2³²
   allocations of keyed types, which a long-running program can reach — wrap would make two
   live objects hash-collide silently; `i64` is 8 bytes per object). Field injection changes
   the WasmGC struct type, which is fine whole-program and worth stating.
3. **Generics.** `T === T` where `T` is instantiated at `i32`: refuse at the instantiation,
   with the message naming the instance, or require a bound at the declaration? The
   monomorphizer already sees every instance.
4. **Newtypes** are transparent on the wire (serde F) and branded at the checker: `===` on a
   newtype over a struct is identity of the underlying; over an `i32` it is the P1 error.
5. **Do `IdentityMap`/`IdentitySet` earn two names**, or is one parameter on `Map`/`Set`
   better? The std review's rubric dislikes boolean parameters; a type-level mode
   (`Map<K, V, by: identity>`) is the other shape worth pricing.
6. **Liveness.** Identity keys keep their objects alive; there are no weak references in this
   proposal. Say so in the container's header.
7. **Unions of struct arms.** `===` across arms is `ref.eq` on the box or the payload? A
   narrowed-union rep is a `{tag, payload}` box in some positions (D972/D973) and a bare ref in
   others; the operator must compare the *object*, never the box.

## 5. What the ruling recorded

The A15 remainder in `DECISIONS.md` now reads: identity is spelled `===`/`!==`, reference
reps only, functions included and `==` on them an error; `Map`/`Set` keys structural and
`==`-comparable; `IdentityMap`/`IdentitySet` as concrete types satisfying `{[K]: V}`, flat
scan first, serial when measured. OQ-11 in `docs/serde-design.md` is closed. `ROADMAP.md`
A15 lists five build items in ship order: the operator + checker arms (→ vl-de, value-table
acceptance), the struct-key lowering, `Set<T>` + concrete type names + explicit type
arguments, the two containers on the scan, and the deferred serial with its prerequisite.
