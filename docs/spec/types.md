# Types

Examples run on master `1df3c8f91`, 2026-10-11.

VL is statically and structurally typed. Every value has one type that `vl check`
knows. There is no `dynamic` and no runtime type tag beyond what a union needs to tell
its members apart. Annotations are never required where inference can decide.

> Ruling: DECISIONS.md §"Types & semantics", "Fully typed, no `dynamic`".

## T1. Primitive types

**T1.1** The primitive types are:

| type | values |
| --- | --- |
| `i32` | 32-bit two's-complement integers |
| `i64` | 64-bit two's-complement integers |
| `f32` | IEEE 754 single precision |
| `f64` | IEEE 754 double precision |
| `boolean` | `true`, `false` |
| `string` | immutable text; a string is a value, not a shared reference |
| `void` | the unit type of a function that returns nothing (T1.4) |
| `null` | the one absence value (T5) |
| `never` | no values (T1.5) |
| `u8` | a byte; a storage type only (T1.3) |
| `v128` | a 128-bit SIMD vector, built through `std:simd` |

**T1.2** Integer arithmetic wraps on overflow. `MIN / -1` and division by zero trap. The
operators are specified in expressions.md.

> Ruling: owner 2026-09-07, DECISIONS.md §"Integer overflow wraps by default; `MIN / -1`
> still traps".

**T1.3** `u8` is a storage type. It may be a list element (`u8[]`) or a field of a `flat`
record. It may not be the type of a local, parameter, return, ordinary field, map value or
generic argument; those are values, and a byte read as a value is `i32`. A literal stored
to a `u8` element must be in `0..255`. A computed value stores its low 8 bits.

```vl
const bs: u8[] = [255]
print(bs[0] + 1)   // prints 256
```

```vl
let b: u8 = 1   // refused: `u8` is a storage type, not a value type
```

```vl
function put(bs: u8[], v: i32) { bs[0] = v }
const bs: u8[] = [0]
put(bs, 300)
print(bs[0])   // prints 44
```

> Ruling: owner 2026-09-04, DECISIONS.md §"`x as u8` is the i64 → i32 narrowing with a
> byte-sized domain".

**T1.4** `void` is a unit type, not `null`. A void call is a statement. Its result cannot
be bound. A function value returning any type is assignable where a function returning
`void` is expected. A type parameter may be instantiated at `void`. `void` is not storable:
there is no `void[]`, no `void | T`, no `void` field and no `void` map value.

```vl
function call<T>(f: () => T): T { f() }
call(() => print(5))   // prints 5
```

```vl
function f() { }
const v = f()   // refused: cannot bind the void result of 'v'
```

> Ruling: DECISIONS.md §"Types & semantics", "`void` is a real type in the lattice".

> Status: `vl check` refuses a `void` field but accepts `void[]`, `Map<K, void>` and
> `void | T` written in an annotation. The first two then fail at build time, and the
> union is refused only when it is read (D4052; the inferred face is D1993).

**T1.5** `never` has no values. It may be written only as a function's declared return
type. A `never` function must end every path in another never-returning call, such as
`__trap__(msg)`. A call to one ends the path it is on, so a branch that calls it does not
contribute to the type of an `if` or `match`.

```vl
function fail(msg: string): never { __trap__(msg) }
function f(c: boolean): i32 { if c { 1 } else { fail("no") } }
print(f(true))   // prints 1
```

```vl
function f(x: never) { }   // refused: `never` has no values, so it is legal only as a function's declared return type
```

> Ruling: owner 2026-09-22, DECISIONS.md §"A call that never returns ends a path, through a
> `never` type — and only a declared one" (D1972).

**T1.6** `boolean` is not a number. No operator converts it implicitly. `b as i32` gives
`0` or `1`.

```vl
const b = true
print((b as i32) + 1)   // prints 2
```

```vl
const b = true
print(b + 1)   // refused: operator '+' is not defined for boolean and i32
```

> Ruling: owner 2026-09-29 (C), DECISIONS.md §"A `boolean` is never a number; `as`
> converts it" (D3218).

## T2. Literals and inference

**T2.1** An integer literal with no context is `i32`. A decimal literal outside the `i32`
range and inside `i64` is `i64`. A literal outside `i64` is refused.

