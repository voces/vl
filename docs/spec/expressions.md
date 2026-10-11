# Expressions

Examples run on master `98a4ed71b`, 2026-10-11.

An expression computes a value. In VL `if`, `match`, a labelled block and an assignment
are all expressions. Statements, bindings and loops are in [statements.md](statements.md).
Tests that narrow a type (`is`, `!= null`) are in [narrowing.md](narrowing.md).

## E1. Precedence and grouping

**E1.1** Binary operators bind as follows, loosest first. Every level is left-associative.

```
??  ||   <   &&   <   |   <   ^   <   &   <   ==  !=   <   <  <=  >  >=   <   <<  >>  >>>   <   +  -   <   *  /  %
```

```vl
print(1 + 2 * 3)    // prints 7
print(10 - 4 - 3)   // prints 3
print(1 << 2 + 1)   // prints 8
```

`&`, `|` and `^` bind looser than `==`, as in C. So `6 & 3 == 2` is `6 & (3 == 2)`, and that
is refused.

```vl
print(6 & 3 == 2)   // refused: operator '&' is not defined for i32 and boolean
```

**E1.2** `??` and `||` share a level, and mixing them without parentheses is refused.

```vl
const x: i32 | null = null
const c = false
print(x ?? 3 == 3 || c)   // refused: unparenthesized `??` mixed with `||` — add parentheses to make the grouping explicit
```

**E1.3** The cast operators `as`, `as?`, `as!` and `as%` bind tighter than every binary
operator. Every prefix operator (`-`, `!`, `~`, `++`, `--`) binds tighter than a cast.
Postfix forms bind tightest: member access, indexing, calls and `x++`.

```vl
const m: i32 = -2147483648
print(-m as i64)     // prints -2147483648
print(-(m as i64))   // prints 2147483648
```

In the first line `-m` is negated at `i32` and wraps, and then it is widened.

> Ruling: owner 2026-10-04 (A), DECISIONS.md §"Prefix operators bind tighter than `as`"
> (D3629).

**E1.4** A type test `x is T` takes a whole cast chain on its left. A prefix `!` applies to
the whole test: `!x is T` is `!(x is T)`, and `x as T is U` is `(x as T) is U`.

```vl
function f(x: i32 | string): boolean { !x is i32 }
print(f(1))     // prints false
print(f("a"))   // prints true
```

**E1.5** Assignment binds loosest of all and is right-associative (E7).

## E2. Arithmetic

**E2.1** `+`, `-`, `*`, `/` and `%` take two numbers. When both operands have the same type,
the result has that type. A literal operand adapts to the other operand (types.md §T2).

**E2.2** Two runtime operands of different numeric types meet at the wider type, by the
implicit widenings of types.md §T2.6:

- `i32` with `i64` gives `i64`.
- `i32` with `f64` gives `f64`.
- `f32` with `f64` gives `f64`.
- `i32` with `f32`, and `i64` with `f64`, are refused, because the conversion could lose
  information. Write the cast you mean.

An operand that is a union of numeric types computes at each member's own type (types.md
§T3.6).

```vl
const a: i32 = 3
const b: i64 = 4
const c: f64 = 0.5
print(a + b)   // prints 7
print(a + c)   // prints 3.5
```

```vl
const a: i64 = 3
const b: f64 = 0.5
print(a + b)   // refused: operator '+' mixes i64 and f64
```

**E2.3** Integer `+`, `-` and `*` wrap on overflow. Integer `/` truncates toward zero.
Integer `/` and `%` trap on a zero divisor and on `MIN / -1` (types.md §T1.2).

```vl
function div(a: i32, b: i32): i32 { a / b }
print(div(-7, 2))   // prints -3
```

> Ruling: owner 2026-09-07, DECISIONS.md §"Integer overflow wraps by default; `MIN / -1`
> still traps".

**E2.4** Float arithmetic is IEEE 754. A float division by zero gives an infinity or NaN.

```vl
const z = 0.0
print(1.0 / z)   // prints Infinity
print(0.0 / z)   // prints NaN
```

**E2.5** `a % b` is the truncated remainder, `a - b * trunc(a / b)`. Its sign is the sign of
the dividend. On floats it is C's `fmod`.

