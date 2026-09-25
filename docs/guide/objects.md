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

## `{}` is the literal with every field left out

So `{}` is a value of any record whose fields all admit `null`, wherever that record is the
expected type — a binding, an argument, a return, a field, a list element, the fallback of
`??`:

```vl
type Cfg = { verbose: boolean | null, out: string | null }
const c: Cfg = {}                 // both fields null
run({})
function defaults(): Cfg { return {} }
const cfg = loaded ?? {}          // `loaded: Cfg | null`
withDefaults(() => ({}))          // a callback declared `() => Cfg`
```

Into a union, `{}` is the first member, in declaration order, whose fields all admit `null`:
with `type Plain = { b: i32 }`, `const u: Plain | Cfg = {}` is a `Cfg`.

It is refused when the record has a field that may not be left out, and the message names it:

```vl
type P = { a: i32, b: string | null }
const x: P = {}   // error: `{}` leaves out `a`, a required field of P; only a field whose
                  //        type admits `null` may be omitted
```

and when nothing says which record it is:

```vl
const o = {}      // error: `{}` has no record type here to complete — give its destination
                  //        a record type whose fields admit `null`, or write its fields
```

A map starts empty with `Map()`, a set with `Set()`; `{}` is never a map. Their types are
spelled `Map<K, V>` and `Set<T>` (or `{[K]: V}` and `{[T]: boolean}`, the same types), and a
constructor can name its types itself — `Map<string, i32>()` is an empty map that needs no
annotation. `docs/guide/collections-design.md` §"What you write TODAY" has the table.

## There is no empty nested block

A `{}` standing on its own as a statement is refused:

```vl
if ready {
  {}              // error: an empty block does nothing; remove it
}
```

That includes the last line of a block whose value is used, where the message says so
(`a {} here is an empty block; to produce an empty record write ({})`): write `({})` there to
mean the literal, as in `function pick(k: i32): Cfg | null { if k == 0 { ({}) } else { null } }`.

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