```vl
let a = 0
let big = 3000000000
print(big)   // prints 3000000000
```

```vl
print(9223372036854775808)   // refused: integer literal … overflows i64
```

> Ruling: DECISIONS.md §"Types & semantics", "Bare literals default to their base type".

**T2.2** A literal with a fraction or an exponent is `f64` with no context. It is admitted
in an `f32` context when `f32` holds the nearest representable value. An integer literal is
admitted in a float context only when the float holds it exactly.

```vl
const x: f32 = 0.1
print(x)   // prints 0.10000000149011612
```

```vl
const x: f32 = 16777217   // refused: i32 doesn't fit in f32 — the conversion is lossy
```

> Ruling: DECISIONS.md §"Types & semantics", "A literal in an f32 context is admitted when
> f32 holds the best…".

**T2.3** A hex, binary or octal literal is a bit pattern. In an `i32` context, a pattern
of 32 bits or fewer is the `i32` with those bits. In an `i64` context it is the
zero-extended value. A wider pattern is `i64`.

```vl
print(0xFFFFFFFF)                // prints -1
const m: i64 = 0xFFFFFFFF
print(m)                         // prints 4294967295
print(0x1_0000_0000)             // prints 4294967296
```

```vl
const k: i32 = 3000000000   // refused: constant 3000000000 overflows i32 — write 0xb2d05e00 for its bit pattern
```

> Ruling: owner 2026-09-04, DECISIONS.md §"Types & semantics" (first bullet, the hex
> bit-pattern rule).

**T2.4** A `const` bound to a literal has no single type. Each use takes the type its
context asks for, within the literal's kind (integer or float), and otherwise the default
of T2.1 or T2.2.

```vl
const c = 1e3
const k: i32 = c
print(k)   // prints 1000
```

> Ruling: owner 2026-09-29 (B′ + C), DECISIONS.md §"A literal binding takes its type from
> its uses" (D3246).

**T2.5** A `let` bound to a literal takes the type of its deliveries and stores: a typed
parameter, binding, field, element or return it is passed to, and every `x = e` or
`x += e`. Operands do not retype it. A use widens it only within its kind. A cross-kind
use converts at that use and leaves the binding's type alone. A store of the other kind is
refused.

```vl
let n = 1
function g(x: f64): f64 { x / 2 }
print(g(n))   // prints 0.5
```

```vl
let n = 1
n = 2.5   // refused: cannot assign f64 to i32 — `n` on line 1 has no annotation, so its literal defaulted to `i32`
```

> Ruling: owner 2026-09-29 (B′ + C), same section as T2.4. The owner called this ruling
> provisional ("for now").

**T2.6** No implicit conversion loses information. A value moves to a narrower or
differently-shaped numeric type only through `as` (expressions.md).

```vl
const a: i64 = 5
const b: f64 = a   // refused: i64 doesn't fit in f64 — the conversion is lossy
```

## T3. Unions and literal types

**T3.1** `A | B` is the type of a value that is an `A` or a `B`. A union is a set. Member
order does not matter, a repeated member counts once, and a member contained in another
member is absorbed by it.

```vl
type R = { a: i32 }
const x: R | i32 = 3
const y: i32 | R = x
print(y is i32)   // prints true
```

> Ruling: owner 2026-09-06, open-rulings.md §D1712 (a union is a set); owner 2026-09-02,
> DECISIONS.md §"A subsumed literal arm COLLAPSES".

**T3.2** A string, integer or boolean literal is also a type whose one value is that
literal. A union of literal types is VL's enumeration. There is no separate `enum`.

```vl
type Dir = "n" | "s"
function go(d: Dir): i32 { if d == "n" { 1 } else { 2 } }
print(go("s"))   // prints 2
```

```vl
type Dir = "n" | "s"
function go(d: Dir) { }
go("e")   // refused: argument 1: expected Dir, got string
```

> Ruling: DECISIONS.md §"Types & semantics", "Literal unions are the enum idiom".

**T3.3** A float literal is not a type. An integer literal type does not admit a float.

```vl
type X = 1.5   // refused: a float literal cannot be a type
```

