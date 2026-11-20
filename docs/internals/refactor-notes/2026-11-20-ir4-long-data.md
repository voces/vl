# IR list literals past the operand cap, phase A: constants from the data segment (2026-11-20, lane IR4)

`array long` was the door's miss for a list literal past `NEW_FIXED_MAX` (10,000). Legacy takes
one of three routes for such a literal:
- one passive data segment of constants;
- a segment with its computed elements stored after it (D3465);
- a chunked build.

Phase A is the constants-only segment, IR-REV's first cut.

## One route decision

- **`arrLitLongRouteOf(elems, fnIx, arm, row)`** is a pure predicate answering `dataConst`,
  `dataComputed` or `chunk`. It reads exactly the partition `arrLitDataBuild` makes:
  `arrLitElemIsConst`, else `arrLitDataStores` at the arm's form. An arm with no data form (`str`,
  `ref`, …) is `chunk`.
- **`arrLitDataTry`** asks it, runs `arrLitDataBuild`, and wraps. All three legacy arms
  (`emitArrI32`, `emitArrWide`, `emitArrU8`) call it in place of their inline build-and-wrap. On a
  `chunk` route they skip `arrLitDataBuild`, which returned 0 there before writing anything, so
  legacy's bytes do not move.
- **The IR builder** misses `array long <route>` unless the route is `dataConst`.
- **The lowering** re-asks the route and misses on disagreement. A decline after that is an
  `internal:` `emitFail`.

## Constants only, from the AST

- **What the tail emits.** `arrLitDataBuild` emits each element from the AST, and the elements are
  exactly `arrLitElemIsConst`'s kinds: a number literal, a negated one (`-` over a `NumLit`) or a
  boolean literal, parenthesized or not. A const-folded name, a char literal and any other
  expression are computed elements and route away from `dataConst`.
- **The immediates are for the verifier only.** The builder holds each element to an immediate at
  the list's element rep (`longConstElem`):
  - a number literal's own bits;
  - a boolean's 0 or 1;
  - a negation as two's complement for an integer, or the float sign bit flipped, so `-0.0` stays
    exact.

  The lowering skips them (`irLSkip`), and the tail writes the AST's bytes. Nothing may lower from
  those immediates: they are a second, independently derived spelling of each constant.

## Segments are idempotent by content

`arrLitDataBuild` registers its passive segment at lowering, at the point legacy would. A segment
used to be numbered on every registration, with no dedup. So when the IR lowered after legacy (the
door probe, the whole-function dual emit), it registered a second segment, wrote
`array.new_data k+1` where legacy wrote `k`, and left the armed module one segment heavier.

`litSegOf(parts, n)` now returns the segment that already holds the same bytes. It finds candidates
by an FNV hash of the bytes and their length, then compares the bytes in full. Registration is
idempotent under re-emission, as string segments already are through `gStrDataIx`. A segment is
raw bytes that `array.new_data` reads at the array type it names, so sharing one across element
types is sound.

- **Legacy output change.** Two byte-identical long literals now share one segment. Witness: two
  10,001-element `i32[]` literals with the same elements. The module goes from 80,371 to 40,363
  bytes; the output is the same on both seeds (20273); `wasm-opt --all-features` validates it.
- **The A/B over 7,595 programs moved nothing**, so no corpus program holds two such literals.
- **Armed, unarmed and mode 3** are byte-identical on the u8, widths-exact and chunked sites.

## Measured

Fixpoint seeds: merge-base 34d192f84 against this branch.

| at the door, corpus + cases | merge-base | this branch |
|---|---:|---:|
| `array long` | 14 | 0 |
| matched (the 4 `dataConst` sites) | 35,686 | 35,690 (+4) |
| `array long chunk` (u8 computed ×4, str ×2) | – | 6 |
| `array long dataComputed` (D3465 ×3, widths-exact's i32) | – | 4 |

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `--cases` | identical 7,527, differ 0; witnesses 59/59 |
| master-vs-head A/B, 7,595 programs | built 7,527, differ 0 |
| mode 3 | identical; claimed 18,525 (merge-base 18,519) |
| L2 fuel | +0.059% on the merge-base (103,501,982,285 vs 103,441,241,154) |
| plumb-shape cost (fuel, peak RSS) | ok on both sides |
| `gate.sh --fast` (seed size, late demands and tags, ladder-sets) | passed |

**Control** (`tests/vl_ir_door_guard_test.ts`): a 10,001-element `i64[]` literal with negatives,
bound, and as a call argument under a live `k * …`. Both match; both miss `array long` on the
merge-base seed.

**Lines: compiler +202 / −22, tests +21.**
