# Open questions

These are surface questions that the spec found unsettled. For each one, either no ruling
covers it, or two sources disagree. Each question names the chapter rule that raises it,
gives what the compiler does today, and lists options with a code sample apiece. It ends
with a recommendation. The spec states only today's behaviour until the owner rules. A
ruled question moves to `DECISIONS.md`, and the chapter's `Open question:` line becomes a
`Ruling:` line.

## Q1. Block comments

Raised by lexical.md §L2.2.

**Today.** `/* … */` is not a comment. The lexer reads `/` and `*` as operators, and the
parser refuses the line with a message that does not mention comments:

```vl
/* block */   // refused: expected an expression but found SLASH
```

No ruling, guide or design document addresses block comments.

**(a) Line comments only, with a dedicated refusal.** The parser recognises `/*` at the
start of an expression and says what to write instead.

```vl
/* block */   // refused: VL has no block comments; start each line with `//`
```

**(b) Add `/* … */`, not nesting.** This is the C and JavaScript form, where the first
`*/` ends the comment.

```vl
const x = 1 /* inline */ + 2
print(x)   // prints 3
```

**(c) Add nesting block comments.** This is the Rust and Swift form, where `/* /* */ */`
is one comment, so a region that already contains a block comment can be commented out.

```vl
/* outer /* inner */ still a comment */
print(1)   // prints 1
```

**Recommendation: (a).** One comment form keeps `vl fmt`, doc comments (`///`) and the
lint comment rules simple, and agents rarely need an inline comment. The defect today is
the message, not the missing feature.

## Q2. Does `is A` hold of a record with more fields than `A`?

Raised by types.md §T3.4.

**Today.** Width subtyping lets a `{ x, y }` record be delivered where `{ x }` is expected
(types.md §T4.6). But `is` over a union of the two does not treat the wider value as an
`A`:

```vl
type A = { x: i32 }
type B = { x: i32, y: i32 }
function f(v: A | B): i32 {
  if v is A { return 1 }
  2
}
print(f({ x: 1, y: 2 }))   // prints 2
```

The `is` ruling of 2026-10-10 (D3885) says `is` tests whether the value fits the type,
not the declaration it was built from. Its witness is a contained literal domain
(`{x: i32}` against `{x: 1 | 2}`). It does not say whether a value with extra fields fits
a record type with fewer.

**(a) Width fits.** Any value with `A`'s fields is an `A`, matching assignability. The
example prints `1`, and the `B` arm is reachable only when it is tested first. The
contained-arm hint (`contained-arm-is-test`) would fire on `is A` here.

```vl
print(f({ x: 1, y: 2 }))   // would print 1
```

**(b) A record's field set is exact under `is`.** `is A` holds of a record value whose
fields are exactly `A`'s, and field types and literal domains still fit by value as D3885
says. This is today's behaviour.

```vl
print(f({ x: 1, y: 2 }))   // prints 2
```

**Recommendation: (b).** Its field set is the only discriminant a structural record has.
Under (a), a union of `{ x }` and `{ x, y }` could not be told apart in either order
without a hand-written field test. (b) also leaves every program that runs today
unchanged.

## Q3. A list literal of bare `null`

Raised by types.md §T6.1. Already filed as D1832. Its options and recommendation are in
`docs/internals/open-rulings.md` §D1832, and are not repeated here.

**Today.** `vl check` accepts the program and the build fails:

```vl
const e = [null]
print(e.length)   // passes vl check; the build fails: bare null needs a struct-typed context
```

## Q4. Two record arms with the same field names and no literal field to tell them apart

Raised by types.md §T3.4 and `docs/guide/unions.md`.

**Today.** A union of two records with the same field names is refused when it is formed,
unless some field is literal-typed in both arms. The refusal fires before any `is` is
written:

```vl
type A = { v: i32 }
type B = { v: boolean }
function f(u: A | B): i32 { 1 }   // refused: arms `A` and `B` share a field-name set and no literal-typed field distinguishes them — add a discriminant field
```