> Ruling: owner 2026-09-23, DECISIONS.md §"A float literal is not a type; an integer
> literal type stays distinct from a float" (D2221).

**T3.4** `x is T` is true when the value of `x` fits `T`. It tests the value, not the
declaration the value was built from. When `T` is a literal type, `is` is a value test.
After a true test, `x` has the narrowed type (narrowing.md). `x !is T` is the negation.

```vl
function f(x: i32 | string): i32 {
  if x is i32 { return x + 1 }
  x.length
}
print(f(1))     // prints 2
print(f("ab"))  // prints 2
```

> Ruling: owner 2026-10-10 (A), D3885 (`is` is structural).

Open question: does `v is A` hold of a record value that has every field of `A` and more?
Today it does not. See OPEN-QUESTIONS.md §Q2.

**T3.5** `A & B` is the type of a value that is both. `!T` is a negation type and may be
written only as the right-hand side of `!is`, or inside an intersection that narrows a
literal union. A negation type in any other annotation is refused.

```vl
type Small = (0 | 1 | 2) & !2
const s: Small = 1
print(s)   // prints 1
```

```vl
type N = !string   // refused: `!string` is a NEGATION, which says what a value is not
```

> Ruling: owner 2026-09-06, open-rulings.md §D1773; DECISIONS.md §"Types & semantics",
> "Type negation is `!A`, not `not A`".

**T3.6** Two numeric values of different types that meet at a join (`if` arms, `match`
arms, `??`, list literal elements) have the union of their types. Literal operands adapt
instead (T2.4). A numeric union is delivered to one numeric type only when the conversion
is exact for every member. Arithmetic on a numeric union is specified in expressions.md.

```vl
function f(c: boolean, a: i32, b: f64): f64 {
  const v = if c { a } else { b }
  v + 1
}
print(f(true, 1, 2.5))    // prints 2
print(f(false, 1, 2.5))   // prints 3.5
```

```vl
function f(c: boolean, a: i64, b: f64): f64 {
  const v = if c { a } else { b }
  v   // refused: expected f64, got i64 | f64 — a member does not convert to f64 exactly; write `x as f64`
}
```

> Ruling: owner 2026-09-30, DECISIONS.md §"Runtime numbers of different types join as a
> union, and operators dispatch per member" (D3345, D3363).

## T4. Records

**T4.1** `{ f: T, g: U }` is a record type. Records are structural: two record types with
the same field names and field types are the same type, whatever they are called and in
whatever order the fields are written. `A | B` of two same-shape records is `A`.

```vl
type A = { x: i32, y: i32 }
type B = { y: i32, x: i32 }
const a: A = { x: 1, y: 2 }
const b: B = a
print(b.x)   // prints 1
```

> Ruling: owner 2026-10-08 (C), D3870; DECISIONS.md §"Types & semantics", "Structural
> identity ignores FIELD ORDER — except for flat types".

**T4.2** A record is a shared reference. Binding or passing it does not copy it, and a
write through one name is seen through every other.

```vl
type P = { x: i32 }
const a: P = { x: 1 }
const b = a
b.x = 5
print(a.x)   // prints 5
```

**T4.3** `==` on records compares field values, recursively. Reference identity is a
separate operator (expressions.md).

```vl
type P = { x: i32 }
const a: P = { x: 1 }
const b: P = { x: 1 }
print(a == b)   // prints true
```

> Ruling: DECISIONS.md §"Types & semantics", "`==`/`!=` are structural (by value), and
> DATA-ONLY".

**T4.4** An object literal must give every field whose type does not admit `null`. A field
whose type admits `null` may be left out and reads `null`. A key may appear only once.

```vl
type O = { a: i32 | null, b: string | null }
const o: O = {}
print(o.a == null)   // prints true
```

```vl
type O = { a: i32, b: string | null }
const o: O = {}   // refused: `{}` leaves out `a`, a required field of O
```

```vl
const o = { a: 1, a: 2 }   // refused: key `a` is given twice in this object literal
```

> Ruling: owner 2026-09-23, DECISIONS.md §"`{}` completes an all-nullable record";
> owner 2026-10-03 (A), duplicate keys.

