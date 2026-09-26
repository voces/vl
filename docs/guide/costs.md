# What collections cost

Every collection in VL states the complexity of its operations, and **that statement is part
of the contract**, like the type. A later compiler may make an operation faster. It may not
make it slower in complexity, and it may never change what a program prints to do so.

The **complexity** column below is the promise. The **measured** column is what one machine
read on 2026-09-25, as a guide to size and not as a promise: `vl build -O`, run with `vl run`,
the fastest of five runs, program startup subtracted, divided by the number of operations.
Where two numbers are given, the smaller table came first; a hash table's per-operation time
rises as it outgrows the processor's caches, while its complexity stays the same.

## Lists — `T[]`

| operation | complexity | measured |
| --- | --- | --- |
| `xs.push(v)` | amortised O(1): the storage doubles when full, so it can hold up to twice the elements | 4.6–4.8 ns |
| `xs.pop()` | O(1) | 3.3–3.7 ns |
| `xs[i]`, `xs[i] = v` | O(1); an index out of range traps | 1.3–1.6 ns (`i32[]`) |
| `xs.get(i)` | O(1); `null` out of range | |
| `xs.length` | O(1) | |
| `xs.slice(a, b)` | O(b − a): a new list | 24 ns for 10 elements, 440 ns for 1,000 |
| `xs.includes(v)`, `xs.indexOf(v)` | O(n) | 0.6–0.8 ns per element compared |
| `for x in xs`, `==` | O(n) | |

A list is shared, not copied: `const b = a` is a second name for the same list, and a push
through either is seen through both.

### The element type sets the cost

The element type decides how each element is stored, and that matters more than any other
choice here:

| element type | stored as | read, per element (in order) |
| --- | --- | --- |
| `i32[]` | 4 bytes per element | 1.3–1.6 ns |
| `u8[]` | 1 byte per element | 1.1 ns |
| `P[]` (a record) | a reference per element | 4.1–7.0 ns |
| `(P \| null)[]` | a reference per element; `null` is free | 4.6–5.6 ns |
| `(i32 \| null)[]` | **a separate heap box per element, `null` included** | 6.1–9.2 ns, about **5×** `i32[]` |

**A nullable number costs a box.** In `(i32 | null)[]` every element is its own small heap
object. The times above read the list in order; reading a million-element list at scattered
indices measured 59 ns per read against 4.3 ns for `i32[]`, about **14×**, since each read follows a
pointer to its own box. `(f64 | null)[]` is the same (7.2–10.5 ns a read, against 2.2–3.0 ns for `f64[]`);
`(boolean | null)[]` is not boxed (3.0–3.3 ns, against 1.8–2.2 ns). A boxed list allocates for
every `null` you push too:
`xs.push(null)` in a loop measured 16 ns per push at 2 million elements and 61 ns at 8 million,
because each push allocates. Pushing one `null` value you made once
(`const none: i32 | null = null`, then `xs.push(none)`) measured 5–6 ns at both sizes. In a hot
loop, prefer a plain `i32[]` with a value you never store (`-1`), or a separate `u8[]` saying
which slots are filled. A nullable *record* element, `(P | null)[]`, has no such cost.

## Maps — `{[K]: V}`, also spelled `Map<K, V>`

A map is a hash table keyed by `string`, `i32` or `i64`.

| operation | complexity | measured, `i32` key | `i64` key | `string` key |
| --- | --- | --- | --- | --- |
| `m[k] = v`, `m[k]`, `m.get(k)`, `m.has(k)` | O(1) expected | 15–43 ns | 19–61 ns | 70–107 ns |
| `m.delete(k)` | O(1) expected | 46–88 ns | | |
| `m.length` | O(1) | | | |
| `for k, v in m`, `m.keys()`, `m.values()` | O(n), in **insertion order** | 7–10 ns per entry | | |

Insertion order is part of the contract: iterating a map visits keys in the order they were
first inserted, whatever the key type, and deleting and re-inserting a key moves it to the end.
A miss (`m[k]` for an absent key) is `null`, and a stored `0` is not a miss.

## Sets — `Set<T>`

A set costs what a map costs: `s.add(x)` and `s.has(x)` are
O(1) expected (13.6–43 ns with `i32` elements), `s.length` is O(1), and `for x in s` is O(n)
in insertion order.

## Strings — `string`

A string is immutable UTF-8, indexed by **byte**.

| operation | complexity | measured |
| --- | --- | --- |
| `s[i]` (a byte, 0–255) | O(1) | 1.2–1.9 ns |
| `s.length` (bytes) | O(1) | |
| `s.slice(a, b)` | O(1): a view that shares the bytes | 3 ns, whether 10 or 10,000 bytes long |
| `a + b` | at most O(len a + len b) | |
| `s = s + piece` in a loop | amortised O(len piece) per append | 15–16 ns per one-byte append |
| `==`, `for cp in s`, `s.cpAt(i)`, `s.cpLen()` | O(n) | |

