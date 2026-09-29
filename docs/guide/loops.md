# Loops and labels

VL has three loops — `while`, the range `for v in a to b` / `a until b`, and the for-in
`for v in xs` — and one labelled block.

## Labels

A loop or a block carries a label written before it, `B:`. The label is named again at the
exit, after a colon:

```vl
outer: for i in 0 until 10 {
  for j in 0 until 10 {
    if j == 3 { continue :outer }   // next i
    if i * j == 12 { break :outer } // leave both loops
  }
}
```

- `break :B` leaves the loop or block labelled `B`.
- `continue :B` starts the next iteration of the loop labelled `B`.
- A bare `break` leaves the innermost **loop**; a bare `continue` continues it.
- A labelled block is left only by its name, `break :B`. A bare `break` or `continue` whose way
  to its loop crosses a labelled block is an error that names both fixes
  (``inside labelled block `B`: write `break :B` to leave the block, or label the loop and write
  `break :L` ``), and so is a bare `break` in a block with no loop around it. This is Rust's
  E0695 rule: inside a block, the reader never has to guess which frame a jump leaves.
- A label names only a loop or block the jump is written inside, in the same function; a
  `break` in a lambda does not reach the loop around the lambda.

The old spelling `break outer` is refused with the fix (``labels are written `break :outer` ``).
`scripts/codemods/break-label-colon.py` rewrites a file that still uses it.

## Labelled blocks

`B: { … }` runs its body once. `break :B` leaves it early; falling off its end leaves it too.
This is how a forward jump is written:

```vl
B: {
  if header.bad { break :B }
  parse(header)
  if !ok { break :B }
  commit()
}
// both breaks land here
```

`continue :B` on a labelled block is an error: there is nothing to continue. Inside a block, a
jump to an enclosing loop names that loop (`outer: for … { B: { … continue :outer … } }`).

A labelled block is a statement. As a call argument, `f(B: { … })`, it is refused: `f(B: …)`
reads as a named argument, and a block carries no value yet.

A labelled block as the first statement of a `{ … }` body is a block when its own braces hold
statements; `{ B: { x: 1 } }` is still an object literal holding one.

## Loop values — not yet

The same ruling lets a loop or block carry a value (`break v`, `break :B v`, a block's tail),
typed as the join of its exits with `null` added when the loop can run out. That half has not
landed: `break v` and `break :B v` are refused today with ``break values are not supported yet``.