```vl
print(-7 % 2)       // prints -1
print(7 % -2)       // prints 1
print(-7.5 % 2.0)   // prints -1.5
```

> Ruling: owner 2026-09-04, DECISIONS.md §"`%` over floats is the truncated remainder".

**E2.6** `+` also joins two strings, and joins two lists of the same type into a new list.
Neither operand is changed. `+` between a string and a number is refused. String
interpolation formats a value (lexical.md §L7.3).

```vl
print("ab" + "cd")   // prints abcd
const xs = [1, 2]
const ys = xs + [3]
ys.push(9)
print(xs.length)     // prints 2
print(ys.length)     // prints 4
```

```vl
print("a" + 1)   // refused: operator '+' is not defined for string and i32
```

**E2.7** The intrinsics `abs`, `min` and `max` keep an integer operand's width. A float
operand makes the result a float. `abs` of the minimum integer wraps to itself, as `0 - x`
does.

```vl
const n: i32 = -5
print(abs(n) / 2)   // prints 2
const a: i64 = 5
const b: i32 = 9
print(max(a, b))    // prints 9
```

## E3. Comparison

**E3.1** `==` and `!=` compare two values of compatible types and give `boolean`. Lists and
records compare by value, recursively (types.md §T4.3). Values of unrelated types cannot
be compared. Two numbers of different types compare by value.

```vl
print([1, 2] == [1, 2])   // prints true
const a: i32 = 3
const b: i64 = 3
print(a == b)             // prints true
```

```vl
print(1 == "1")   // refused: cannot compare i32 with string
```

**E3.2** A float compare follows IEEE 754. NaN is not equal to itself, and `-0.0 == 0.0`.

```vl
const z = 0.0
const n = z / z
print(n == n)       // prints false
print(-0.0 == 0.0)  // prints true
```

**E3.3** `<`, `<=`, `>` and `>=` compare two numbers or two strings. Strings compare by
code point. A `boolean` is not ordered. Comparisons do not chain, so `1 < 2 < 3` compares a
`boolean` with a number and is refused.

```vl
print("Z" < "a")   // prints true
print("é" > "z")   // prints true
```

```vl
print(true < false)   // refused: comparison expects numeric operands, got boolean and boolean
```

**E3.4** `===` is reserved for reference identity and is not yet a token. `==` on two
function values is to be refused (types.md §T8.4).

## E4. Logical operators

**E4.1** `&&`, `||` and `!` take `boolean` operands only. There is no truthiness. A
condition must be a `boolean`.

```vl
const n = 1
if n { print(1) }   // refused: if-condition must be boolean, got i32
```

**E4.2** `&&` and `||` evaluate their right operand only when the left one does not decide
the result.

```vl
function t(s: string): boolean { print(s); return true }
function f(s: string): boolean { print(s); return false }
print(f("a") && t("b"))
print(t("c") || t("d"))
// prints a, false, c, true (one per line)
```

## E5. Null operators

**E5.1** `a?.f` and `a ?? b` are defined in types.md §T5.2. When `a ?? b` has two runtime
numbers of different types, they join as a union, the same as an `if` would (types.md §T3.6).
`??` binds at the loosest binary level (E1.2).

```vl
type P = { name: string }
const p: P | null = null
print(p?.name ?? "none")   // prints none
```

## E6. Bitwise operators and shifts

**E6.1** `&`, `|`, `^`, `~`, `<<`, `>>` and `>>>` take integers only. `>>` is the arithmetic
shift, which copies the sign bit. `>>>` is the logical shift, which shifts in zeros. Both
work at the operand's own width.

```vl
print(6 ^ 3)        // prints 5
print(~5)           // prints -6
print(-16 >> 2)     // prints -4
print(-16 >>> 28)   // prints 15
```

```vl
print(1.0 & 2)   // refused: operator '&' is integer-only, got f64 and i32
```

**E6.2** A shift count that is a constant must be less than the operand's width. A count
known only at run time is taken modulo the width, as wasm does.

```vl
function sh(x: i32, n: i32): i32 { x << n }
print(sh(1, 33))   // prints 2
```

```vl
const x: i32 = 1
print(x << 32)   // refused: shift count 32 is out of range for an i32 operand (0 to 31)
```

