# Oracle: narrow-integer cast domains (2026-11-15, lane O)

The oracle cast a constant to `u8` with no range check: `300 as u8` printed `300` where the
checker refuses "constant 300 does not fit `u8`". So #8371's cast-bound cases could not be graded.

## Rules now in the oracle

- E8.3: a constant cast to `u8` (`as`, `as?`, `as!`) is read at `i32`, a radix literal as its
  32-bit pattern, then checked against 0..255. A miss is the cast's own failure: `null`, a trap,
  or null propagation.
- T1.1/T1.3: `u16`, `u32`, `i8` and `i16` are a type fault as a cast target, `as%` included. The
  checker refuses them as storage types (`u32` is ruled but unbuilt).
- E8.2: a bare `as` that misses at module scope has no function to return its null, so it is a
  type fault. Before, the oracle's internal null signal escaped and was reported as an ORACLE BUG.

## Grid (master `ba18bd00a`)

| program | oracle | compiled |
| --- | --- | --- |
| `300 as? u8`, `-1 as? u8`, `(250 + 10) as? u8`, `0x1FF as? u8` | `null` | check refuses |
| `255 as? u8`, `0xFF as? u8`, `255.0 as? u8` | `255` | `255` |
| `0xFFFFFFFF as? u8` / `as! u8` | `null` / trap | `null` / trap |
| `300 as% u8`, `-1 as% u8` | `44`, `255` | `44`, `255` |
| `65535 as? u16`, `-128 as? i8` | fault | check refuses |
| `let x = 300; x as u8` at module scope | fault | check refuses |
| `f(300)`, `f(7)` with `x as u8` in a `i32 \| null` function | `null`, `7` | `null`, `7` |
| `tests/cases/numerics/cast-join-bounded-tails.vl` (#8371) | `255 255 200 3 301 255 1` | the fixture's `@log` |

The checker accepts `0xFFFFFFFF as? u8` and refuses `-1 as? u8`, although both are the pattern
`-1`. E8.2 refuses a constant cast that can never succeed. The runtime result is right, so this
is not filed as a wrong value.

## Regression check

- Fuzz: arith 2,000 cells (AGREE 1593, SKIP 407), data 2,000 (AGREE 2000), hof 1,000 (unchanged).
  All exit 0.
- `oracle.ts distilled`: identical to master's oracle (AGREE 11139, COMPILED-BAD 1,
  ORACLE-RUNS-REJECTED 523, SKIP 480).
