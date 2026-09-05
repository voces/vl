# Reading binary data — `std:bytes` over a `u8[]`

`std:fs`'s `readFile` and `readFileRange` hand you a `u8[]`, and a binary format is
integers packed into it at known offsets. `std:bytes` is the eight reads that take one
out. Every value printed below was run against the shipped compiler.

```vl
import { i32le, i64le, u16be } from "std:bytes"
import { IoError, readFile } from "std:fs"

const b = readFile("map.w3e")
if !(b is IoError) {
  print(b.i32le(4))        // the little-endian word at offset 4
}
```

Each export takes the list first, so it reads as a method — but VL has no namespace
import and a UFCS call resolves only names that are in scope, so **every name you use
has to be in the `import` list**.

## The eight reads

| export | bytes | order | returns | range |
| --- | --- | --- | --- | --- |
| `u16le(self, off)` | 2 | low byte first | `i32` | 0 … 65535 |
| `u16be(self, off)` | 2 | high byte first | `i32` | 0 … 65535 |
| `i16le(self, off)` | 2 | low byte first | `i32` | −32768 … 32767 |
| `i16be(self, off)` | 2 | high byte first | `i32` | −32768 … 32767 |
| `i32le(self, off)` | 4 | low byte first | `i32` | the whole 32-bit pattern |
| `i32be(self, off)` | 4 | high byte first | `i32` | the whole 32-bit pattern |
| `i64le(self, off)` | 8 | low byte first | `i64` | the whole 64-bit pattern |
| `i64be(self, off)` | 8 | high byte first | `i64` | the whole 64-bit pattern |

`off` is a byte offset into the list, not an element index into anything wider, so
`b.i32le(1)` is a legal unaligned read.

## Why there is no `u32le`

At 16 bits the two signednesses are different answers and both fit an `i32`, so both are
here. At 32 and 64 bits they are not: the read fills its return type exactly, so there is
one function and it carries **the whole bit pattern**. A word at or above 2^31 therefore
reads negative, which is the same rule as a hex literal being a bit pattern of its
destination's width.

```vl
import { i32le, u16le, i16le } from "std:bytes"

const b: u8[] = [0xFF, 0xFF, 0xFF, 0xFF]
print(b.u16le(0))                        // 65535
print(b.i16le(0))                        // -1
print(b.i32le(0))                        // -1          — the same four bytes
print((b.i32le(0) as i64) & 0xffffffff)  // 4294967295  — as a NUMBER
```

The last line is the spelling to reach for when a 32-bit field is an unsigned quantity
you are going to compare or add — a file offset, a size, a virtual address. **Widen
FIRST, then mask.** The order matters and getting it wrong is silent:

```vl
print(b.i32le(0) & 0xffffffff)            // -1          — the mask did NOTHING
print((b.i32le(0) as i64) & 0xffffffff)   // 4294967295  — the widen is what works
```

`0xffffffff` at `i32` is all ones, so masking an `i32` with it is the identity. The mask
only earns its keep after the value has somewhere wider to sit; what it discards there is
the sign extension the widening cast introduced. Five files in the first codebase to want
this wrote the first line and shipped it.

There is nowhere wider than `i64`, so a 64-bit field at or above 2^63 has no
non-negative spelling at all. `i64le` hands you the bits and the comparison you want is
usually an unsigned one.

## Floats

There is no `f32le` / `f64le` family, because the bitcast intrinsics already compose with
these:

```vl
import { i32le, i64le } from "std:bytes"

const b: u8[] = [0x00, 0x00, 0x80, 0x3F, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F]
print(f32fromBits(b.i32le(0)))   // 1
print(f64fromBits(b.i64le(4)))   // 1
```

`f32bits` and `f64bits` go the other way. None of the four moves a bit; they only change
the type the same 32 or 64 bits are read at.

## Out of range

Nothing here bounds-checks. An offset that runs off either end — past the last byte, or
negative — trips **the list's own** bounds check and traps:

```
wasm trap: out of bounds array access
```

That is deliberate: the read is one array index, the engine already checks it, and a
short read answering `0` would be a wrong number rather than a failure. Check
`b.length` at your record boundaries, the way a parser does anyway.

## Single bytes

There is no 8-bit rung, because indexing already is one. A `u8[]` element reads
zero-extended, so the unsigned byte needs no function, and the signed one is a shift pair:

```vl
const b: u8[] = [0xFF, 0x80, 0x7F]
print(b[0])                  // 255
print((b[0] << 24) >> 24)    // -1
print((b[1] << 24) >> 24)    // -128
```

Byte order means nothing for one byte, which is the other reason these would not fit the
`le` / `be` family.

## What is not here

**Writing.** There is no `put*` family yet, because the two shapes a caller wants —
storing into an existing array at an offset, and appending to one being built — are
different functions and no consumer has needed both.

**A cursor.** These take an explicit offset. A type that carries a position and advances
it is a fine thing to write over them, and `std:buffer`'s `Buf` is the linear-memory tier
when the bytes are going to a host rather than through VL.

**`u8[]` helpers in general.** `std:array`'s generic helpers do not apply to a `u8[]`;
`std:utf8` decodes one to text, `std:base64` encodes one, and this module reads integers
out of one.