The 2026-09-02 ruling that this refusal came from is amended by D3870 (same-shape records
are one type, 2026-10-08) and D3885 (`is` tests whether the value fits, 2026-10-10). Neither
says whether this union is legal. The refusal's wording is also false for one shape it
covers (D4056).

**(a) Keep the refusal as a design rule.** Same-named record arms need a field that is
literal-typed in both, with disjoint literal sets. D4056's `{ k: "x" } | { k: 1 }` is then
admitted, because its sets are disjoint.

```vl
type A = { v: i32, kind: "a" }
type B = { v: boolean, kind: "b" }
function f(u: A | B): i32 { if u is A { 1 } else { 2 } }
print(f({ v: true, kind: "b" }))   // would print 2
```

This program passes `vl check` today, and its build fails with "union `A|B` cannot be
discriminated" (D3033, open).

**(b) Admit the union, and refuse only an `is` that the values cannot answer.** The type
`{ v: i32 } | { v: boolean }` is legal, and `u.v` reads as `i32 | boolean`. `u is A` is
refused with the same advice to add a discriminant field.

```vl
type A = { v: i32 }
type B = { v: boolean }
function show(u: A | B): string { if u.v is i32 { "int" } else { "bool" } }
print(show({ v: true }))   // would print bool
```

**(c) Admit both, with `is` answered by each field's value.** `u is A` is true when `u.v`
holds an `i32`. Where the two fields' types share a representation, as `i32` and
`boolean` do, this needs a run-time record of which type the field holds, and D3870's "no
runtime tags" rules that out for records. Where the representations differ (`i32` against
`string`), the field's value already answers the test and no tag is needed.

```vl
type A = { v: i32 }
type B = { v: boolean }
function f(u: A | B): i32 { if u is A { 1 } else { 2 } }
print(f({ v: true }))   // would print 2
```

**Recommendation: (b).** It refuses only the one operation that has no answer, and it
moves the refusal to the line that needs the discriminant. (c) contradicts D3870 for
fields that share a representation, so it could only be given for some field types. (a) keeps
a refusal of a type that can be used without the test.

## Q5. Boolean and negative integer literal types

Raised by types.md §T3.2.

**Today.** `true` and `false` are not types, and `match` does not take them as patterns. A
negative integer literal type is a parse error.

```vl
type T = true     // refused: expected an identifier but found `true`
type U = -1 | 1   // refused: expected an identifier but found `-`
```

**(a) Neither.** `boolean` already has two values. Each refusal gets a sentence that says
so, for example "a boolean literal is not a type; write `boolean`".

**(b) Both.** `true`, `false` and a negated integer literal are literal types, and `match`
takes `true` and `false` as patterns, exhaustive over `boolean`.

```vl
type Ok = { ok: true, v: i32 }
type Err = { ok: false, e: string }
function f(r: Ok | Err): i32 { if r.ok { r.v } else { -1 } }
print(f({ ok: true, v: 3 }))   // would print 3
type Sign = -1 | 0 | 1
```

**(c) Negative integer literal types only.** `-1 | 0 | 1` is legal, and `true` stays a value.

**Recommendation: (b).** `{ ok: true, … } | { ok: false, … }` is the common shape for a
result record, and it needs a boolean literal field as its discriminant. A negative literal
is already one constant everywhere else (types.md §T2.1), so a type that cannot spell it is
an odd gap.

## Q6. The arrow `=>` as one token

Raised by lexical.md §L9.1.

**Today.** `=>` is lexed as `=` then `>`, so a space between them is accepted in a lambda,
a function type and a `match` arm:

```vl
const f = (x: i32): i32 = > x + 1
print(f(1))   // prints 2
```

**(a) One token.** `= >` is refused, as `= =` is for `==`.

```vl
const f = (x: i32): i32 = > x + 1   // would be refused: expected an expression but found `>`
```

**(b) Keep two tokens.** `= >` stays a second spelling of `=>`.

**Recommendation: (a).** Every other multi-character operator is one token. A second
spelling helps no author, and `vl fmt` would have to normalise it.

