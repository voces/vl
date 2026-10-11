# Narrowing

Examples run on master `98a4ed71b`, 2026-10-11.

A test such as `x != null` or `x is T` gives `x` a narrower type in the code that runs only
when the test held, and in the code that runs only when it failed. This chapter says which
tests narrow, where the narrower type holds, and what ends it. The `is` operator itself is
in [types.md](types.md) §T3.4, and the `match` arm types in [statements.md](statements.md)
§S7.4. A `match` narrows its scrutinee in each arm as that section says. VL has no `?:`
conditional operator; an `if` with an `else` is an expression and narrows as N3.1 says.

```vl
function f(x: i32 | null): i32 {
  if x != null { x } else { 0 }
}
print(f(5))   // prints 5
```

## N1. Places

**N1.1** A narrowing is a fact about a place. A place is a binding's name, a field path
built on one (`o.v`, `a.b.c`), or a list element at a literal index (`xs[0]`). An element
at a computed index, `xs[i]`, is not a place and does not narrow.

```vl
type O = { v: i32 | null }
function f(o: O): i32 {
  if o.v != null { return o.v + 1 }
  0
}
print(f({ v: 4 }))   // prints 5
```

```vl
function f(xs: (i32 | null)[], i: i32): i32 {
  if xs[i] != null { return xs[i] + 1 }   // refused: operator '+' is not defined for i32 | null and i32
  0
}
```

**N1.2** A narrowing changes the type a place READS at. It never changes what the place
accepts: a write is checked against the declared type (N4.1).

## N2. Tests that narrow

**N2.1** `x != null` narrows `x` to its type without `null` where the test holds, and to
`null` where it fails. `x == null` is the same test reversed.

```vl
function len(s: string | null): i32 {
  if s == null { return 0 }
  s.length
}
print(len("abc"))   // prints 3
```

**N2.2** `x is T` narrows `x` to the members of its type that fit `T` where the test holds,
and to the members left over where it fails. `x !is T` is the same test reversed.

```vl
function f(x: i32 | string): i32 {
  if x is i32 { x + 1 } else { x.length }
}
print(f("abc"))   // prints 3
```

`x is T` is true exactly when the value fits `T`, not when its declared type is `T`. A
record value with the same field names as a record type fits it when each field's value
fits that type's field. Whether a record with more fields than the type fits it is not
settled by the ruling (D4062).

```vl
type A = { x: i32 }
type B = { x: 1 | 2 }
function f(v: A | B): string { if v is B { return "B" } "A" }
const a: A = { x: 1 }
print(f(a))   // prints B
```

> Ruling: owner 2026-10-10 (A), DECISIONS.md §"`is` tests whether the value fits the type"
> (D3885).

> Status: when `x`'s declared type is a single record type `A`, or `A | null`, and `T` is
> a record type contained in `A`, `x is T` is `true` whatever the value, and the then-branch
> reads `x.x` at `1 | 2` while it holds `7` (D4058). When `T` contains `x`'s declared
> type, so that the test always holds, it is refused as one that "can never match" (D4062).

**N2.3** `x is L`, for a literal or a union of literals `L`, narrows a literal union the same
way.

```vl
type K = "a" | "b" | "c"
function f(k: K): string {
  if k is "a" { return "A" }
  const j: "b" | "c" = k
  j
}
print(f("c"))   // prints c
```

> Status: a compare `x == L` against a literal does not narrow `x` today.
> `docs/guide/narrowing.md` says it narrows as `x is L` does; no ruling settles it (D4059).

Open question (Q10): should `x == L` narrow a literal union as `x is L` does?

**N2.4** A compare of a record's literal-typed field with a literal, `c.kind == "m"`, narrows
`c` to the members of its union whose field can hold that literal.

```vl
type M = { kind: "m", x: i32 }
type Q = { kind: "q" }
function f(c: M | Q): i32 {
  if c.kind == "m" { return c.x }
  0
}
print(f({ kind: "m", x: 6 }))   // prints 6
```

