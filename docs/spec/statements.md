# Statements

Examples run on master `98a4ed71b`, 2026-10-11.

A statement runs for its effect. This chapter covers program structure, bindings and their
scope, `if`, the three loops, labels and `break`, `match`, `return`, and declarations inside
a body. The VALUE of an `if`, a `match`, a loop or a labelled block is in
[expressions.md](expressions.md) §E13. Assignment is in §E7 there.

## S1. Programs

**S1.1** A source file is a sequence of declarations and statements. The top-level
statements run in order when the program starts. A function declared at the top level is
visible in the whole file, above its declaration as well as below.

```vl
print(g())
function g(): i32 { 7 }
print("end")
// prints 7, end
```

**S1.2** Statements are separated by a newline or a `;`. Any expression may stand as a
statement, and its value is discarded.

```vl
const a = 1; const b = 2; print(a + b)   // prints 3
```

**S1.3** `return` is valid only inside a function. At the top level, directly or inside a
top-level `if`, loop or `match`, it is refused. `exit(code)` from `std:process` ends the
program.

```vl
const n = 3
if n > 0 { return }   // refused: `return` is only valid inside a function
```

> Ruling: owner 2026-09-23, DECISIONS.md §"A `return` outside any function is refused"
> (D2262).

## S2. Bindings

**S2.1** `const` binds a name once. `let` binds a name that may be assigned again. Assigning
to a `const` is refused. A `const` fixes the binding, not the value: a field or element of
the value it holds can still be written.

```vl
const p = { x: 1 }
p.x = 5
print(p.x)   // prints 5
```

```vl
const x = 1
x = 2   // refused: cannot reassign `const` x
```

**S2.2** A binding's type is its annotation when it has one, and otherwise its initialiser's
type. A binding with neither is refused.

```vl
let x
x = 3   // refused: 'x' needs a type annotation or initializer
```

**S2.3** A `let` with an annotation may omit its initialiser. It must then be assigned on
every path before it is read.

```vl
function f(c: boolean): i32 {
  let x: i32
  if c { x = 1 } else { x = 2 }
  x
}
print(f(true))   // prints 1
```

```vl
function f(c: boolean): i32 {
  let x: i32
  if c { x = 1 }
  x   // refused: `x` is used before it is assigned
}
```

> Status: at the top level, `let x: i32` with no initialiser passes `vl check` and is then
> refused at build, "module global has no initializer" (D2020).

**S2.4** An unannotated binding initialised by a numeric literal takes its type from how it
is used. Each read of such a `const` is typed as the literal would be in its place
(types.md §T2.4). Such a `let` takes the type of what it is delivered to and what is stored
into it (types.md §T2.5).

```vl
const N = 7
const f: f64 = N
print(f / 2.0)   // prints 3.5
```

```vl
let x = 0
x = 2.5   // refused: cannot assign f64 to i32 — `x` on line 1 has no annotation, so its literal defaulted to `i32`
```

> Ruling: owner 2026-09-29 (B′ for `let`, C for `const`, "for now"), DECISIONS.md §"A
> literal binding takes its type from its uses" (D3246).

**S2.5** A `let` initialised with a generic function, or with a lambda whose parameters
are unannotated, keeps that generic type. Another generic function of the same shape may be
assigned to it. A concrete function is refused, with a fix that annotates the binding.

```vl
function inner<U>(u: U) { print(u) }
function cI32(n: i32) { print(n) }
let k = inner
k(1)
k("s")
k = cI32   // refused: cannot assign (i32) => void to `k`: it keeps the generic type of its initializer
```

> Ruling: owner 2026-10-10 (C, "what TypeScript does"), inventory D3960.

> Status: a `let` initialised with one generic function and assigned another passes
> `vl check` and traps when called, "indirect call type mismatch" (D3961).

## S3. Scope

**S3.1** A block `{ … }` opens a scope. A binding is visible from its declaration to the end
of the block that holds it. A read above the declaration is refused.

```vl
print(k)   // refused: `k` is used before it is assigned
const k: i32 = 4
```

A `const` initialised by a bare literal is the exception: every read of it is the literal
(S2.4), so it may be read above its declaration.

```vl
print(k)   // prints 4
const k = 4
```

**S3.2** A function may read a top-level binding declared below it. If the function is
called before that binding's initialiser has run, the read traps and names the binding.

```vl
function f(): i32 { k + 1 }
print(f())   // traps: `k` read before its initializer ran (line 3), via f
const k = [1, 2].length
```

> Ruling: owner 2026-09-26, inventory D2652: reading a module global before its initialiser
> ran is a run-time error.

**S3.3** Two bindings of one name in one scope are refused. A binding in an inner block or
an inner function may reuse an outer name, and hides the outer binding until its block ends.
The parameters of a function and the bindings directly in its body are one scope.

