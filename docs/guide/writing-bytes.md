# Writing binary files from a VL tool — `u8[]`, `std:fs`, `Buf`

A VL program can produce a binary file itself: a PNG, a glTF `.bin`/`.glb`, a packed table.
Build the bytes in a `u8[]` and hand them to `writeFile` from `std:fs`; `vl run tool.vl`
then writes the file with no JavaScript or TypeScript host around it. Every printed value
below was run against the shipped compiler. (Reading a binary file back is
[`bytes.md`](bytes.md).)

## Building the bytes

A `u8[]` is a list of bytes. Push into it, or make one of known length with `zeroBytes(n)`
from `std:bytes` and fill it by index. `x as% u8` keeps the low 8 bits of an integer, which
is what packing a wider value needs; `>>>` moves the next byte down without dragging the
sign along (see [operators](operators.md#unsigned-shift--logical-shift-right-)).

```vl
// Little-endian words and floats: the byte order of glTF and most GPU formats.
function put32le(out: u8[], v: i32) {
  out.push(v as% u8)
  out.push((v >>> 8) as% u8)
  out.push((v >>> 16) as% u8)
  out.push((v >>> 24) as% u8)
}
function putF32le(out: u8[], x: f64) { put32le(out, f32bits(x as f32)) }

const verts: u8[] = []
for p in [0.0, 1.5, -2.25] { putF32le(verts, p) }
print(verts.length)    // 12
```

`f32bits` and `f64bits` (no import) give a float's bit pattern as an `i32` / `i64`;
`f32fromBits` and `f64fromBits` go back. Text goes in as UTF-8 with `encodeUtf8` from
`std:utf8`. There is no `put*` family in `std:bytes` yet, so helpers like `put32le` live in
your tool.

## Writing the file

`std:fs` has `writeFile(path, data)`, which replaces the file, `appendFile(path, data)`, and
`writeFileRange(path, offset, data)`, which overwrites a range in place (to patch a length
field after the fact). `data` is a `u8[]` or a `Buf`. Each answers `IoError | null`: `null`
on success, and an `IoError` (`code`, `msg`) otherwise; nothing traps. A relative path is
relative to the directory `vl run` was started in.

## Example: a 2×2 PNG

PNG needs a CRC-32 per chunk and a zlib stream for the pixels. A zlib stream may hold its
data in an uncompressed ("stored") block, so a small image needs no compressor:

```vl
import { IoError, writeFile } from "std:fs"
import { encodeUtf8 } from "std:utf8"

// Append one byte (the low 8 bits of `v`), or a 32-bit word high byte first.
function put8(out: u8[], v: i32) { out.push(v as% u8) }
function put32be(out: u8[], v: i32) {
  put8(out, v >>> 24)
  put8(out, v >>> 16)
  put8(out, v >>> 8)
  put8(out, v)
}

// PNG's CRC-32, over `b` from index `from` to the end.
const CRC: i32[] = []
for n in 0 until 256 {
  let c = n
  for k in 0 until 8 {
    c = if (c & 1) != 0 { 0xedb88320 ^ (c >>> 1) } else { c >>> 1 }
  }
  CRC.push(c)
}
function crc32(b: u8[], from: i32) {
  let c = -1
  for i in from until b.length { c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8) }
  c ^ -1
}

// One chunk: length, type, data, then the CRC of type and data.
function chunk(png: u8[], kind: string, data: u8[]) {
  put32be(png, data.length)
  const start = png.length
  for b in encodeUtf8(kind) { png.push(b) }
  for b in data { png.push(b) }
  put32be(png, crc32(png, start))
}

// A zlib stream holding `raw` in one uncompressed block (up to 65535 bytes).
function zlibStored(raw: u8[]): u8[] {
  const z: u8[] = [0x78, 0x01, 0x01]
  put8(z, raw.length)
  put8(z, raw.length >>> 8)
  put8(z, ~raw.length)
  put8(z, ~raw.length >>> 8)
  let a = 1
  let b = 0
  for v in raw {
    z.push(v)
    a = (a + v) % 65521
    b = (b + a) % 65521
  }
  put32be(z, (b << 16) | a)
  z
}

// A 2×2 RGB image: red, green / blue, white. Each row starts with filter type 0.
const w = 2
const h = 2
const px: u8[] = [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]
const raw: u8[] = []
for y in 0 until h {
  raw.push(0)
  for x in 0 until w * 3 { raw.push(px[y * w * 3 + x]) }
}
const ihdr: u8[] = []
put32be(ihdr, w)
put32be(ihdr, h)
for v in [8, 2, 0, 0, 0] { put8(ihdr, v) }

const png: u8[] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
chunk(png, "IHDR", ihdr)
chunk(png, "IDAT", zlibStored(raw))
chunk(png, "IEND", [])
const err = writeFile("out.png", png)
if err is IoError { print(err.msg) } else { print(png.length) }    // 82
```

`vl run png.vl` prints `82` and leaves an 82-byte `out.png` that image viewers open. A
larger image needs one stored block per 65535 bytes, or a real deflate.

## Handing bytes to a JavaScript host

When a host, not a file, is the destination (a browser upload, a GPU buffer), put the
bytes in linear memory with `std:buffer` and export where they are. `Buffer(n)` allocates
`n` bytes and answers a `Buf` (`base`, `length`); `storeBytes(buf, off, bytes)` copies a
`u8[]` in, and `store8`, `store16`, `storeI32`, `storeF32` and `storeF64` write one value at
a byte offset. A `Buf` can also go straight to `writeFile`.

```vl
import { Buf, Buffer, storeBytes } from "std:buffer"

let out = Buffer(16)
// `verts` is the `u8[]` built above.
export function build(): i32 {
  out = Buffer(verts.length)
  storeBytes(out, 0, verts)
  out.length
}
export function outPtr(): i32 { out.base }
```

The host reads them as `new Uint8Array(instance.exports.memory.buffer, outPtr(), len)`. Take
that view after the call: allocating can grow the memory, which detaches older views
([costs.md](costs.md#host-views-of-linear-memory)).
