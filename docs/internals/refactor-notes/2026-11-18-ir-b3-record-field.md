# IR B3: the record field read, and the driver census, 2026-11-18

Lane IR2. The blocker census put `list length rep` first, 1,348 self-compile functions alone. It
was a mask. `buildMember` refused the list's rep before it built the receiver, and the receivers
are record field reads (`declAnnTy.node.length`). Admitting every list rep alone gained 77
functions, and `member record` rose to 3,095. This step takes both.

## What landed

- **A list of any element is a value** (`refRepOk`). Each read, write and walk over it still
  decides its own arm. An element read of a packed `u8` list is a named miss (`index packed
  element`).
- **A record rep is a value** (`valueRep` admits `RRecord`).
- **The plain field read is one decision, shared with legacy.**
  - `memberReadPlain`: `emitExpr`'s plain member arms, with no null-unit or niche read, no
    `length`, no two-list use and a receiver read raw. B2's `narrowedFieldPlain` now starts from
    it too.
  - `variantFieldPlain` and `variantFieldTail`: a bare variant receiver.
    `emitMemVariantRead`'s variant arm writes through the tail.
  - `structFieldPlain` and `structFieldTail`: a plain struct receiver with no narrowing op and
    no union-box field. `emitMemStructRead` writes through the tail when no narrowing op applies.
- **`RGetField { gfV, gfIx, gfAt }`** is built over that decision.
  - `gfIx` is the field's position among the record rep's fields, in the type's field order
    (`repRecordKidOf`). The struct's own field order can differ, and the verifier's rule 2
    caught that on the first build.
  - A field whose rep is not the read's is a named miss (`field read coercion`).
  - The lowering writes the receiver, the struct or variant tail, then `emitReadRecover`.
- **`RGetField` is the `record` family, and `record` is claimed.**
- **`irLSkip` consumes a field read's receiver.** A loop-hoisted list such as
  `declAnnTy.node`, held in a local by legacy, is skipped together with the global read beneath
  it. This fixed the 14 functions whose lowering had stopped at "non-stack temp: out of order".

## Coverage

Fixpoint seeds of master d28639f5 and of this step, each built from its own checkout.

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched = claimed | 8,388 | 11,018 | **+2,630** |
| corpus covered = matched = claimed (12,297 cells) | 28,695 | 30,409 | **+1,714** |

First miss, master → this step:

| first miss | self-compile | corpus |
|---|---|---|
| `list length rep` | 2,699 → 0 | – |
| `parameter rep record` | 1,568 → 0 | 1,530 → 0 |
| `member record` | 486 → 11 | 29 → 296 |
| `local rep record` | 163 → 0 | 588 → 0 |
| `parameter rep list` | 168 → 0 | 505 → 0 |

Net compiler lines are +125 (+157, −32): 21 self-compile and 14 corpus functions per line.

Next doors, from the self-compile blocker census on this step (one class alone):
- `expression if` 1,136;
- `narrowed read` 653;
- `is guard` 564;
- `map read inline` 290.

## The driver census

`scripts/ir-driver-census.sh <seed>` counts calls into every top-level function of
`wasmEmit.vl` and `emit_*.vl`, in a throwaway instrumented copy of the compiler. It runs the
self-compile and the corpus twice: armed with claiming off, then as shipped. A function hit in
the first run and not in the second is reached only by functions now claimed, on this
population. That is where a deletion is sought, not its proof. Its five rows are in
`2026-11-18-ir-driver-census.tsv`.

- Of 7,572 emitter functions, 6,365 run with claiming off and 6,360 with claiming on. The other
  1,207 are reached by nothing on this population.
- Of the five candidates, `emitIndexBanked` is the armed shadow's own element-read row writer,
  so it is not a claim effect. The other four are rare arms: `emitStrCpLen` (674 calls),
  `emitF64RemCall` (10), `fbF64Neg` (3) and `emitArrF32` (1).
- So at about 60% of the self-compile claimed, legacy's drivers are still reached by the
  unclaimed functions. The census becomes a deletion list as coverage closes the doors above.
  The largest falls today are `emitCallCoreFromCodePoint` (348 to 2), `emitCharLitNode` (6,747
  to 383) and `emitCallCoreFromCodePoints` (4,074 to 349).

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; master's fixpoint seed builds this source to it byte for byte; `--names` build too (11,005,826 B both) |
| corpus identity, master seed vs this seed | 9,030 identical, 3,267 fail under both, 0 differ; `--names`: 0 differ |
| `--claims` and mode 3 | 11,018 self-compile and 30,409 corpus claimed, 0 fell back; mode 3 corpus identity 0 differ |
| shadow | all matched; the armed self-build is byte-identical |
| L2 self-compile fuel | 96,507,684,434 to 96,453,569,876 (−0.06%) |
| pin helpers in `emit_mono.vl` | 904 |
| phase-state census | ok |
