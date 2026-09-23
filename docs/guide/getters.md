# Getters

A getter is a read-only property of a nominal type: `v.x` with no parentheses, computed by a
small function the type's own module declares. Every example below was run against the shipped
compiler. The design and the rulings are in `docs/internals/property-access-design.md` (§D3a).

```vl
type Color = new i32

get r(self: Color): i32 { ((self as! i32) >> 16) & 255 }
get g(self: Color): i32 { ((self as! i32) >> 8) & 255 }

const c = 0x123456 as! Color
print(c.r)   // 18
print(c.g)   // 52
```

The declaration spells like a `self`-function with `get` in place of `function`. `get` is a
keyword only there: at the start of a top-level declaration, followed by a name and `(`. Every
other `get` is an ordinary identifier, so `const get = 7` and a map's `m.get(k)` are untouched.

## The declaration

- **One parameter, `self`, annotated with the receiver type.** `get x(self: T): R`.
- **The result type is required.** The body contract below checks against it.
- **Top level only.** A getter inside a function body is a parse error.
- **Export it to reach it from another module.** `export get x(self: T): R`. Inside its own
  module an un-exported getter reads normally; from any other module it is refused, the same
  boundary methods keep.

## Where a getter is found

A getter belongs to its **receiver type**, and it is found only through that type:

- **The receiver must be nominal**, a `type N = new …` brand over a scalar, a struct, a string
  or anything else. A getter on a structural type (`type P = { a: i32 }`, or an inline `{ … }`)
  is refused at its declaration.
- **Only the module that declares the type may declare its getters** (the orphan rule, as for
  operators and type-bound methods).
- **A getter is never looked up by name.** You do not import it, and a local `x` (a `const`, a
  `function`, a parameter) can neither shadow `v.x` nor collide with the getter. Reading `v.x`
  from a module that imported only the type works.
- **A field wins.** On a brand over a struct, a getter with the same name as a field could never
  be read, so declaring one is an error. The same holds for a built-in member (`length` on a
  brand over a list or a string, `size` on a map).
- **No method of the same name.** A getter may not share its name with a built-in method of the
  receiver's representation (`push` on a brand over a list) or with a `self`-function of the
  same module over the same type, since `v.x` and `v.x()` would then mean different things.
- **Generic `new` types cannot carry a getter yet.** An instance such as `Box<i32>` is not
  branded (D2031), so a getter on it is refused.

## What a getter is not

- **Not writable.** `v.x = 1` and `v.x += 1` are refused, naming the getter. There are no
  setters.
- **Not usable through a bound, yet.** A getter satisfies no bound. A value whose `x` is a
  getter does not satisfy a `{ x: f32 }` bound, and it cannot be passed where a `{ x: f32 }`
  record is expected, including an un-annotated parameter whose body reads `.x` (its inferred
  type is that record). A record type in VL is a layout and a write permission, and a getter is
  neither. It does not satisfy the method bound `{ x(): f32 }` either, because a getter is not
  read with `()`. So a getter is for concrete code: a parameter typed as the receiver reads it.
  When generic code needs the value, declare it as a method instead, which does satisfy
  `{ x(): f32 }`:

  ```vl
  type Rgb = new i32
  function r(self: Rgb): i32 { return ((self as! i32) >> 16) & 255 }
  function red<T: { r(): i32 }>(t: T): i32 { return t.r() }
  print(red(0x123456 as! Rgb))   // 18
  ```

  A type cannot have both a getter and a method named `x` (see above), so this is a choice made
  once per property. Read-only structural bounds (`{ readonly x: f32 }`) are future work.
- **Not a narrowing place.** `v.p` behaves like a call result: `if v.p != null { v.p.z }` does
  not narrow the second read, and the refusal says so. Bind it to a local first:
  `const p = v.p; if p != null { p.z }`.
- **Not a method.** `v.x()` is refused, and the message names the getter `.x` read and says to drop the `()`.
- **Not read through `?.`.** `?.` reads only a declared struct field, as it already refuses a
  built-in `.length`, so `v?.x` on a nullable receiver is refused by name. Narrow the receiver
  instead: `if v != null { v.x }`.

## The body contract

A getter reads like a field, so its body must cost like one. The checker refuses a body that is
not:

