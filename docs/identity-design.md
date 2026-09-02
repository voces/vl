# Reference identity in VL — `===`, `IdentityMap`, `IdentitySet`

**Status: PROPOSAL, 2026-09-01 — awaiting cross-examination.** Written by the tooling
track at the owner's request; this is the language question serde decision D split off
(`docs/internals/serde-critique-synthesis.md`, OQ-11 in `docs/serde-design.md`), and it
resolves the half of A15 that `DECISIONS.md` left as "would be `===` or `identical(a, b)` —
deferred". Every fact below marked **(RUN)** was measured on the live seed on 2026-09-01;
everything else is a claim to be examined.

The owner's framing, verbatim: *"Reference identity keys are useful for cyclic dependencies,
right? I think it does make sense to support referential equality. Can even use === for
that? Similar to JS? Or is that a footgun?"*

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

**P2. `==` is unchanged.** Structural on data, identity on functions (A15, already live).
`===` on a function value means what `==` already means there; the operator is still
admitted so that generic code can spell "same closure" without knowing whether `T` is data.

**P3. `Map`/`Set` keys over structs are STRUCTURAL.** Consistent with `==` and with the
collections design's "membership keyed by element value". The structural hash walks the
same shape the serde derive walks — one mechanism, two customers. (The unbuilt part today is
the struct-key lowering, not a decision.)

**P4. `IdentityMap<K, V>` and `IdentitySet<K>` are the identity-keyed containers** — Java's
`IdentityHashMap` split, not an option on `Map`. `K` must be a struct type, a union of
struct types, or a nullable of one. The compiler is whole-program, so it can give a hidden
**serial field** to *exactly* the struct types that are identity-keyed somewhere in the
program, assigned from a global counter at construction. Cost: one extra field and one
counter increment per allocation **of those types only**; zero for every other type.

**P5. Consequences accepted up front.** Arrays, maps and function values have nowhere to put
a serial (uniform element type; no user-visible closure struct), so in v1 they are
`===`-comparable but **not identity-keyable** — a check error naming the limitation, never a
silent linear probe. The serializer's cycle seen-set (serde decision D) is an
`IdentitySet<T>` on the path where the static acyclic-shape predicate fails.

**P6. Spelling alternatives, and why not.** Python's `is` collides with VL's narrowing
keyword. `identical(a, b)` is the fallback if the cross-examination judges `===` a footgun:
it costs nothing in semantics, only in ergonomics. Making `==` mean identity on structs
(JS/Java) is off the table — A15 ruled structural, and D751/D752 built it.

## 3. Why `===` is not the JS footgun

In JS, `===` vs `==` is about **coercion**; both are reference equality on objects. VL's `==`
does not coerce, so a VL `===` would mean something JS's never did — **identity versus
structure**. That is Swift's split (`==` Equatable / `===` object identity, restricted to
`AnyObject`) and Kotlin's (`==` equals / `===` referential), both with structural `==` like
ours, both used by large JS-adjacent populations without incident. The trap to avoid is
OCaml's: `=` structural, `==` physical, and the *short* spelling is the wrong one. `===` is
the longer, rarer operator for the rarer operation.

The residual footgun is JS reflex — writing `===` everywhere. P1's rep restriction turns
`x === 1` and `s === "a"` into compile errors rather than wrong answers; what survives is
`p === q` on two value-shaped structs, which is the Swift/Kotlin situation and is
answerable by the error message pointing at `==`.

## 4. Costs and unknowns the examination should press on

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

## 5. What a ruling would record

The A15 remainder in `DECISIONS.md` becomes: identity is spelled `===`/`!==`, reference reps
only; `Map`/`Set` keys structural; `IdentityMap`/`IdentitySet` for identity keying via a
whole-program serial field. OQ-11 in `docs/serde-design.md` closes. `ROADMAP.md` A15 lists
the four build items: the operator + checker rule, the struct-key lowering for `Map`/`Set`,
the serial injection, and the two containers.