## Q7. A whole-number float literal at an integer type

Raised by types.md §T2.4.

**Today.** The same literal is refused when written in place and accepted when it is read
through a `const` or computed in a constant expression:

```vl
const a: i32 = 1e3       // refused: f64 doesn't fit in i32 — the conversion is lossy
const c = 1e3
const b: i32 = c         // runs: b is 1000
const d: i32 = 1e3 * 1   // runs: d is 1000
```

Ruling C (2026-09-29) says each read of a literal `const` is typed "exactly as the literal
written there would be", so `a` and `b` should agree. Ruling A (2026-09-30) accepts a float
constant at an integer type when it is a whole number (`2.5 * 4` at `i64` is `10`), but
it names arithmetic, and `a`'s initialiser has no operator.

**(a) Accept a whole-number float literal at an integer type everywhere.** `a` is 1000, and
`3.5` at `i32` is still refused.

```vl
const a: i32 = 1e3
print(a)   // would print 1000
```

**(b) Refuse a float literal at an integer type everywhere,** through a `const` and in a
constant expression too. `b` and `d` are refused, and so is `2.5 * 4` at `i64`, which
reverses part of ruling A.

```vl
const c = 1e3
const b: i32 = c   // would be refused: f64 doesn't fit in i32
```

**(c) Keep today's split.**

**Recommendation: (a).** It is the only option under which ruling A and ruling C both hold
as written. A literal such as `1e6` is a natural way to write a large whole count, and the
exactness rule still refuses every literal that has a fraction.

## Q8. A positional argument after a named one

Raised by expressions.md §E11.2.

**Resolved 2026-10-11: (b), amended** — a committee on the owner's delegation, 2–1. A
positional argument may follow named ones only when every named argument before it sits in
its own parameter position (Kotlin 1.4). Naming a parameter that a positional argument
already filled is refused ("given twice"). The method-call receiver counts as position 0.
A positional argument always lands at its written index. (a) was not chosen because it would
break 11 diderven calls (`src/craft/recipes.vl`) whose in-position labels (b) also checks.
DECISIONS.md §"A positional argument lands at its written index"; the checker lags (D4061).
The text below is the question as it was put.

**Today.** Named arguments bind first. Positional arguments then fill the parameters that
are still unbound, in declaration order, wherever they stand in the call. So a positional
argument may follow a named one, and a positional argument written first can land on a
later parameter:

```vl
function box(w: i32, h: i32): i32 { w * 10 + h }
print(box(w: 3, 2))   // prints 32
print(box(h: 3, 2))   // prints 23
print(box(3, w: 2))   // prints 23
```

No ruling covers the order. The guide's statement, "named arguments may follow positional
ones", says nothing about the reverse.

**(a) Positional arguments come first.** A positional argument after a named one is
refused, and a named argument may not name a parameter a positional one already filled.
This is Python's rule.

```vl
print(box(3, h: 2))   // would print 32
print(box(w: 3, 2))   // would be refused: a positional argument follows a named one
print(box(3, w: 2))   // would be refused: `w` is given twice
```

**(b) Allow a positional argument after a named one only when every named argument before
it is in its own position.** This is Kotlin's rule since 1.4. `box(w: 3, 2)` is accepted because `w` is the first parameter; `box(h: 3, 2)`
is refused.

```vl
print(box(w: 3, 2))   // would print 32
print(box(h: 3, 2))   // would be refused: `h` is not in position 1
```

**(c) Keep today's rule,** and state it: named first, then positional in order.

**Recommendation: (a).** Under today's rule `box(3, w: 2)` silently moves `3` from `w` to
`h`, which no reader of the call would expect, and (a) refuses exactly that. (a) also
refuses nothing a program needs, since every call it refuses has an order that it accepts.


## Q9. A constant `a until a`

Raised by statements.md §S5.3.

**Today.** A constant range whose direction contradicts its step is refused (D1588), and
`a to a` runs once. `a until a` runs zero times, and nothing reports it: its bounds do not
contradict its direction, so D1588's rule does not reach it.