```vl
const x = 1
if true {
  const x = "s"
  print(x)   // prints s
}
print(x)     // prints 1
```

```vl
function f(x: i32): i32 {
  const x = 2   // refused: redeclared x
  x
}
```

A function declared directly in the body counts the same way. A function declared in an
inner block may reuse the parameter's name.

```vl
function outer(f: i32): i32 {
  function f(): i32 { 2 }   // refused: redeclared f: the parameter `f` and the function `f` declared in the same body are one scope
  f()
}
```

> Ruling: owner 2026-10-10, inventory D3945.

**S3.4** A block standing as a statement runs its body once, in a new scope. An empty block
`{}` as a statement is refused, since it does nothing. Where a value is expected, `{}` is
an empty block, and the empty record is written `({})`.

```vl
function f() {
  { print(1) }
}
f()   // prints 1
```

```vl
function f() {
  {}   // refused: an empty block does nothing; remove it
  print(1)
}
```

> Ruling: owner 2026-09-23, DECISIONS.md §"`{}` completes an all-nullable record; a `{}`
> statement is an empty block and refused" (D2223).

**S3.5** Where a body, branch or arm may hold a block or an object literal, braces whose
first token is a name followed by `:` or `,` hold an object. A lone `{ name }` is a block
whose value is `name`.

> Ruling: DECISIONS.md §"`{ name, … }` is an object too; only a lone `{ name }` is a block"
> (D3475); owner 2026-09-30, §"A label is `@name`, and `{ name: … }` is always an object"
> (D3374).

## S4. `if`

**S4.1** `if c { … }` runs its block when `c` is true. `c` must be a `boolean`; there is no
truthiness. Braces are required around every body. `else { … }` and `else if` follow the
closing brace, on the same line or the next.

```vl
const n = 2
if n == 1 { print("a") } else if n == 2 { print("b") } else { print("c") }   // prints b
```

```vl
if 1 { print(1) }   // refused: if-condition must be boolean, got i32
```

```vl
if false { print(1) } else print(2)   // refused: an `else` body requires braces: `else { … }`
```

> Ruling: owner 2026-09-01, DECISIONS.md §"An `else` body requires braces".

## S5. Loops

**S5.1** `while c { … }` runs its block while `c` is true. `c` must be a `boolean`. There
is no `do … while`.

```vl
let n = 0
while n < 3 { n += 1 }
print(n)   // prints 3
```

**S5.2** `for i in a to b { … }` counts `i` from `a` to `b` inclusive. `a until b` stops
before `b`. `step s` sets the increment, which may be negative. The bounds and the step
are `i32`, and each is evaluated once, before the first iteration.

```vl
for i in 0 until 3 { print(i) }          // prints 0, 1, 2
for i in 0 to 6 step 2 { print(i) }      // prints 0, 2, 4, 6
for i in 3 to 0 step -1 { print(i) }     // prints 3, 2, 1, 0
```

```vl
const n: i64 = 3
for i in 0 to n { print(i) }   // refused: for-range bounds must be i32, got i32 and i64
```

**S5.3** A range whose bounds and step are all constants, and whose direction contradicts
its step, is refused, and so is a constant step of 0. Equal bounds run once. A range
computed at run time that cannot run runs zero times.

```vl
for i in 3 to 0 { print(i) }   // refused: this range never runs: `3 to 0` counts up (step 1) from a start above its end
```

```vl
const xs = [1]
for i in 3 until xs.length { print(i) }
print("done")   // prints done
```

> Ruling: DECISIONS.md §"A CONSTANT range that cannot run is refused; a computed one still
> runs zero times" (D1588, 2026-09-04).

> Status: `step 0` is reported twice (D4057).

**S5.4** A range's variable is a fresh binding for each iteration. The body may assign it,
and the next iteration steps from the assigned value.

```vl
for i in 0 to 5 {
  print(i)
  i = i + 2
}
// prints 0, 3
```

**S5.5** `for x in xs { … }` runs its block once per element of the list `xs`, in order.
`for x, i in xs` also binds the element's index. `xs` is evaluated once. The length is
read at every step, so an element pushed during the walk is visited.

```vl
for x, i in [10, 20] { print(x + i) }   // prints 10, 21
```

```vl
const xs = [1, 2]
for x in xs {
  if x == 1 { xs.push(9) }
  print(x)
}
// prints 1, 2, 9
```

**S5.6** `for k in m` walks a map's keys in insertion order, and `for k, v in m` its keys and
values. `for v in s` walks a `Set` in insertion order. A walk whose body deletes from or
inserts into the collection it walks behaves like a JavaScript `Map` walk: an entry deleted
before the walk reaches it is skipped, and an entry inserted during the walk is visited.

```vl
const m = Map<string, i32>()
m.set("a", 1)
m.set("b", 2)
for k in m { m.delete(k) }
print(m.length)   // prints 0
```