> Ruling: DECISIONS.md §"A tree of integer literals takes a 64-bit destination's width, and
> a literal shift count must be below the operand's" (D2709, D2710).

## E7. Assignment

**E7.1** `x = e` stores `e` and is itself an expression whose value is `e`. It is
right-associative, so `a = b = 5` sets both.

```vl
let a = 0
let b = 0
a = b = 5
print(a)   // prints 5
print(b)   // prints 5
```

> Ruling: DECISIONS.md §"Assignment is an expression yielding its right-hand side"
> (2026-06).

**E7.2** Every arithmetic, bitwise and shift operator has a compound form: `+= -= *= /= %=`,
`&= |= ^=`, `<<= >>= >>>=`. `x op= e` means `x = x op (e)`, with the same operand rules.
The place is evaluated once, before `e`. There is no `&&=`, `||=` or `??=`.

```vl
let n = 0
function next(): i32 { n = n + 1; return 0 }
const xs = [10, 20]
xs[next()] += 5
print(xs[0])   // prints 15
print(n)       // prints 1
```

**E7.3** `++x` and `--x` add or subtract one and give the new value. `x++` and `x--` give
the old value.

```vl
let i = 1
const j = i++
print(j)     // prints 1
print(++i)   // prints 3
```

> Status: postfix `++` and `--` work only on a plain name. On a field or an element
> (`c.n++`, `xs[0]++`) they are a parse error, while the prefix forms run (D4055).

## E8. Casts

**E8.1** `x as T` converts a number to another numeric type. A cast to a float type rounds
to the nearest value and cannot fail. A cast to an integer type is exact or fails. It
succeeds only when the value is a whole number in the target's range. A cast to a wider
integer type cannot fail.

**E8.2** The suffix chooses what a failed cast does.

| spelling | type | on failure |
| --- | --- | --- |
| `x as! T` | `T` | traps, with `as! T at <line>:<col>: not exact` |
| `x as? T` | `T \| null` | gives `null` |
| `x as T` | `T` | returns `null` from the enclosing function |

A bare `as` that can fail is legal only in a function whose return type admits `null`.

```vl
function q(d: f64): i32 | null { d as? i32 }
print(q(3.9))            // prints null
print(q(3.0))            // prints 3
print(q(5000000000.0))   // prints null
```

```vl
function half(d: f64): i32 | null {
  const n = d as i32
  return n + 1
}
print(half(4.0))   // prints 5
print(half(4.5))   // prints null
```

```vl
function f(d: f64): i32 {
  return d as i32   // refused: `as i32` propagates null, which the enclosing function cannot return (it returns i32)
}
print(f(1.0))
```

A cast of a constant that can never succeed is refused, for example `3.9 as? i32`. To drop
a fraction, round first: `trunc(x)`, `floor(x)`, `ceil(x)` or `nearest(x)`, then cast.

```vl
print(trunc(2.7) as! i32)    // prints 2
print(floor(-2.5) as! i32)   // prints -3
```

> Ruling: owner 2026-09-02, DECISIONS.md §"Numeric `as` to an INTEGER target is
> exact-or-fail under the trio; a float target rounds"; owner 2026-09-07, §"Float→int
> out-of-range casts keep the trio".

**E8.3** `x as u8` is the same cast with the range 0 to 255. Its result is an `i32` in that
range (types.md §T1.3).

```vl
const v: i32 = 300
print(v as? u8)    // prints null
print(200 as! u8)  // prints 200
```

> Ruling: owner 2026-09-04, DECISIONS.md §"`x as u8` is the i64 → i32 narrowing with a
> byte-sized domain".

**E8.4** `x as% T` converts between integer widths by keeping the target's low bits. It
cannot fail. A float operand is refused.

```vl
print(0xb81a1aaa as% i32)   // prints -1206248790
print(300 as% u8)           // prints 44
print(-1 as% u8)            // prints 255
```

```vl
const f: f64 = 1.5
print(f as% i32)   // refused: `as%` wraps between integer widths, and f64 is a float
```

> Ruling: owner 2026-09-04, DECISIONS.md §"`as%` is the wrap cast".

**E8.5** A `boolean` converts to a number only through `as`: `true` is 1 and `false` is 0.
This cannot fail. A number does not convert to a `boolean`, so write the comparison you
mean (types.md §T1.6).