**T4.5** A FRESH record, meaning an object literal at the delivery or a binding that holds
only one, may be delivered to a record type whose fields are wider (an `i32` field into an
`f64` field, a `T` field into `T | null`). It adopts the destination type. An existing
record is not widened this way, because the destination could then write a value the
source's type forbids.

```vl
type W = { x: f64 }
const lit = { x: 1 }
const w: W = lit
w.x = 0.5
print(w.x)   // prints 0.5
```

```vl
type N = { x: i32 }
type W = { x: f64 }
const n: N = { x: 1 }
const w: W = n   // refused: N is not W: they store field `x` differently (`i32` into `f64`), and a record is shared, not copied, so only a fresh record widens
```

> Ruling: owner 2026-09-29 ("A, with C eventually"), DECISIONS.md §"Record covariance:
> only a fresh value widens" (D2996); owner 2026-09-30 (A), D3339.

**T4.6** A record with more fields may be delivered where a record with a subset of its
fields is expected (width subtyping). The value keeps its extra fields. They are not
visible through the narrower type.

```vl
type Animal = { name: string }
type Cat = { name: string, z: i32 }
const c: Cat = { name: "tom", z: 1 }
const a: Animal = c
print(a.name)   // prints tom
```

> Status: an existing value passed to a declared record parameter is accepted. At a binding,
> a return or an assignment it is accepted only when every dropped field's name sorts after
> every kept one. Otherwise `vl check` refuses it with "type-valid (structural width
> subtyping) but not yet supported by codegen" (D4054). Two parameters of one record type
> that are both handed wider records are refused (D4021), and so is a wider record passed
> inside a nullable or a list (D4022). A list of the wider record into a `readonly` list of the
> narrower one is refused the same way (D4050).

**T4.7** A record type may be recursive through a nullable field, a list or a union.

```vl
type Tree = { v: i32, left: Tree | null, right: Tree | null }
const t: Tree = { v: 1, left: { v: 2, left: null, right: null }, right: null }
print(t.left?.v ?? 0)   // prints 2
```

**T4.8** `flat type P = { … }` declares a flat record. A flat record's field order is part
of its type, and it may have `u8` and `f32` fields stored at their own width
(`docs/internals/flat-records-design.md`).

```vl
flat type P = { x: f32, y: f32, b: u8 }
```

## T5. Nullability

**T5.1** `T | null` is the type of an optional `T`. A member access, call or arithmetic on
a value whose type admits `null` is refused until a test removes `null` (narrowing.md).

```vl
function len(s: string | null): i32 {
  if s == null { return 0 }
  s.length
}
print(len("abc"))   // prints 3
```

```vl
function len(s: string | null): i32 { s.length }   // refused: member access '.length' on non-object string | null
```

**T5.2** `a?.f` is `null` when `a` is `null` and `a.f` otherwise. `a ?? b` is `a` when `a`
is not `null` and `b` otherwise. `?.` guards `null` only, not other union members.

```vl
type P = { name: string }
function n(p: P | null): string { p?.name ?? "none" }
print(n(null))   // prints none
```

```vl
type P = { name: string }
function n(p: P | i32): string { p?.name ?? "none" }   // refused: member access '?.name' on non-object P | i32
```

> Ruling: DECISIONS.md §"Types & semantics", "`?.` is null-only".

**T5.3** `let x = null` declares a binding whose type is `T | null`, where `T` comes from
its later stores. `let x: T` with no initialiser is not nullable. It must be assigned on
every path before it is read.

```vl
let x = null
x = 3
print(x ?? 0)   // prints 3
```

```vl
let x: i32
print(x)   // refused: `x` is used before it is assigned
```

> Ruling: DECISIONS.md §"Types & semantics", "`let x = null` is a nullable hole, not the
> `null` type" and "Uninitialized `let x` / `let x: T` is non-null +
> definite-assignment-checked".

## T6. Lists

**T6.1** `T[]` is a growable list of `T`. `xs[i]` with `i` out of range traps. A list
literal takes its element type from its elements or its context. An empty literal with
neither is refused.

```vl
const xs = [1, 2]
xs.push(3)
print(xs.length)   // prints 3
```

