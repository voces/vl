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