```vl
const b = true
print(b as i32)       // prints 1
print(false as f64)   // prints 0
```

**E8.6** A cast whose operand is a union selects a member, with the same three suffixes.
`u as? i32` is the `i32` member, or `null` when the value is not an `i32`. A cast over a
union of numbers to a type that every member converts to without failing (a float type, or
`i64` over integer members) converts the value.

```vl
function f(u: string | i32): i32 { (u as? i32) ?? -1 }
print(f(4))     // prints 4
print(f("x"))   // prints -1
```

**E8.7** `as` converts numbers only. Any other operand is refused.

```vl
const s = "3"
print(s as i32)   // refused: `as` supports numeric conversions only
```

## E9. Constant expressions

**E9.1** An expression built only from numeric literals, literal `const`s, parentheses,
unary `-` and `~`, and the arithmetic, bitwise and shift operators is a constant. It is
computed exactly, without wrapping or intermediate rounding. Its type is chosen where it
is used. A use that cannot hold the exact value is refused. An annotated `const` uses its
annotation as that destination.

```vl
const K = 2147483647 + 1
const big: i64 = K
print(big)               // prints 2147483648
print(7 / 2)             // prints 3
print(1 + 0.5)           // prints 1.5
print(0.1 + 0.2)         // prints 0.3
```

```vl
const x: i32 = 2147483647 + 1   // refused: constant 2147483648 overflows i32
```

Integer division by a constant zero is refused. A float division by zero is not folded.
A radix literal (`0x…`, `0b…`, `0o…`) is a bit pattern at its use's width under every
operator (types.md §T2.3).

> Ruling: owner 2026-09-30 (A), DECISIONS.md §"Exact constant arithmetic".

## E10. Evaluation order

**E10.1** Operands, arguments, list elements, map entries and object-literal fields are
evaluated left to right, in the order they are written. This holds whatever order the
values are stored in.

```vl
function t(s: string): i32 { print(s); return 1 }
type R = { z: i32, a: i32 }
const r: R = { z: t("z"), a: t("a") }
print(t("x") + t("y") * t("w") + r.a)
// prints z, a, x, y, w, 3 (one per line)
```

> Ruling: DECISIONS.md §"Evaluation order is SOURCE order, for every expression list in
> the language" (2026-09-03, D1510).

**E10.2** A trap is not an observable effect for this rule. When two operands without side
effects can both trap, either one may be the one that traps.

## E11. Calls

**E11.1** `f(a, b)` calls a declared function or a function value. The number of arguments
must match, except for parameters that are optional or have defaults (types.md §T8.2).

```vl
function f(a: i32): i32 { a }
print(f(1, 2))   // refused: wrong number of arguments: expected 1, got 2
```

**E11.2** Arguments may be named, `f(h: 2, w: 3)`. Named arguments may follow positional
ones. They work only on a call to a declared function, not on a function value.

```vl
function box(w: i32, h: i32): i32 { w * 10 + h }
print(box(h: 2, w: 3))   // prints 32
print(box(3, h: 2))      // prints 32
```

**E11.3** A default value is a literal, a module-level `const`, or `__callsite__`. Its names
resolve where the function is declared, and it is evaluated at each call.

```vl
const SEP = "-"
function join2(a: string, b: string, sep: string = SEP): string { a + sep + b }
print(join2("a", "b"))        // prints a-b
print(join2("a", "b", "+"))   // prints a+b
```

```vl
function j(a: string, b: string = a): string { a + b }   // refused: a default value must be a literal, a module-level `const`, or `__callsite__`
print(j("x"))
```

> Ruling: owner 2026-09-01, DECISIONS.md §"Default arguments v1".

**E11.4** `x.f(a)` calls a function `f` whose first parameter is named `self`, with `x` as
that argument. `f` is looked up in this order:

1. The names in scope in the calling module.
2. If `x`'s type is a named type, the exports of the module that declares that type.

A function whose first parameter has another name is not a method. Methods on built-in
types (lists, strings, maps, numbers) are found only through names in scope, so a std
function must be imported. The compiler itself provides only the storage operations
(`push`, `pop`, `length`, indexing, and the map and set operations).