```vl
for i in 2 until 2 { print(i) }
print("done")   // prints done
```

D1588's ruling was written for `to`: "Equal bounds run once in either direction and are not
touched." It says nothing about `until`.

**(a) Refuse it,** with the D1588 error: every range written with constant bounds that can
never run is refused.

```vl
for i in 2 until 2 { print(i) }   // would be refused: this range never runs
```

**(b) Keep accepting it,** and state that only a contradicted direction or a zero step is
refused.

**Recommendation: (b).** D1588 refuses a range whose author meant it to run and wrote the
bounds in the wrong order, which is a confident wrong answer. `a until a` has no right
order to suggest, and no fix the message could name. In real code its bounds are rarely
both literals, and when they are computed it already runs zero times silently by design.


## Q10. Does `x == L` narrow a literal union?

Raised by narrowing.md §N2.3.

**Today.** `x is L` narrows a literal union in both branches. `x == L` narrows neither,
although a compare of a record's literal field, `c.kind == "m"`, narrows the record
(narrowing.md §N2.4). The guide says `x == L` narrows; no ruling says so. The only ruling
that touches it, DECISIONS.md §"A subsumed literal arm COLLAPSES", reads `x is L` as
`x == L` with narrowing (D4059).

```vl
type K = "a" | "b" | "c"
function f(k: K): string {
  if k == "a" { return "A" }
  const j: "b" | "c" = k   // refused: cannot assign K to 'j' of type "b" | "c"
  j
}
```

**(a) `x == L` narrows as `x is L` does,** in the then-branch, the else-branch, after a
guard that exits, and for `!=` reversed.

```vl
type K = "a" | "b" | "c"
function f(k: K): string {
  if k == "a" { return "A" }
  const j: "b" | "c" = k   // would run: `k` is "b" | "c" here
  j
}
```

**(b) Keep it a plain compare.** Only `is` narrows a bare value; the guide changes.

```vl
type K = "a" | "b" | "c"
function f(k: K): string {
  if k is "a" { return "A" }
  const j: "b" | "c" = k
  j
}
```