> Ruling: owner 2026-09-24 (a), DECISIONS.md §"Deleting from a map while walking it is
> defined, and behaves like JS `Map`" (D2315).

**S5.7** `for c in s` over a `string` walks its code points, each an `i32`.

```vl
for c in "ab" { print(c) }   // prints 97, 98
```

**S5.8** A loop variable, and a binding declared in a loop body, is a new binding in each
iteration. A closure created in one iteration keeps that iteration's value.

```vl
const fs: (() => i32)[] = []
for i in 0 to 2 { fs.push(() => i) }
print(fs[0]())   // prints 0
print(fs[2]())   // prints 2
```

> Ruling: owner 2026-09-24 (a), DECISIONS.md §"Closures capture variables by reference"
> (D2339).

## S6. Labels, `break` and `continue`

**S6.1** `break` leaves the innermost loop. `continue` starts its next iteration. Either is
refused outside a loop of the same function; a `break` in a lambda does not reach a loop
around the lambda.

```vl
let i = 0
while i < 6 {
  i += 1
  if i % 2 == 0 { continue }
  if i == 5 { break }
  print(i)
}
// prints 1, 3
```

```vl
function f() { break }   // refused: `break` is not inside a loop or labelled block of this function
```

**S6.2** A label `@name` stands before a `while`, a `for` or a `{` on the same line. The
jump names it with the same token: `break @name`, `continue @name`. A label names only a
loop or block that the jump is written inside.

```vl
@outer for i in 0 until 3 {
  for j in 0 until 3 {
    if j == 1 { continue @outer }
    if i == 2 { break @outer }
    print(i * 10 + j)
  }
}
// prints 0, 10
```

**S6.3** `@B { … }` is a labelled block. It runs once, and `break @B` leaves it early.
`continue @B` is refused. A bare `break` or `continue` whose way to its loop crosses a
labelled block is refused: inside a block, a jump names the frame it leaves.

```vl
const bad = true
@B {
  print("a")
  if bad { break @B }
  print("b")
}
print("c")
// prints a, c
```

```vl
for i in 0 to 3 {
  @B {
    if i == 1 { break }   // refused: inside labelled block `@B`: write `break @B` to leave the block, or label the loop and write `break @L`
  }
}
```

The spellings before the 2026-09-30 ruling, `B: { … }`, `L: while`, `break :B` and
`continue :L`, are refused with the spelling that replaces them.

> Ruling: owner 2026-09-29, DECISIONS.md §"Labels are marked at the exit, and any loop
> carries a value"; owner 2026-09-30, §"A label is `@name`, and `{ name: … }` is always an
> object" (D3374).

**S6.4** `break v` leaves a loop with the value `v`, and the loop is then an expression.
The type is the join of its `break` values. A `while` or `for` that can end without a
`break v` adds `null`. `while true`, with the literal `true`, cannot end that way and does
not add `null`. A `break` whose value is `void` is refused.

```vl
const xs = [3, 12, 40]
const found = for x in xs {
  if x > 10 { break x }
}
print(found)   // prints 12
```

```vl
let i = 0
const v: i32 = while true {
  i += 1
  if i == 4 { break i * 2 }
}
print(v)   // prints 8
```

```vl
let i = 0
const v: i32 = while i < 9 {   // refused: cannot assign i32 | null to 'v' of type i32
  i += 1
  if i == 4 { break i }
}
```

> Status: a non-null record value of a loop or block passed straight to an unannotated
> parameter at module scope is refused at build (D3224). A loop or block value of a
> function type is refused at build (D3256).

## S7. `match`

**S7.1** `match s { p => e, … }` runs the first arm whose pattern matches `s`. There is no
fallthrough. Arms are separated by a comma or a newline. An arm's body is an expression or
a block. `s` is evaluated once.

```vl
let n = 0
function next(): i32 { n += 1; n }
match next() {
  1 => print("one"),
  _ => print("other"),
}
print(n)   // prints one, 1
```

**S7.2** The scrutinee is a union or an integer. A `string`, `boolean` or float scrutinee
is refused.

```vl
function f(s: string): i32 {
  match s {   // refused: match scrutinee must be a union or an integer, got string
    "a" => 1,
    _ => 2,
  }
}
```

**S7.3** Over a literal union the patterns are its literals. `p | q` matches either. A
`match` over a closed set must cover every member, or have a `_` arm.

```vl
type K = "a" | "b" | "c"
function f(k: K): i32 {
  match k {
    "a" => 1,
    "b" | "c" => 2,
  }
}
print(f("c"))   // prints 2
```

```vl
type K = "a" | "b" | "c"
function f(k: K): i32 {
  match k {   // refused: non-exhaustive match — missing "c" (add the arm or a `_`)
    "a" => 1,
    "b" => 2,
  }
}
```