Because a slice shares its bytes, a small slice of a large string keeps the whole large string
alive. A string remembers its hash once computed, so using the same string as a map key again
does not rehash it.

## `readonly T[]` — what it does and does not promise

`readonly T[]` is a **view** of an ordinary list, stored the same way, so passing a `T[]` where a
`readonly T[]` is expected costs nothing and copies nothing. It promises one thing: **you cannot
write through this handle** (`push`, `pop`, `xs[i] = v` and the other writers are refused).

It does not promise that the list stays the same. Any other handle on the same list can still
change it, and the view sees the change:

```vl
function total(xs: readonly i32[]): i32 {
  let s = 0
  for x in xs { s += x }
  s
}
const a = [1, 2]
const v: readonly i32[] = a
a.push(3)
print(total(v))        // 6: the view sees the push made through `a`
```

So `readonly` is not immutability, and it is not a snapshot. For a copy you can rely on, build
a new list (`xs.slice(0, xs.length)`).

## The linear-memory tier — `u8[]`, `Buf` and views

`u8[]` and `Buf` both hold bytes, and they are for different jobs.

**`u8[]`** is an ordinary list, one byte per element (a quarter of an `i32[]`), with every list
operation and the same costs. It is the right tool for bytes that stay inside your program: a
file you read with `std:fs`, a format you decode with `std:bytes`, a buffer you build and
write out.

**`Buf`** (`std:buffer`) is a range of linear memory, the flat memory a host such as a browser
or a GPU API reads directly. Reading through a typed view (`i32view(b, off, n)`, then `v[i]`)
is O(1) with a range check, and measured 1.0–1.2 ns per element, the same as an `i32[]`.
Reach for it when:

* a host must read or write the bytes in place, without a copy: a GPU upload, a shared audio
  buffer, memory shared between workers;
* you want SIMD, which works only on linear memory;
* you hold a large array of numbers and nothing else, and want it outside the garbage
  collector's heap.

A `Buf` can hold only numbers and bytes, never a reference to a list, record or string, and
its memory is managed by you: `bufferRelease(mark)` frees every `Buf` made after the mark, and
a `Buf` used after that reads whatever is there now. Copying between a `u8[]` and a `Buf` is
O(n).

## `IdTable<V>` — a table keyed by small ids

`std:idtable` is a table for ids your program hands out itself, such as object handles or entity
numbers. It is stored as a list with one slot per id, so a read is a list access with no
hashing.

| operation | complexity |
| --- | --- |
| `t.get(id)`, `t[id]`, `t.has(id)` | O(1); `null` / `false` for a negative or unset id |
| `t.set(id, v)`, `t[id] = v` | O(1), amortised O(id) when `id` is past the end |
| `t.delete(id)` | O(1) |
| `t.length` (how many ids are present) | O(1) |
| `t.ids()` (present ids, ascending) | O(highest id) |
| memory | one slot per id from 0 to the highest id ever set; the table never shrinks |

Measured against a map on the same work (one million objects given ascending ids 7 apart in
one shared id space, each deleted 2,000 objects later, 32 lookups per object, about one in ten
missing):

| value type | `IdTable<V>` | `{[i32]: V}` |
| --- | --- | --- |
| a record | 6.6 ns per operation | 10.6 ns (1.6× slower) |
| `i32` | 11.3–13.7 ns | 13.4–19.2 ns |

With a number as the value, each stored value is boxed (see "A nullable number costs a box"
above), which is why `IdTable<i32>` gains little over a map. Choose `IdTable` for dense or mostly
dense ids with record or list values.

`V` cannot yet be `string`, `boolean`, a literal union of strings, a function type, a union of
records (`Circle | Square`), or a generic record (`Box<i32>`, `IdTable<Tex>`): the compiler
refuses those with "a nullable-… list element has no rep", and a map serves them. Inside a generic
function that declares a lambda, a record such as `IdTable<Tex>` that holds a `(V | null)[]`
itself is refused the same way. Use a map when ids are large, negative, or sparse
enough that one slot per id wastes memory, or when you need insertion order.

## The rules the compiler keeps

These are owner rulings, and they are what makes the tables above safe to rely on:

* No automatic change of representation is ever slower than the collection's own baseline
  representation, and none changes what a program prints.
* A representation may be chosen by the **type** (as `u8[]` is today) at any time. One chosen by
  **size** alone must depend only on `.length`, must not flip back and forth, and must fall back
  exactly to the baseline. One chosen by the **pattern of the data** is allowed only when a named
  type already offers the same representation, its exit back to the baseline is one-way,
  `vl run --stats` reports each exit, and this page names what triggers it. None exists today.
* No build flag selects a representation.
* A dense integer-keyed table is a type you choose, `IdTable<V>`, not a mode a map switches into.