```vl
const xs = []   // refused: cannot infer a type for 'xs' — an empty array literal has no element type
```

> Status: `[null]` with no context passes `vl check` and fails at build time with "bare
> null needs a struct-typed context" (D1832; open-rulings.md §D1832 is waiting on a ruling).

**T6.2** A list is a shared reference and is invariant. `S[]` is not a `T[]` even when
every `S` is a `T`, because a write through the `T[]` could store a `T` that is not an `S`.
`readonly T[]` is a read-only view of a list. A `readonly` list is covariant: an `S[]` may
be delivered where `readonly T[]` is expected when an `S` converts to a `T`. Converting
the list itself needs a copy, such as `.map`.

```vl
function sum(xs: readonly f64[]): f64 { xs[0] + xs[1] }
const ns: i32[] = [1, 2]
print(sum(ns))   // prints 3
```

```vl
const ns: i32[] = [1, 2]
const fs: f64[] = ns   // refused: … a container never widens implicitly, and only a readonly list is covariant
```

```vl
function f(xs: readonly i32[]) { xs.push(1) }   // refused: `.push()` writes the list, and readonly i32[] is a read-only view
```

> Ruling: owner 2026-09-23, DECISIONS.md §"No implicit container widening";
> open-rulings.md §D1686/D1687 (the readonly view).

> Status: a mutable list of records into a list of a narrower record is refused, as the
> ruling requires, but the refusal says the program is type-valid and only codegen is
> missing (D4051).

**T6.3** There are no tuples. `(1, 2)` is a parse error. A function returns several values
as a record.

> Ruling: owner 2026-09-29 (B), DECISIONS.md §"`-O` returns a small record's fields as
> multi-value".

## T7. Maps and sets

**T7.1** `{[K]: V}` is the built-in map, and `Map<K, V>` is a longer spelling of the same
type. `m[k]` is `V | null`; a missing key reads `null`. `m[k] = v` inserts or replaces.
`for k, v in m` walks the map in insertion order.

```vl
const m = Map<string, i32>()
m["a"] = 1
m["b"] = 2
print(m["a"] ?? -1)   // prints 1
print(m["z"] ?? -1)   // prints -1
for k, v in m { print(k + "=" + "\{v}") }   // prints a=1, then b=2
```

> Ruling: owner 2026-09-25 (Q1), DECISIONS.md §"`{[K]: V}` and `T[]` are concrete types;
> `Set<T>` is a distinct type"; owner 2026-09-24, DECISIONS.md §"Deleting from a map while
> walking it is defined, and behaves like JS `Map`".

**T7.2** `Set<T>` is a distinct type with `add`, `has` and `delete`. It is not a map to
`boolean`.

```vl
const s = Set<i32>()
s.add(1)
print(s.has(1))   // prints true
```

**T7.3** A map key or set element may be any type that `==` can compare. Keys compare by
value, as `==` does.

> Ruling: DECISIONS.md §"Types & semantics", "Keys: `Map`/`Set` keys are STRUCTURAL, and
> key-eligible = `==`-comparable".

> Status: only `string`, `i32` and `i64` keys are built. Any other key type is refused with
> "A f64-keyed Map isn't supported yet" or the same sentence for its type (ROADMAP A15,
> item 2).

## T8. Functions

**T8.1** `(a: A, b: B) => R` is a function type. Parameter names in a function type are
documentation only. Two function types that differ only in their parameter names are the
same type. Named arguments work only in a call to a declared function, not through a
function value.

```vl
function twice(f: (n: i32) => i32, x: i32): i32 { f(f(x)) }
print(twice((k: i32) => k + 1, 1))   // prints 3
```

```vl
const f = (n: i32) => n
f(n: 2)   // refused: named arguments work only on declared functions, not on a function value
```

> Ruling: owner 2026-09-29 (A1), DECISIONS.md §"Parameter names in a function type are
> documentation" (plumb PL-060).

**T8.2** A parameter may be optional (`b?: T`, type `T | null`) or have a default
(`b: T = e`). A default is the declaration's expression, evaluated at each call that leaves
the argument out. A last parameter `...xs: T[]` collects the remaining arguments, and
`f(...list)` spreads a list into them.