**S7.4** Over a union of types the patterns are type names, and `null` for a nullable
scrutinee. In an arm, the scrutinee is narrowed to the arm's type. `T{a, b: c}` reads
fields into arm-local constants: `a` binds field `a`, and `c` binds field `b`.

```vl
type Move = { kind: "m", x: i32, y: i32 }
type Quit = { kind: "q" }
type Cmd = Move | Quit
function f(c: Cmd): i32 {
  match c {
    Move{x, y: b} => x + b,
    Quit => 0,
  }
}
print(f({ kind: "m", x: 2, y: 5 }))   // prints 7
```

```vl
function f(x: i32 | null): i32 {
  match x {
    null => 0,
    i32 => x + 1,
  }
}
print(f(4))   // prints 5
```

**S7.5** Over an `i32` or `i64` scrutinee the patterns are integer literals of its type,
negative ones included, and the `_` arm is required. `0x10` and `16` are the same pattern.

```vl
function f(n: i32): string {
  match n {
    0x10 => "sixteen",
    1 | 2 => "small",
    -1 => "neg",
    _ => "other",
  }
}
print(f(16))   // prints sixteen
print(f(-1))   // prints neg
```

```vl
function f(n: i32): i32 {
  match n {   // refused: non-exhaustive match — an integer `match` needs a `_` arm
    0 => 1,
  }
}
```

> Ruling: DECISIONS.md §"`match` over an integer scrutinee" (D1572, 2026-09-03).

**S7.6** A `const` whose initialiser is a literal is a pattern, and matches its value. Any
other bare name that is not a type is refused.

```vl
const MAGIC = 7
const ROOT = 9
function f(n: i32): string {
  match n {
    MAGIC => "magic",
    ROOT => "root",
    _ => "?",
  }
}
print(f(9))   // prints root
```

```vl
function f(n: i32): string {
  match n {
    MAGICK => "magic",   // refused: unknown name `MAGICK` in match pattern
    _ => "?",
  }
}
```

> Ruling: owner 2026-09-29 (A), DECISIONS.md §"A `const` with a literal value is a `match`
> arm" (D3271).

**S7.7** An arm that an earlier arm already covers is refused, and so is an arm after `_`.
A `_` after arms that already cover every member is allowed.

```vl
function f(n: i32): i32 {
  match n {
    16 => 1,
    0x10 => 2,   // refused: redundant match arm: `0x10` is already covered
    _ => 3,
  }
}
```

```vl
function f(n: i32): i32 {
  match n {
    _ => 0,
    1 => 1,   // refused: unreachable match arm — the `_` wildcard must be the last arm
  }
}
```

## S8. `return` and `never`

**S8.1** `return e` leaves the function with `e`, and a bare `return` leaves a function that
returns nothing. A function with a declared non-`void` return type must return a value on
every path; the last expression of its body is its value.

```vl
function f(c: boolean): i32 {
  if c { return 1 }   // refused: not all code paths return a value in 'f'
}
```

```vl
function f(): i32 { return }   // refused: return needs a value of type i32
```

**S8.2** A call to `__trap__()`, or to a function whose declared return type is `never`,
ends its path. Code after it is unreachable, and a path that ends in it needs no `return`.
`never` is legal only as a function's declared return type, and a `never` function must end
every path in such a call.

```vl
function fail(msg: string): never { __trap__(msg) }
function g(x: i32 | null): i32 {
  if x == null { fail("no") }
  x
}
print(g(3))   // prints 3
```

```vl
function fail(): never { print("x") }   // refused: `fail` is declared `never` but can return
```

> Ruling: owner 2026-09-22, DECISIONS.md §"A call that never returns ends a path, through a
> `never` type — and only a declared one" (D1972).

## S9. Declarations in a body

**S9.1** A `function` declared in a block is visible from its declaration to the end of the
block. It may read the bindings around it and may call itself. It may not be called above
its declaration, so two local functions cannot call each other.

```vl
function outer(n: i32): i32 {
  const base = 10
  function add(k: i32): i32 { base + k }
  add(n)
}
print(outer(5))   // prints 15
```

```vl
function outer(): i32 {
  const r = g()   // refused: undeclared identifier 'g'
  function g(): i32 { 1 }
  r
}
```

> Ruling: owner 2026-10-04 (A), inventory D3608.

**S9.2** A `type` declared in a block is scoped to that block and hides an outer type of
the same name. A local record type leaves the function as its shape. A local nominal type
(`new`) cannot be a function's inferred return type.

```vl
type P = { x: i32 }
function f(): string {
  type P = { s: string }
  const p: P = { s: "in" }
  p.s
}
print(f())   // prints in
```

> Ruling: owner 2026-09-02, DECISIONS.md §"A `type` declared in a function body is legal and
> lexically scoped" (D1045).
