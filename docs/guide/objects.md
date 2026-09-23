# Objects and braces

A `{` opens one of two things: an **object literal** (`{ name: value, … }`) or a **block**
(`{ statement … }`). Which one depends on where it stands and what follows it.

## Object literals

```vl
type Point = { x: i32, y: i32 }
const p: Point = { x: 1, y: 2 }
const q = { x: 3, y: 4 }          // an anonymous shape, inferred
const s = { x, y: 0 }             // `x` is shorthand for `x: x`
```

A field whose declared type admits `null` may be left out of a literal; it holds `null`:

```vl
type Opt = { id: i32, label: string | null }
const o: Opt = { id: 1 }          // o.label is null
```

## There is no empty object

`{}` is refused wherever a value is expected: a binding, an argument, a return value, a
field, a list element or a match arm's value.

```vl
const o = {}      // error: an empty object has no fields to hold; write its fields,
                  //        or use `null` for no value
```

An object with no fields carries no information, so write the fields it should have, or
use `null` (with a `T | null` type) for "no value". A map starts empty with `Map()`, a set
with `Set()`.

## There is no empty nested block

A `{}` standing on its own as a statement is refused too:

```vl
if ready {
  {}              // error: an empty block does nothing; remove it
}
```

The empty **body** of a construct is fine, and is how you write "do nothing":

```vl
if ready {} else { retry() }
while poll() {}
for _x in xs {}
function noop() {}
each(xs, (_x) => {})              // an empty-bodied lambda, not an empty object
match n {
  0 => {}
  _ => {}
}
```

To return an object from an arrow lambda, wrap it in parentheses: `() => ({ x: 1 })`.
Unwrapped, `() => { x }` is a body whose last statement is `x`.