| rule | refused |
| --- | --- |
| loop-free | `while`, `for`, and so `break` / `continue` |
| recursion-free | a getter that reads itself, directly or through other getters (`x` reads `y`, `y` reads `x`) |
| allocation-free | a struct, list or closure literal; string `+`; string interpolation |
| effect-free | an assignment to anything but its own `let` locals; a read of a module `let` binding (the heap reachable from `self` or a module `const` stays readable, like linear memory) |
| calls intrinsics and getters only | a user or std function, a method (`s.slice(…)`), a host `extern`, a function value (including one named like an intrinsic), a user operator (`"+"` or `"[]"` for a nominal type) |
| no hidden loops | `==` `!=` `<` `<=` `>` `>=` over two strings, or over lists, maps or structs; an index into a map; list `+`; float `%` |
| bounded | a body costing more than 16 steps (below) |

Allowed: `let` / `const` locals (a local ends with its block), `if` and `match` expressions,
reads of `self`'s fields and of module `const`s, other getters, `as` conversions, comparisons
of scalars and of literal unions (a tag compare), a test against `null`, a string's `.length`
and byte index, `==`, `!=` and `is` against a string literal (a compare that stops at the
literal's length), and every intrinsic that compiles to
instructions with no effect but a trap: the scalar numeric ones (`sqrt`, `abs`, `floor`,
`ceil`, `trunc`, `nearest`, `min`, `max`, `copysign`, `clz`, `ctz`, `popcnt`, `rotl`, `rotr`,
`divU`, `remU`, the unsigned compares and the bitcasts), linear-memory `__load_*` reads, lane
operations and `__trap__`. A trap, from `as!`, an integer division or `divU` by zero, is
allowed: the program stops either way.

**The step budget.** A getter may read other getters, so a body that looks small can do a lot
of work: four reads of a getter that reads four more is sixteen reads behind one `.x`. The
checker counts abstract steps and refuses a getter over **16**. Reading a getter costs 1 plus
that getter's own cost; comparing with a string literal costs the literal's length (`is "ab" |
"cd"` costs both, 4); an `if` or `match` costs its dearest arm, not the sum; arithmetic, field
reads, conversions and intrinsics cost nothing. The refusal names the path that made the total:

```
the getter `a4` on C costs 340 steps (a4 → a3 (4×) → a2 (4×) → a1 (4×) → a0 (4×)), and a getter
must cost at most 16 steps — make it a method: `function a4(self: C): i32`, called as `.a4()`
```

A chain over the budget is one error, at the getter no other over-budget getter reads.

**The type rule.** A value's representation can allocate with no allocating syntax at all, so
the result and every local must have a representation that never boxes: a scalar (or a brand of
one), a literal union, a reference to an existing struct, list, map or string, or a null niche
(a nullable struct, `string | null`, `boolean | null`). A value union such as `i32 | string`, or a
nullable scalar such as `i32 | null`, is refused, and the refusal names the type. In short: a
getter cannot return a nullable number, but nullable strings, structs and booleans are fine.

**When a body is refused, make it a method.** Every refusal names the construct, the rule it
breaks and the fix, which is always available: the same declaration with `function` in place
of `get`, read with `()`. A method has no body contract.

```
the getter `full` on Name concatenates strings, and a getter must not allocate — make it a
method: `function full(self: Name): string`, called as `.full()`
```

One mistake is one error: a `+` chain is refused once, a boxed result once (at the result
type), and a function called three times once.

The contract is deliberately conservative, and the budget will be tuned as getters are used.

## What it costs

Nothing over the call. A getter read is rewritten into a call to the getter before code
generation, so `v.x` and `x(v)` produce byte-identical modules at every optimisation level. At
`-O` a lane getter over a `new v128` is one `f32x4.extract_lane`, and a getter that reads a
field is the one `struct.get` the field read is (`tests/vl_getter_codegen_test.ts`).

The flat-row pattern (`docs/internals/flat-records-design.md` §9) reads a row's field through a
getter over the row address, so the requirements' `stack[i].tt` works as written:

```vl
type RowAddr = new i32
get tt(self: RowAddr): i32 { __load_i32__((self as! i32) + TValue.tt) }

print(st[3].tt)   // an add, then an i32.load
```

A getter read also keeps source evaluation order: an object literal holding one evaluates its
fields in the order written.

## In the editor

A getter read is coloured as a `property` with the `readonly` modifier, completion after `v.`
offers the getter beside the fields with the `Property` kind, and go-to-definition on `.x` lands
on the `get x` declaration.
