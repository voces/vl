# IR: an untyped minted `null` (`rep ?` @null, 2026-11-24, lane N10)

Both members of N3's `rep ?` family (E) miss on one node: a `NullLit` a rewrite minted, with no
type (`nodeTy` -1), so `exprAt` finds no rep for it. A probe compiler that stamps the node kind
into the miss named it. It arrives by two paths.

- **An omitted field of a union arm** (`objects/empty-object-all-nullable-runs.vl` `mkU`, and
  the 10 const-cell and node-in fragments in the same file). `{}`'s omitted `s: string | null`
  is the check-minted null (`omittedFieldNullNode`). `deliver`'s null arm reads `nullOwnAt`,
  which is `NULL_OWN_NONE` for a node with no type, against a `string | null` that wants
  `NULL_OWN_STR`. The arm fell through to `exprAt`.
- **A `?.` guard's else arm** (`closures/null-only-optional-read-and-call.vl` `stmt$1`). In a
  generic body, `drwOptGuard` mints the guard's null at the template, untyped.

Legacy writes both through `emitNullAt` → `nullOwnAt` → `NULL_OWN_NONE`, which is `ref.null none`
(wasm-dis: `struct.new $0 (ref.null none)` in `mkU`, `drop (ref.null none)` in the guard). The
builder now keys on that same `nullOwnAt`:

1. `exprAt`: a `NullLit` with no rep of its own whose `nullOwnAt` is `NULL_OWN_NONE` is at the
   `null` unit, built by the existing `RNullOf NONE` arm.
2. `deliver`: `NULL_OWN_NONE` into a `string | null` is `RNullOf NONE`, since the bottom ref
   fits `ref null $str`. Nothing else widens: a sentinel slot still refuses.

The verifier now refuses the bottom ref at a sentinel or box niche: `RNullOf` own 0 needs
`rnDisc` 1, a reference niche. Before, a mutant that forced `NULL_OWN_NONE` into an atom niche
(`unions/optional-chain-bare-record-union.vl::inner`, `coalesce-if-arm-local-record-union.vl::ret`
and both starts) verified, and only identity caught it. It now reds as "the bottom ref is no
sentinel's or box's null". Self-test cases: `null-none-into-bool-niche` (rule 2),
`null-none-into-ref-niche` (holds).

## Legacy tails the IR calls

None new.

## Left for later

- The IR following legacy's new sentinel arm for an omitted union-arm field (D17320's
  `variantFieldSentinelNullOwn`): `boolean | null` and a literal union with `null` still miss
  `rep ?` there.
- The witnesses' other misses (`method f`, `expression if optional guard`, `coalesce nulnone
  effect if`, `print nulNone`, `box of a valued if`, `string operand after another`) belong to
  their own families.

## Witnesses

- `tests/cases/objects/untyped-minted-null-positions.vl`: an omitted reference-kind field (string,
  i32, f64, record, list, closure) of a union arm at return, const, let and reassignment,
  argument, list element, record field, `??` fallback, and a tail `if` and `match`. Also the `?.`
  guard at a null-only instance and a record instance, with a call counter showing the null
  instance makes no call. The sentinel kinds are D17320's.
- `tests/ir-shadow-rows/untyped-minted-null.vl`: covered >= 4, no `rep ?` row (base 2, head 4).

## Readings (base 4e84cecc, fixpoint seeds on both sides; master merged after, mechanically)

| reading | result |
| --- | --- |
| census provenance | base arm: `compiler/ir_build.vl`, `ir_verify.vl`, `ir_selftest.vl` at 4e84cecc's copies |
| tests/cases census, every class that moves | `rep ?` 20 → 14 functions (`mkU`, `null-only-optional-read-and-call.vl::stmt$1`, and four of the witness's own); `start: rep ?` 1 → 0 (the witness's `@init`, now `start: string operand after another`); legacy module `const cell union box` 3 → 1 programs, `const cell plain` 5 → 4; no function newly missed (the verifier change refuses no function that verified); fully IR-only 6,565 = 6,565; self-compile 0 |
| distilled corpus, mode 4 | no row moved |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 8083, differ 0, expected divergence 2; witnesses same 77 |
| `ir-identity.sh --claimless` | identical 14494, differ 0 |
| legacy A/B (tests/cases + probes) | 8,156 programs, 0 moved |
| L2 self-compile fuel per PR | +0.04% on 128,505,172,184 |
| late demands / late tag rows / `self ir misses` | 10 (baseline 10) / 315 (0 gone) / 0 |
