# Operators

What each operator means, on what operand types, and what it produces. Every cell below was
run against the shipped compiler; where an answer is surprising the reason is stated rather
than left to be re-derived. The precedence ladder is the parser's own
(`compiler/parser.vl` §`binPrec`), looser to tighter:

```
??  ||   <   &&   <   |   <   ^   <   &   <   ==  !=   <   <  <=  >  >=   <   <<  >>  >>>   <   +  -   <   *  /  %
```

Assignment (`=`, and the compound forms `+= -= *= /=`) binds loosest of all and is
right-associative. `as` / `as?` / `as!` bind tighter than every binary operator, so
`a + b as! i32` is `a + (b as! i32)`. Unary `-` `!` `~` bind tighter still.

## Arithmetic

| operator | operands | result | notes |
| --- | --- | --- | --- |
| `+` | two numbers | the wider of the two | also `string + string` (concat) and `T[] + T[]` (a fresh list) |
| `-` `*` | two numbers | the wider of the two | |
| `/` | two integers | that integer type | TRUNCATES toward zero: `-7 / 2` is `-3`, not `-4` |
| `/` | with a float operand | the float type | ordinary IEEE division; `1.0 / 0.0` is `Infinity` |
| `%` | two numbers | the wider of the two | the TRUNCATED remainder — see below |
| unary `-` | a number | the same type | |

A mixed pair widens the narrower operand: `i32 op i64` is `i64`, anything with an `f64` is
`f64`, `f32 op f64` is `f64`. There is no implicit narrowing anywhere; `x as! i32` is how you
go the other way, and it is exact-or-fail (see `as`, below).

### `%` is the truncated remainder — the same one Rust, JavaScript and C compute

`a % b` has the value of `a - b * trunc(a / b)` and **takes the sign of the DIVIDEND**:

```vl
print(7 % 2)          // 1
print(-7 % 2)         // -1     — the dividend's sign, not the divisor's
print(7.5 % 2.0)      // 1.5
print(-7.5 % 2.0)     // -1.5
```

It is **not** the mathematical modulus. If you want a non-negative answer for a negative
dividend, write `((a % b) + b) % b`.

Over integers, `x % 0` **traps** (as `x / 0` does). Over floats it follows IEEE-754 and
C's `fmod` exactly: `x % 0.0` is `NaN`, `Infinity % b` is `NaN`, `a % Infinity` is `a`, and
`-0.0 % 1.0` is `-0.0`. The float form is computed by an exact scaled-subtraction intrinsic
rather than by evaluating the `a - b * trunc(a / b)` identity, which drifts by an ulp once
the quotient passes 2^53 — so `1e308 % 3.0` is `2`, not an approximation of it.

## Comparison and logic

| operator | operands | result | notes |
| --- | --- | --- | --- |
| `==` `!=` | two values of compatible type | `boolean` | VL has no cross-type equality; structural for lists and structs |
| `<` `<=` `>` `>=` | two numbers, or two strings | `boolean` | strings compare by code point |
| `&&` `\|\|` | two booleans | `boolean` | short-circuiting |
| `!` | a boolean | `boolean` | |
| `??` | a nullable and a fallback | the non-null type | `a ?? b` yields `b` only when `a` is `null` |

## Bitwise and shifts — integers only

| operator | meaning |
| --- | --- |
| `&` `\|` `^` | and / or / xor |
| `<<` | shift left |
| `>>` | ARITHMETIC (sign-propagating) shift right — `-16 >> 2` is `-4` |
| `>>>` | LOGICAL (zero-filling) shift right — `-16 >>> 28` is `15` |
| `~` | bitwise not |

These are about BIT PATTERNS, so a float operand is refused: `1.0 & 2` is
`operator '&' is integer-only, got f64 and i32`. `%` is deliberately **not** in this family —
a float remainder is a meaningful number, and VL computes it.

## `as` / `as?` / `as!` — the conversion trio

A cast to a FLOAT target rounds and cannot fail. A cast to an INTEGER target is
**exact-or-fail**: it succeeds only if the value is integral *and* in range. The suffix says
what happens when it fails, and the three spellings are three different programs:

| spelling | on success | on failure |
| --- | --- | --- |
| `x as! T` | `T` | traps, with `as! T at <line>:<col>: not exact` |
| `x as? T` | `T` | `null` — the expression's type is `T \| null` |
| `x as T` | `T` | returns `null` from the enclosing function, which must return `\| null` |

```vl
print(3.9 as? i32)                 // null — 3.9 is not an integer
print(3.0 as? i32)                 // 3
print(5000000000 as? i32)          // null — out of i32's range
```

`x as u8` is the same narrowing with **0..255** as its domain, and the value it produces is
an ordinary `i32` inside that range — `u8` names a byte-sized range, not a value type (there
is no `u8` local, parameter, return or field). Every numeric source can fail it, `i32`
included, because 300 is a perfectly good `i32` and not a byte:

```vl
const bytes: u8[] = []
bytes.push(v as! u8)               // traps unless v is already in 0..255
const b = v as? u8                 // `i32 | null`
```

Storing into a `u8[]` **without** the cast still keeps the low byte and never complains
(`bytes.push(300)` stores 44) — the cast is the check the store is not. See
[`collections-design.md`](collections-design.md) §"What you write TODAY" for the store.

A cast whose operand is a UNION picks an ARM instead, with the same three suffixes and the
same meanings; `x as u8` is not that cast, and refuses a union operand rather than silently
skipping the range test.