**N2.5** `!` swaps where a test's facts hold. `a && b` checks and runs `b` with `a`'s facts,
and holds the facts of both where it is true. `a || b` checks and runs `b` with the facts of
`a` failing, and holds the facts of both failing where it is false.

```vl
type P = { y: i32 | null }
function f(x: P | null): i32 {
  if x != null && x.y != null && x.y > 0 { return x.y }
  0
}
print(f({ y: 4 }))   // prints 4
```

```vl
function f(a: i32 | null, b: i32 | null): i32 {
  if a == null || b == null { return 0 }
  a + b
}
print(f(2, 3))   // prints 5
```

**N2.6** `x?.y is T` narrows `x` to non-null and `x.y` to `T` where it holds. `x?.y != null`
narrows `x` to non-null and `x.y` to its type without `null`.

```vl
type I = { y: i32 | string }
function f(x: I | null): i32 {
  if x?.y is i32 { return x.y + 1 }
  0
}
print(f({ y: 4 }))   // prints 5
```

```vl
type I = { y: i32 | null }
function f(x: I | null): i32 {
  if x?.y != null { return x.y + 1 }
  0
}
print(f({ y: 4 }))   // prints 5
```

**N2.7** Inside a generic function, `y is T` tests against the type `T` is instantiated at.

```vl
function pick<T>(x: T, y: T | null): T {
  if y is T { return y }
  x
}
print(pick(1, null))   // prints 1
print(pick(1, 5))      // prints 5
```

## N3. Where a fact holds

**N3.1** A test's facts hold in the branch that runs when the test held, and its reversed
facts in the `else` branch. The test of an `else if` starts from the facts of the tests
before it failing.

**N3.2** When a branch always exits, by `return`, `break`, `continue` or a call that never
returns (statements.md §S8.2), the facts of the other branch hold after the `if`, to the end
of the enclosing block. Successive guards add up.

```vl
type A = { kind: "a", n: i32 }
type B = { kind: "b", s: string }
type C = { kind: "c", z: i32 }
function f(u: A | B | C): i32 {
  if u is A { return u.n }
  if u is B { return u.s.length }
  u.z
}
print(f({ kind: "c", z: 9 }))   // prints 9
```

```vl
const xs: (i32 | null)[] = [1, null, 3]
let t = 0
for x in xs {
  if x == null { continue }
  t += x
}
print(t)   // prints 4
```

**N3.3** A `while` condition's facts hold in its body, and are tested again before every
iteration.

```vl
let y: i64 | boolean = 3
while y is i64 {
  print(y + 1)
  y = true
}
print(y)
// prints 4, true
```

**N3.4** A chain of `if` and `else if` whose tests leave the tested place no member has no
path past its last branch. A function may end in such a chain without a final value.

```vl
type A = { kind: "a", n: i32 }
type B = { kind: "b" }
function f(u: A | B): i32 {
  if u is A { u.n } else if u is B { 0 }
}
print(f({ kind: "a", n: 3 }))   // prints 3
```

**N3.5** Inside `if k.length > 0` or `while k.length > 0` (also `!= 0`, `>= 1` and
`0 < k.length`), the first `k.pop()` has the element type, not `T | null`. A second pop, or
any call that may change `k`, ends that fact.

```vl
function f(k: i32[]): i32 {
  if k.length > 0 { return k.pop() + 1 }
  0
}
print(f([4]))   // prints 5
```

> Ruling: owner on sunpa SP-008 (A), DECISIONS.md §"Flow narrowing: per-path facts meet at
> joins", "A `.length` test proves the next pop" (D3558).

## N4. Writes

**N4.1** A write to a narrowed place is checked against the place's declared type. It then
narrows the place to the type of the value written, for the reads after it. A write of a
value the declared type does not admit is refused, and the message names the declared type.

```vl
let x: i64 | boolean = 3
if x is i64 {
  print(x + 1)
  x = true
  print(x)
}
// prints 4, true
```

```vl
let x: i64 | boolean = 3
if x is i64 {
  x = "s"   // refused: cannot assign string to i64 | boolean
}
```