**Recommendation: (a).** A literal-field compare already narrows the record it belongs to,
so (b) makes `c.kind == "m"` narrow and `k == "m"` not. The 2026-09-02 ruling already
treats a literal `is` as the compare. The flow-narrowing ruling (DECISIONS.md §"Flow
narrowing: per-path facts meet at joins") lists a null test, an `is` test and a
discriminant compare among the tests that start each branch; a compare with a literal
would join that list.

(a) has a price. A narrowed literal union refuses a later test or `match` arm for a member
it has lost, as it does after `is` today. Code that tests `k == "a"` and then matches `"a"`
again would stop compiling:

```vl
type K = "a" | "b" | "c"
function f(k: K): string {
  if k is "a" { return "A" }
  match k { "a" => "x", "b" => "y", "c" => "z" }   // refused: match pattern "a" is not a member of "b" | "c"
}
```


## Q11. Declaring a name an ambient name has

Raised by modules.md §M5.3.

**Today.** The ambient names (modules.md §M5.3) are the eleven built-in type names, five
functions (`print`, `fromCodePoint`, `fromCodePoints`, `Map`, `Set`), twenty float and
integer intrinsics (`abs`, `sqrt`, `clz`, `divU`, …) and the `__name__` compiler
intrinsics. They fare differently when a program declares one:

- A compiler intrinsic is refused: `function __trap__()` gives "is a compiler intrinsic and
  cannot be redefined".
- A float or integer intrinsic is shadowed cleanly: `function abs(x: i32): i32 { x + 100 }`
  makes `abs(1)` print 101, and `const sqrt = 3` prints 3.
- A type name is accepted: `const i32 = 3` and `type Map = { a: i32 }` both run.
- One of the five functions is inconsistent (D4066). A `function print` is what a call
  runs, while the call is checked against the ambient signature. A `const print = …`
  lambda is not reached at all.

```vl
function print(x: i32): i32 { x + 100 }
const y: i32 = print(3)   // refused: cannot bind the void result of 'y'
```

```vl
const print = (x: i32): i32 => x
print(5)   // prints 5 (the ambient print ran)
```

No ruling covers it. `docs/internals/modules-design.md` §5 calls the ambient floor
privileged and "not a prelude", and says nothing about declaring its names.

**(a) Refuse the declaration.** An ambient name is reserved in every scope.

```vl
function print(x: i32): i32 { x }   // would be refused: `print` is an ambient name
```

**(b) A declaration shadows the ambient name** in its scope, for the call and its type
alike, as a declaration shadows any outer binding (modules.md §M5.2).

```vl
function print(x: i32): i32 { x + 100 }
const y: i32 = print(3)   // would run: y is 103
```

**Recommendation: (b).** The ambient set is meant to shrink: the design names `print` as
the first candidate to move into `std:fmt`. Under (b) a program that declared its own
`print` keeps compiling when that happens; under (a) the refusal it lived with disappears
and its meaning changes. (b) is also the rule a plain call already follows between a local
and an import (O1, rule (e): the local wins).
It is also what the float and integer intrinsics already do, so (b) makes the five
functions agree with them. The compiler intrinsics stay refused under either option: a
call to one lowers to inline instructions and never reaches a declaration.

## Q12. Import cycles

Raised by modules.md §M6.2.

**Today.** Every import cycle is refused, including one between modules that declare only
functions or only types:

```vl
// file: a.vl
import { isOdd } from "./main"   // refused: Import cycle detected
export function isEven(n: i32): boolean { if n == 0 { true } else { isOdd(n - 1) } }
// file: main.vl
import { isEven } from "./a"
export function isOdd(n: i32): boolean { if n == 0 { false } else { isEven(n - 1) } }
print(isEven(10))
```

`docs/internals/modules-design.md` §2.3 proposed allowing cycles of types and functions
and refusing only cycles of value initialisation, and §5 lists cross-module
initialisation order as an open sub-question that the owner has not reviewed. Without
cycles the order is fixed by modules.md §M6.1. With them, it needs a rule.

**(a) Keep refusing every cycle.** Mutually recursive functions or types go in one
module.

**(b) Allow a cycle when no module's top-level code in it reads a binding imported from
another module of the cycle.** Functions, types, and constants read only inside functions
qualify. The modules of the cycle run in the order the entry's imports first reach them.

```vl
// file: a.vl
import { isOdd } from "./main"
export function isEven(n: i32): boolean { if n == 0 { true } else { isOdd(n - 1) } }
// file: main.vl
import { isEven } from "./a"
export function isOdd(n: i32): boolean { if n == 0 { false } else { isEven(n - 1) } }
print(isEven(10))   // would print true
```

```vl
// file: a.vl
import { M } from "./main"
export const A = M + 1   // would still be refused: top-level code reads M across the cycle
// file: main.vl
import { A } from "./a"
export const M = A + 1
```

**Recommendation: (a) for now.** It is the two-way door: (b) can be added later without
changing the meaning of any program that compiles. No consumer has asked for a cycle, and
the workaround, one module, costs a file split rather than a feature. If one does, (b) is
the rule to adopt, and its order rule is the one M6.1 already follows.

## Q13. A literal-zero integer divisor

Raised by diagnostics.md §D6.4.

**Today.** When both operands are constant, `10 / 0` is an error (`division by zero in a
constant expression`), and the `divide-by-zero` warning is reported beside it. When the dividend is not constant, `a / 0` and `a % 0` get the
`divide-by-zero` warning, the program builds, and it traps when the division runs. ROADMAP
B17 planned "hard **error** for integer division", with `for-step-zero` as precedent; the
lint that shipped is a warning. A float divisor of `0.0` gets nothing, and gives an
infinity or NaN.

```vl
function f(a: i32): i32 { a / 0 }   // warns: `/ 0` traps at run time
print(f(4))                          // traps: integer divide by zero
```

**(a) An error.** A literal `0` divisor of an integer `/` or `%` is refused wherever it
appears, as `step 0` is.

```vl
function f(a: i32): i32 { a / 0 }   // would be refused: integer division by zero
```

**(b) A warning, as today.** The division is legal, the warning names the trap, and a
program that reaches it traps.

```vl
function f(a: i32): i32 { a / 0 }   // warns, builds, traps if called
```

**Recommendation: (a).** The expression can never produce a value, so no correct program
contains it, and the checker already refuses the same division when the dividend happens
to be constant: today whether `x / 0` is legal depends on `x`, not on the division. A
program that wants to stop has `__trap__` and a `never` function (statements.md §S8.2).
(a) refuses programs that compile today, but only ones that would trap if the line ran.

## Q14. Exports that their own module disowns

Raised by std.md §STD3.

**Today.** Two std modules export names whose header says they are not for users.
`std:test`'s header says "The `vlt*` exports at the bottom are the runner's protocol, not
part of the authoring surface"; `vl test` calls them. `std:seed`'s header says `stdSmoke`
"is not part of the usable surface and can be retired once any real module stands in for
it". Both import and run from user code like any export, and modules.md §M1.2 gives no
visibility between exported and private.

```vl
import { vltCount } from "std:test"
print(vltCount())   // prints 0
```

**(a) Promised surface.** Every std export is std surface, whatever its header says. The
`vlt*` names and `stdSmoke` stay, and change only as STD2.3 allows any std name to change.

```vl
import { stdSmoke } from "std:seed"
print(stdSmoke())   // prints 7, and keeps doing so
```

**(b) Exported but not promised.** The spec lists these names as outside std's contract: a
program may import them, and they may change or go without a refusal that names a
replacement.

```vl
import { vltRun } from "std:test"   // legal today; the spec makes no promise about it
```

**(c) Not importable by users.** The names move out of reach: `stdSmoke` is retired, and
the runner protocol moves to a module or a visibility that only `vl test` can reach.

```vl
import { vltCount } from "std:test"   // would be refused: not exported
```

**Recommendation: (b) now, (c) for `stdSmoke`.** (b) states what the headers already say
and changes no program. `stdSmoke` has no user and its header plans its retirement, so
retiring it costs nothing. A visibility level for the runner protocol would be a language
feature for one consumer, against M1.2's decided two-level rule; (b) avoids it.

## Q15. Two spellings of one std operation

Raised by std.md §STD3.

**Today.** `std:fmt` exports `padLeft`, whose comment calls it "This module's older
spelling of `std:str`'s `padStart`" and says "New code should reach for `padStart`".
`std:fmt` also re-exports `join`, `repeat` and `split` from `std:str`; these are the same
functions (std.md §STD3.2). Both spellings run.

```vl
import { padLeft } from "std:fmt"
import { padStart } from "std:str"
print(padLeft("7", 3, "0"))    // prints 007
print("7".padStart(3, "0"))    // prints 007
```

**(a) Keep both, permanently.** Each spelling is std surface (std.md §STD2.3), and the
comments say which one to prefer.

```vl
import { padLeft, split } from "std:fmt"   // stays legal
```

**(b) One spelling per operation.** The second spelling and the re-exports are removed,
and an old import is refused with a message naming the replacement, as `toString` was.

```vl
import { padLeft } from "std:fmt"   // would be refused, naming `std:str`'s `padStart`
import { split } from "std:fmt"     // would be refused, naming `std:str`
```

**(c) Keep re-exports, drop renamed copies.** A re-export of the same function under the
same name stays; `padLeft`, a second name for `padStart`, is removed as in (b).

```vl
import { split, toString } from "std:fmt"   // stays legal
import { padLeft } from "std:fmt"           // would be refused
```

**Recommendation: (c).** A re-export adds no second behaviour and no second name, so it
costs nothing to keep. A second name is the duplicated surface the std review rubric
(`docs/internals/std-api-review.md` §2) asks to avoid, and `padLeft`'s own comment already
points users away from it. With no deprecation mechanism, a targeted refusal is the only
way to remove it, and it is cheaper before more callers exist.
