# Loops, labels and loop values

VL has three loops — `while`, the range `for v in a to b` / `a until b`, and the for-in
`for v in xs` — and one labelled block. Any of them can carry a value.

## Labels

A label is one token, `@name`, spelled the same where it is declared and where a jump names it.
It goes before a `while`, a `for` or a `{`, on the same line:

```vl
@outer for i in 0 until 10 {
  for j in 0 until 10 {
    if j == 3 { continue @outer }   // next i
    if i * j == 12 { break @outer } // leave both loops
  }
}
```

- `break @B` leaves the loop or block labelled `B`.
- `continue @B` starts the next iteration of the loop labelled `B`.
- A bare `break` or `break v` leaves the innermost **loop**; a bare `continue` continues it.
- A labelled block is left only by its name, `break @B`. A bare `break`, `break v` or `continue`
  whose way to its loop crosses a labelled block is an error that names both fixes
  (``inside labelled block `@B`: write `break @B` to leave the block, or label the loop and write
  `break @L` ``), and so is a bare `break` in a block with no loop around it. This is Rust's
  E0695 rule: inside a block, the reader never has to guess which frame a jump leaves.
- A label names only a loop or block the jump is written inside, in the same function; a
  `break` in a lambda does not reach the loop around the lambda.
- `@name` anywhere else is an error that says where a label goes.

Because a label is its own token, `{ name: … }` is always an object literal — as a function
body, a lambda body, an `if` or `else` branch, or a `match` arm:

```vl
function origin() { x: 0, y: 0 }
const p = if flip { x: 1, y: 0 } else { x: 0, y: 1 }
```

The spellings before the `@` ruling, `B: { … }`, `L: while`, `L: for`, `break :B` and
`continue :L`, are refused with the one that replaces them
(`` `B: { … }` is no longer a label; write `@B { … }` ``, `` `break :B` is now `break @B` ``).
`scripts/codemods/label-at.py` rewrites a file that still uses them.

## Labelled blocks

`@B { … }` runs its body once. `break @B` leaves it early; falling off its end leaves it too.
This is how a forward jump is written:

```vl
@B {
  if header.bad { break @B }
  parse(header)
  if !ok { break @B }
  commit()
}
// both breaks land here
```

`continue @B` on a labelled block is an error: there is nothing to continue. Inside a block, a
jump to an enclosing loop names that loop (`@outer for … { @B { … continue @outer … } }`).

## Values

`break v` exits with a value, and the loop or block is then an expression:

```vl
const found = for x in xs {
  if x > 10 { break x }
}                            // i32 | null

const kind = @B {
  if n < 0 { break @B "negative" }
  if n == 0 { break @B "zero" }
  "positive"                 // the tail is the value when nothing breaks
}                            // string
```

The type is the join of every `break` value that leaves it, and for a block its tail value too:

- A `while` or `for` that can finish without a `break v` — its condition fails, its range or list
  runs out, or a bare `break` leaves it — also yields `null`, so its type is `T | null`.
- `while true { … }` (a literal `true`) cannot run out, so its type is plain `T`.
- A block ends by its tail, which joins with its `break @B v`s; a block that can fall off its end
  without a value is `T | null`.
- Different value types join to a union (`break @B 1` and a tail `"s"` give `i32 | string`), which a
  narrower destination refuses. A `break` whose value is `void` is an error.

`break v` takes its value from the rest of the line, so `break` followed by a newline breaks
with no value. A value is written after the label: `break @B v`. A labelled block as the value
of a `break` is parenthesized, `break (@C { … })`, since `break @C` names a label.

A loop whose value nobody reads is an ordinary statement, and `break v` still evaluates `v`.

### Where the value can go

A value-carrying loop or block goes anywhere an expression does — a binding, a return or
function tail, an argument (`f(@B { … })`, `f(while true { break 3 })`), a list element, a
field, an `if` arm.

### Known limit

A non-null record value of a loop or block passed straight to an un-annotated parameter at module
scope is refused at emit (D3224); bind it first, or move the code into a function. A loop or
block value of a function type is refused at emit too (D3256).