```vl
function double(self: i32): i32 { self * 2 }
const n = 4
print(n.double())   // prints 8
```

```vl
const xs = [1, 2, 3]
print(xs.includes(2))   // refused: 'includes' is not imported
```

```vl
import { includes } from "std:array"
const xs = [1, 2, 3]
print(xs.includes(2))   // prints true
```

> Ruling: owner 2026-09-02, DECISIONS.md §"UFCS is never implicit"; partly superseded
> 2026-09-07 by type-bound UFCS (same section); refined 2026-09-22 (D1984). Owner
> 2026-10-03 (A′): built-in methods are storage operations only. Owner 2026-10-07 (O1):
> functions of one name may coexist when their first parameters are disjoint, and are told
> apart only at `x.f(…)`.

**E11.5** A getter is read as `v.x` with no parentheses. It is declared
`get x(self: T): R` beside a nominal type `T` (types.md §T10.2), and it is read-only.

```vl
type Color = new i32
get r(self: Color): i32 { ((self as! i32) >> 16) & 255 }
const c = 0x123456 as! Color
print(c.r)   // prints 18
```

> Ruling: owner 2026-09-22, DECISIONS.md §"Getters: declared, nominal-only, read-only, with
> a checked body".

## E12. Indexing

**E12.1** `xs[i]` reads element `i` of a list and traps when `i` is out of range. `m[k]`
reads a map and has type `V | null`, which is `null` when the key is absent.

```vl
const m: {[string]: i32} = Map()
m["a"] = 1
print(m["a"] ?? 0)   // prints 1
print(m["b"] ?? 0)   // prints 0
```

## E13. Blocks, `if` and `match` as values

**E13.1** The value of a block is the value of its last expression. A function body,
an `if` arm, a `match` arm and a lambda body are blocks. A `{` in expression position
begins an object literal, not a block. A block used as a value is written as a labelled
block (E13.4).

**E13.2** `if c { a } else { b }` is an expression. When the arms have different types, its
type is their join. An `if` without `else`, used as a value, has type `T | null`, where `T` is
its arm's type.

```vl
function f(c: boolean): string | null { if c { "hi" } }
print(f(true))    // prints hi
print(f(false))   // prints null
```

> Ruling: owner 2026-09-02, DECISIONS.md §"An else-less `if` used as a VALUE is `T | null`
> in every position" (D1086).

**E13.3** `match` is an expression. Its arms and exhaustiveness are in
[statements.md](statements.md).

```vl
function name(n: i32): string {
  match n {
    0 => "zero",
    1 => "one",
    _ => "many",
  }
}
print(name(7))   // prints many
```

**E13.4** `@B { … }` is a labelled block. Its value is its last expression, or the value
given to a `break @B v` that leaves it.

```vl
const d = true
const v = @B {
  if d { break @B 1 }
  2
}
print(v)   // prints 1
```

> Ruling: owner 2026-09-29 and 2026-09-30, DECISIONS.md §"Labels are marked at the exit,
> and any loop carries a value" and §"A label is `@name`, and `{ name: … }` is always an
> object" (D3374).

## E14. Function expressions

**E14.1** `(a: A, b: B): R => body` is a function value. The return type may be left out.
A parameter's type may be left out when the lambda is delivered to a known function type.

```vl
function apply(f: (x: i32) => i32, v: i32): i32 { f(v) }
print(apply((x) => x * 2, 5))   // prints 10
```

**E14.2** A closure captures the variables it names by reference. It sees later writes,
and its own writes are seen outside it. A `let` declared inside a loop body is a new
variable on each iteration.

```vl
let k = 1
const g = () => k
k = 5
print(g())   // prints 5
```

> Ruling: owner 2026-09-24 (a), DECISIONS.md §"Closures capture variables by reference"
> (D2339).

## E15. What is not an operator

**E15.1** `in` is part of the `for` head only. It is not a membership operator.

```vl
const xs = [1, 2]
print(1 in xs)   // refused: `in` is not an operator in VL outside a `for` loop's head
```

> Ruling: owner 2026-09-25 (Q10), DECISIONS.md §"`in` is a for-loop keyword, not an
> operator".

**E15.2** There is no conditional operator `c ? a : b`. Write `if c { a } else { b }`.
