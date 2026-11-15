# Oracle: four cast and adoption rules (2026-11-15, lane O)

Lane T's cast and adoption discovery listed four places where the oracle differed from the
rulings. Each fix below is oracle-side. The compiler follows the ruling in every row, so no
compiler row is filed. Master `e56efd8c2`.

| item | program | was | now | compiled |
| --- | --- | --- | --- | --- |
| 1 T2.3 | `const x: i32 = 0x1FFFFFFFF` (binding, argument, return, list) | `-1` | refused (SKIP) | refused |
| 1 T2.3 | `const x: i32 = 0x1FFFFFFFF & 0xFF` | `255` | refused (SKIP) | refused |
| 1 D3043 | `a + 0x1FFFFFFFF`, `a: i32` | `0` | `8589934592` | `8589934592` |
| 1 D3043 | `a + 8589934591` | SKIP | `8589934592` | `8589934592` |
| 1 D3043 | `a - (0x1FFFFFFFF & 0xF)` | SKIP | `-14` | `-14` |
| 2 | `{[string]: i64}` store of `0xFFFFFFFF` | `-1` | `4294967295` | `4294967295` |
| 2 | `{[string]: f32}` store of `0.1`, read back | `0.1` | `0.10000000149011612` | same |
| 2 | `{[string]: f64}` store of `0xFFFFFFFF` | `-1` | `4294967295` | `4294967295` |
| 2 | `{[string]: i32}` store of `1.5` | `1.5` | refused (SKIP) | refused |
| 3 E8.4 | `3 as% f64`, `(if c { 1 } else { 2 }) as% f32` | `3`, `1` | fault | refused |
| 4 E8.2 | `300 as? u8`, `3.9 as? i32`, `3000000000 as? i32` | `null` | fault | refused |

## Rules

- **Item 1.** In `litTo`, a radix-64 literal at `i32` is a `LitFault`, the same as a decimal that
  overflows. In `radixAtWidth`, an `i32` use of a tree with a wide leaf is also a `LitFault`.
  Beside a typed `i32` peer with no destination, a constant that does not fit `i32` is read with
  no context, and `arith` widens the peer to `i64` (D3043). Shift counts are excluded (Q8).
- **Item 2.** `atElem` delivers a constant to the element type the container was built at
  (ruling 4.4). A non-constant value is still only converted: an alias may hold the container at
  another declared type. The distilled cells `d741_w5_no_narrow` and
  `d853_two_unions_no_elem_read` store through a `Circle | Tri` alias of a list built as
  `Shape[]`, and they run.
- **Item 3.** `as%` to `f32` or `f64` is a type fault for any operand.
- **Item 4.** A constant cast that can never succeed is a type fault for `as`, `as?` and `as!`:
  a `LitFault`, or a `u8` domain miss. A literal join is no constant, so its miss is still the
  cast's own `null` or trap.
  - With this, [D16495](../inventory/D16495.md)'s witness `0xFFFFFFFF as? u8` grades UNSOUND
    rather than AGREE. The compiler accepts what E8.2 refuses, and that row is already filed.

## Left as is

- A whole float literal at an integer destination (`const x: i32 = 2.0`, `m["a"] = 2.0`) is
  open owner question Q7 (types.md T2.4). The oracle keeps T2.4's accepting reading.

## Measurement

- `oracle.ts distilled`: AGREE 11142 → 11149, SKIP 480 → 473, 0 new disagreements.
- Fuzz, all exit 0:
  - arith: 2,000 cells, subset 1593 → 1648, all AGREE.
  - data: 2,000 cells, AGREE 2000.
  - hof: 1,000 cells, unchanged.
