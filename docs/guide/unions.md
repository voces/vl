# Unions

A union type `A | B` holds a value that is an `A` or a `B`. VL has no `enum` and no class
hierarchy, so unions do that work: a nullable value, a set of named constants and a tree of
node kinds are all unions. This guide shows how to write them and how to tell their members
apart. The normative rules are in `docs/spec/types.md` §T3.

## Testing a member with `is`

`x is T` is true when the value of `x` fits `T`. Inside the branch where it is true, `x` has
type `T`. After an `if` that returns, the rest of the function sees the remaining members.
`x !is T` is the negation.

```vl
function describe(x: i32 | string): string {
  if x is i32 { return "number \{x + 1}" }
  "text of length \{x.length}"
}
print(describe(41))   // prints number 42
print(describe("hi")) // prints text of length 2
```

`null` is tested with `==`, and each test narrows what is left:

```vl
function f(x: i32 | string | null): string {
  if x == null { return "none" }
  if x is string { return x }
  "\{x * 2}"
}
print(f(null))   // prints none
print(f("s"))    // prints s
print(f(4))      // prints 8
```

## A union is a set

Member order does not matter, and a member that another member contains adds nothing.
`string | "err"` is `string`.

```vl
const a: i32 | string = "s"
const b: string | i32 = a
print(b is string)   // prints true
```

## Literal unions are enumerations

A string or integer literal is also a type with one value. A union of literals is VL's
enumeration, and `match` over it must cover every member.

```vl
type Dir = "north" | "south" | "east" | "west"
function turn(d: Dir): Dir {
  match d {
    "north" => "east",
    "east" => "south",
    "south" => "west",
    "west" => "north",
  }
}
print(turn("north"))   // prints east
```

## Unions of records

Records are structural. A record type is its fields, not its name. A union of records with
different field names is told apart by those names, and `match` can name the arms:

```vl
type Num = { n: i32 }
type Add = { l: i32, r: i32 }
function eval(e: Num | Add): i32 {
  match e {
    Num => e.n,
    Add => e.l + e.r,
  }
}
print(eval({ n: 4 }))         // prints 4
print(eval({ l: 1, r: 2 }))   // prints 3
```

### A discriminant field

When the arms have the same field names, give each a literal-typed field, by convention
`kind`. `is` then reads that field's value, and so does a plain `==` test on it:

```vl
type Circle = { kind: "circle", r: f64 }
type Square = { kind: "square", r: f64 }
function area(s: Circle | Square): f64 {
  if s is Circle { return s.r * s.r * 3 }
  s.r * s.r
}
print(area({ kind: "circle", r: 1.0 }))   // prints 3
print(area({ kind: "square", r: 2.0 }))   // prints 4
```

The answer depends on the value only. A `{ kind: "circle", r: 1.0 }` is a `Circle`
whether or not it was ever declared as one.

Arms with the same field names and no literal field to tell them apart are refused, and so
are arms whose literal fields have no common base type (a string beside an integer):

```vl
type A = { v: i32 }
type B = { v: boolean }
function f(s: A | B): boolean { s is A }
// refused: arms `A` and `B` share a field-name set and no literal-typed field distinguishes them — add a discriminant field
```

### Two names for one shape are one type

Two record types with the same fields are the same type, whatever they are called. `A | B`
is then just `A`, and both `is A` and `is B` are true of every value.

```vl
type A = { x: i32 }
type B = { x: i32 }
function f(v: A | B): string {
  if v is A { return "A" }
  "B"
}
const b: B = { x: 1 }
print(f(b))   // prints A
```

> Owner ruling 2026-10-08 (C), D3870: records are structural, so same-shape records are
> one type and no runtime tag records the name a value was declared under.

### Overlapping arms

When one arm's values are all values of another, `is` still asks about the value. An `A`
whose field happens to lie in `B`'s literal set is a `B`. The checker adds a hint at such an
`is`, because the test reads a value rather than telling two kinds apart:

```vl
type A = { x: i32 }
type B = { x: 1 | 2 }
function f(v: A | B): string { if v is B { return "B" } "A" }
const a: A = { x: 1 }
print(f(a))   // prints B
const c: A = { x: 7 }
print(f(c))   // prints A
// hint: `B` is contained in `A`, so `is B` tests the value
```

Overlapping literal sets are legal too. A value in both sets is a member of both arms:

```vl
type A = { k: "x" | "y" }
type B = { k: "y" | "z" }
function f(s: A | B): string { if s is A { return "A" } "B" }
const v: B = { k: "y" }
print(f(v))   // prints A
const w: B = { k: "z" }
print(f(w))   // prints B
```

> Owner ruling 2026-10-10 (A), D3885: `is` tests whether the value fits the type. It
> replaces the 2026-09-02 reading, in which `is` over same-shape arms decided by which
> declaration a value came from.

## Reading a shared field

A field that every arm has can be read without narrowing first. Its type is the union of
the arms' field types.

```vl
type Circle = { kind: "circle", r: f64 }
type Square = { kind: "square", side: f64 }
function k(s: Circle | Square): string { s.kind }
print(k({ kind: "square", side: 1.0 }))   // prints square
```

## Numbers of different types

Two numeric values of different types that meet at an `if`, a `match`, a `??` or a list
literal have a union type. `is` tells them apart, and arithmetic works member by member
(`docs/spec/types.md` §T3.6).

## How a union is stored

The compiler chooses a union's representation. A nullable reference is a plain nullable
reference. A union of scalars, or of references with scalars, is a small tagged box, which
the optimiser usually removes. None of this is visible to a program. The only promise is
the one above: `is` and `==` answer from the value. Representation detail is in
`docs/internals/`.