**N4.2** After an `if`, a place reads at the join of the types each path through the `if`
left it at. A path that always exits contributes nothing. An `if` with no `else` has a path
that skips its branch, and that path keeps the place as it was before the `if`.

```vl
function f(s: string | null): i32 {
  let t = s
  if t == null { t = "fresh" }
  t.length
}
print(f(null))   // prints 5
```

```vl
function f(c: boolean): boolean {
  let x: i64 | boolean = 3
  if x is i64 {
    if c { x = true }
    return x   // refused: return type mismatch: expected boolean, got i64 | boolean
  }
  false
}
```

> Ruling: owner 2026-09-29, DECISIONS.md §"Flow narrowing: per-path facts meet at joins"
> (plumb PL-064, D3285). Joins at `match`, `&&`, `||` and loops are later slices of the
> same ruling.

## N5. What ends a fact

**N5.1** A call ends a fact about a place when a function that writes the place may run
during it. Such a function is a closure that assigns the place, a function that calls one,
or, for a module binding or a field, any function that writes it. A call that cannot reach
such a function keeps the fact. Code after the call reads the place at its declared type
until a new test.

```vl
let v: f64 | boolean = 1.5
const k = () => { v = true }
if v is f64 {
  k()
  print(v * 2.0)   // refused: operator '*' is not defined for f64 | boolean and f64 — 'v' is no longer narrowed to f64: the call to 'k' on line 4 may reassign it
}
```

```vl
let v: f64 | boolean = 1.5
const k = () => { v = true }
if v is f64 {
  k()
  if v is f64 { print(v) } else { print("flipped") }
}
// prints flipped
```

```vl
type O = { v: i32 | null }
function clr(o: O) { o.v = null }
function f(o: O): i32 {
  if o.v != null {
    clr(o)
    return o.v + 1   // refused: 'o.v' is no longer narrowed to i32: the call to 'clr' on line 5 may reassign it
  }
  0
}
```

```vl
let v: i32 | null = 1
function clr() { v = null }
function outer() { clr() }
function f(): i32 {
  if v != null {
    outer()
    return v + 1   // refused: 'v' is no longer narrowed to i32: the call to 'outer' on line 6 may reassign it
  }
  0
}
```

```vl
let v: i32 | null = 1
function noop(): i32 { 3 }
function f(): i32 {
  if v != null {
    noop()
    return v + 1
  }
  0
}
print(f())   // prints 2
```

A read later in the same statement as such a call is refused.

> Ruling: owner 2026-09-25 (a), DECISIONS.md §"A call that may reassign a narrowed binding
> ends the narrowing" (D2390).

**N5.2** Inside a loop, a fact from outside the loop that a write in the loop may falsify is
refused at its reads, since a read before the write runs again after it. A test inside the
loop narrows each iteration.

```vl
function f(x: i32 | null): i32 {
  let v = x
  if v != null {
    let t = 0
    for i in 0 until 2 {
      t += v   // refused: 'v' is no longer narrowed to i32: the assignment to 'v' on line 7 in the loop around this read may reassign it
      v = null
    }
    return t
  }
  0
}
```

**N5.3** A closure keeps the facts it captured only while it is used locally by name. A
closure that escapes, by being returned, stored, or passed to a function, loses every
captured fact about a field path, and every captured fact about a name assigned anywhere.

```vl
type O = { v: i32 | null }
function f(o: O): i32 {
  if o.v != null {
    const g = () => o.v + 1
    return g()
  }
  0
}
print(f({ v: 1 }))   // prints 2
```

```vl
type O = { v: i32 | null }
function f(o: O): () => i32 {
  if o.v != null {
    return (): i32 => o.v + 1   // refused: 'o.v' is not narrowed inside the function on line 4
  }
  (): i32 => 0
}
```

> Ruling: owner 2026-09-25 (a), DECISIONS.md §"A call that may reassign a narrowed binding
> ends the narrowing", "An escaping closure loses what it captured" (D2407).

> Status: without the `: i32` annotation, the escaping lambda above is reported with two
> more errors, which name `<error>` and `''` (D4060).