```vl
function add(a: i32, b: i32 = 10): i32 { a + b }
print(add(1))      // prints 11
print(add(1, b: 2))   // prints 3
function sum(...xs: i32[]): i32 { xs.length }
print(sum(1, 2, 3))   // prints 3
print(sum(...[4, 5]))   // prints 2
```

> Ruling: owner 2026-09-01, DECISIONS.md §"Default arguments v1"; open-rulings.md
> §variadics-then-spread.

**T8.3** A function value is delivered to another function type when its parameters and
result convert. A closure captures its enclosing bindings by reference.

> Ruling: DECISIONS.md §"A function value at another function type is adapted where it is
> delivered" (D3073, D3112).

**T8.4** `==` is not defined on functions. Comparing two function values is refused, and
the message points at `===`.

> Status: not built. `f == g` on functions runs today and compares references (ROADMAP A15,
> item 1).

## T9. Generics

**T9.1** A function may take type parameters, `function id<T>(x: T): T`. Type arguments
are inferred from the call or written `id<f64>(3)`. Each call is checked at its own type
arguments, and a body that is invalid at those arguments is refused at that call.

```vl
function id<T>(x: T): T { x }
print(id(3))          // prints 3
print(id("s"))        // prints s
print(id<f64>(3))     // prints 3
```

```vl
function f<T>(x: T | null): i32 { if x == null { return 0 } x + 1 }
print(f("s"))   // refused: operator '+' is not defined for string and i32 (the call's argument types)
```

> Ruling: owner 2026-09-03, DECISIONS.md §"An unbounded `<T>` is an ENTIRELY OPEN HOLE";
> owner 2026-09-29 (A), the gradual-union ruling (D2906): `T | X` is checked like `T`.

**T9.2** A bound `<T: { n: i32 }>` admits only a type with a stored field `n: i32`.

```vl
function get<T: { n: i32 }>(x: T): i32 { x.n }
print(get({ n: 4, m: 1 }))   // prints 4
```

```vl
function sum<T: { n: i32 }>(xs: T[]): i32 { xs.length }
print(sum([1, 2]))   // refused: i32 does not satisfy `{n:i32}`: no field `n: i32`
```

**T9.3** A `let` initialised with a generic function keeps the generic type. Another
generic function of a compatible type may be stored in it. A concrete function may not.

```vl
function id<T>(x: T): T { x }
let g = id
g = (x: i32) => x + 1   // refused: cannot assign (i32) => i32 to `g`: it keeps the generic type of its initializer
```

> Ruling: owner 2026-10-10 (C), D3960.

**T9.4** A type alias may take type parameters.

```vl
type Pair<A, B> = { a: A, b: B }
const p: Pair<i32, string> = { a: 1, b: "s" }
print(p.b)   // prints s
```

## T10. Aliases and nominal types

**T10.1** `type N = T` makes `N` another name for `T`. They are the same type everywhere.
A bodyless `type N` is refused. A `type` declared in a function body is scoped to that
body.

```vl
type Id = i32
const a: Id = 3
const b: i32 = a
print(b)   // prints 3
```

```vl
type Point   // refused: A type alias requires a body
```

> Ruling: DECISIONS.md §"Types & semantics", "A declared alias and its inline spelling
> are the SAME TYPE"; owner 2026-09-02, DECISIONS.md §"A `type` declared in a function
> body is legal and lexically scoped".

**T10.2** `type N = new B` makes a nominal type with `B`'s representation. A value crosses
between `N` and `B`, or between two nominal types, only through `as`. An operator does not
mix two different nominal types. A literal is admitted directly.

```vl
type Meters = new f64
const m: Meters = 1.0
const n: Meters = 2.0
print(m + n)          // prints 3
print((m as f64) / 2) // prints 0.5
```

```vl
type Meters = new f64
type Feet = new f64
const m: Meters = 1.0
const f: Feet = 2.0
print(m + f)   // refused: operator '+' mixes Meters and Feet
```

> Ruling: DECISIONS.md §"Types & semantics", "A nominal type is `type N = new B`, and it is
> ERASED".

> Status: a variable delivered across a brand without `as` is refused, as the rule
> requires, but the message calls the conversion lossy (D4053).
