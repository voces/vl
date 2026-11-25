# IR: a union box narrowed to a list's, closure's or map's `A | null` (2026-11-24, lane IR-N1)

`narrowed read niche kind`: a union box local narrowed by `is` to `A | null`, where `A` is a list,
a closure or a map. Legacy writes the box and then `emitNicheReadTail(exprIx,
nicheReadKindAt(...))`, and the IR's `RNicheRead` lowering already calls that tail for any kind.
Only the builder's kind gate (`boolean | null` and `string | null`) and verifier rule 2 stopped
the reference niches.

## The family, by ablation

On master a656a885, one program per ingredient:

| `A \| null` | read | master |
|---|---|---|
| `i32[] \| null` | bound | miss |
| `i32[] \| null` | a call argument | miss |
| a closure `\| null` | bound | miss |
| a map `\| null` | bound | miss |
| control: `string \| null` | bound | matched |
| control: `boolean \| null` | bound | matched |

## What landed

- **`nicheReadRefOf`** (`emit_classify`) names the reference niche by the read's type: "list",
  "closure" (an untagged function) or "map". The builder admits a niche read by that predicate,
  never by its raw kind number.
- **Verifier rule 2** pairs each kind with exactly its shape (`nicheRefFits`):
  - `NICHE_NUL_MAP` with a nullable map;
  - the closure box tag 11 with a nullable closure;
  - a list's box tag with a nullable list.
- **Controls 10 and 11** (`nicheKindControl`) move each reference kind to the next shape's, or
  the previous one's. Rule 2 must refuse each.

## The kind numbers

The kinds share one numeric space:

| kind | numbers |
|---|---|
| `boolean \| null` | 1 |
| `string \| null` | 2 |
| a literal union (`NICHE_NUL_LIT`) | 3 |
| a closure's box tag | 11 |
| a list's box tag | 7, 8, 9, 10, 12, 17, 18, 63 |
| `NICHE_NUL_MAP` | 100, which `nicheKindSelfTest` bounds above every list kind |

A tagged function set boxes at 0. None collides with 1, 2, 3 or 100, and 11 is no list tag. Only
the tagged set's 0 is ambiguous, so the builder tests the type predicate. A tagged function set
keeps the miss.

## Legacy tails the IR calls

- None new: `emitNicheReadTail` (`wasmEmit`), as before, now for the reference kinds.

## Witnesses

- `tests/ir-shadow-rows/narrowed-read-reference-niche.vl`: each kind bound and as an argument,
  with the scalar control. Base 3 of 7 matched; head 7 of 7.
- `tests/vl_ir_shadow_test.ts`: each kind holds, then reds under control 10 and under control 11.
- Q58, one function per position, each called with a value, `null` and the other member:

| program | base | head |
|---|---|---|
| `tests/cases/unions/narrowed-reference-niche-list-in-each-position.vl` | 63/74 | 74/74 |
| `tests/cases/unions/narrowed-reference-niche-closure-in-each-position.vl` | 77/89 | 89/89 |
| `tests/cases/unions/narrowed-reference-niche-map-in-each-position.vl` | 63/74 | 73/74 |

The map program's one remaining function stops at `box ladder`. Every program's claim-mode build
is byte-identical to claimless and prints the same.
