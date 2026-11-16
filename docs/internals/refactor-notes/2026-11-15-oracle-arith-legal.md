# Oracle: the arithmetic generator emits legal programs (2026-11-15, lane O)

`gen.ts` says every program it emits passes `vl check`. #8432 measured 59% refused: constant
subtrees the checker folds and refuses. This change makes the claim true and fixes what the newly
legal programs exposed. Master `6f9bafb92`, on a host built from it.

## Generator

`Gen.expr` keeps a subexpression that reads no variable (`v<n>` or `p<n>`) only when the oracle
accepts `const c__: <T> = <expr>`, after the program's helper functions. A trap is legal and
stays. A fault, or a constant the use cannot hold (`literal typed from uses`), is regenerated,
up to six times, then replaced by a literal. Legal constant trees are kept, so the generator
still covers constant folding. A shift count that reads no variable is a literal below the
width (E6.2).

| arith, 2,000 cases | before | after |
| --- | --- | --- |
| refused by `vl check` | 1,183 (59%) | 89 (4%) |
| AGREE | 771 | 1,793 |

Seeds 21-30 give 97 of 2,000 refused, and seeds 31-50 give 144 of 4,000. The ceiling is now 6%.
Generating 2,000 cases takes 4.8 s.

## Oracle: two refusals the design makes

- **E6.2:** a constant shift count that is negative, or above 63, is refused. So is one above 31
  beside a typed `i32` left. A constant left (Q8) is excepted, and so is a shift of a constant by
  a run-time count.
- **D2.3:** a constant integer division by zero is refused, radix or not.

## Oracle: readings the new programs reached

Each row is a minimal witness. The compiled output is the corrected oracle's.

| witness | was | now | rule |
| --- | --- | --- | --- |
| `(~9) >>> 34` | `1073741821` | `1073741823` | Q8: the count widens a negative constant left |
| `((0xFFFFFFFF & 0) \| (~4294967296)) <= -2` | `false` | `true` | D16492, through `~` (`wideDec` kept) |
| `(16777217.0 - 1.5) < max(f, 16777217.0)`, `f: f32` | `false` | `true` | Q9 in a comparison |
| `max((-1) >>> 9, min(9, 3000000000))` | `8388607` | `36028797018963967` | a negative constant's `>>>` is typed at its use |
| `3000000000 - (0xFFFFFFFF >>> v)` | `2999999999` | `3000000000` | D16492 for a radix shift by a run-time count |
| `((if c { 65535 } else { 0xFFFFFFFF }) * 7) + (0xFFFFFFFF + 4294967296)` | `8589934584` | `38654705656` | 4.3: a join tree stays untyped until its use |
| `(if c { -9000000003 } else { -1 }) + 0xFFFFFFFF` | `-2` | `4294967294` | 4.3: an arm beside a wide decimal arm is `i64` |
| `(0x7fffffff << v) as i64` | `-2` | `4294967294` | T2.4: the cast target types a constant-left shift |
| `(0xFFFFFFFF << v1) >> 56` | refused | `0` | Q8: the count widens a constant-left shift |
| `if c { 0xFFFFFFFF } else { (w >> 54) }`, `w: i64` | `-1` | `4294967295` | a shift is its left's type (`staticKind`) |
| `(if c { 0xFFFFFFFF } else { 0xFFFFFFFF }) >>> 57` | `127` | `0` | Q8 for a literal join |
| `max(0 * (0xFFFFFFFF - 3000000000), 100 - 0xFFFFFFFF)` | `101` | `0` | a pattern beside a radix `i64` constant is zero-extended |
| `((~MAX) - (if c { 3000000000 } else { 0xFFFFFFFF })) as f32` | exact | wraps at `i64` | a join tree is no constant |
| `a / (if c { (0.1 * 0.1) } else { 0.5 })`, `a: f32` | `100` | `99.99999237060547` | Q9 for a join's taken arm |

A float tree over a literal join beside an `f32` is a SKIP, naming D16497, until that row is
ruled and fixed.

## Compiler rows

| row | witness | class |
| --- | --- | --- |
| [D16496](../inventory/D16496.md) | `if c { 3000000000 } else { if c { v1 } else { 1 } }` | check-clean invalid wasm |
| [D16497](../inventory/D16497.md) | `min(a, (if c { 0.1 } else { 0.5 })) - 0.01`, `a: f32` | check-clean silently wrong |
| [D16498](../inventory/D16498.md) | `if c { 0xFFFFFFFF % 7 } else { 3000000000 }` | check-clean silently wrong |

Their fuzz cells are in `known.txt`: `ar_s36_0009`, `ar_s39_0017`, `ar_s42_0050`.

## Measurement

- `fuzz.sh --seeds 10 --count 200 --gen all` exits 0:
  - AGREE 8919, REFUSED 178, REFUSED-FILED 771, SKIP 132, 0 disagreements.
  - Refused shares: arith 4%, data 0%, hof 5%, rep 0%.
- Seeds 21-30: 0 disagreements. Seeds 31-50: only the three filed cells.
- `oracle.ts distilled`: 0 new disagreements.
- Join grid 64/64, radix-float grid 182/182, ruling grid 23/23.

The nightly draws fresh seeds, and known.txt lists cells by id. Until D16496-D16498 close, a
nightly can hit a new cell of one of these families, at about 3 in 4,000 arith cases on seeds
31-50.
