# IR: a union cast over a boxed nullable operand, 2026-11-24

Lane IR-N4. Base: master 007b07c8. Class `union cast operand rep`.

## Change

- `asUnion` admits a `boxedNullable` operand (disc 4) beside a box. Legacy's `emitAsUnionCast`
  writes the operand, then `emitAsUnionTagTail`'s tag test. A boxed `T | null` is a non-null box
  carrying `nullBoxTag()` (`emitAsUnionOpt`), so the test reads it as any box, and the null tag
  fails every arm: `as?` yields its null, `as!` traps.
- The verifier's `RAsUnion` rule admits `RNullable` disc 4 beside `RBox`, and nothing else.
- The lowering is untouched: `irLOpnd(auV)` writes what `emitExpr(obj)` writes, then
  `emitAsUnionTagged`, legacy's own tail.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `boxedNullable` (existing, new use) | `emitAsUnionCast`, which hands `emitAsUnionTagTail` the box `emitExpr` leaves, null-tagged or not |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

Witnesses, all committed:
- `tests/cases/unions/union-cast-over-boxed-nullable-positions.vl`, the Q58 sweep. Each position
  takes a hit, a wrong arm and a null, tagged by the operand's string cast, so the null reads
  apart from the wrong arm: `7n -1s -1n`, and `7n -5s -5n` at `??`. The positions are a scalar
  argument (`as!`), a union-parameter argument, a nested argument, a concat operand and an
  interpolation hole (`as!`, since a nullable string is a check refusal there), a `return`, a
  `const` initializer, an `if` arm, a `??` operand and a record field.
- `tests/ir-shadow-rows/union-cast-over-boxed-nullable.vl`, the same positions less the hole.
- `tests/cases/unions/union-cast-trap-over-boxed-nullable-null.vl` and `-wrong-arm.vl`: `as!` over
  a null and over another arm. Each prints `before`, then traps (`unreachable`), with rc 1 under
  both seeds.
- Capability probes `as-null-cast-hole-param-argument.vl` and `numeric-as-cast-hole-param.vl`.
- Self-tests `union-cast-of-box` and `union-cast-of-boxed-nullable` (admitted);
  `union-cast-of-niche-nullable` and `union-cast-of-i32` (rule 2). So the widening is disc 4 only.

Fixpoint seeds on both sides, master 007b07c8 against this branch, `VL_STD` the tree's:

| class (rows summed) | master | branch |
| --- | ---: | ---: |
| union cast operand rep, tests/cases functions | 14 | 0 |
| start: union cast operand rep | 2 | 0 |
| union cast operand rep, capability probes | 2 | 0 |
| tests/cases armed functions matched | 80233 | 80260 |
| tests/cases armed starts matched | 7087 | 7088 |

By program:
- `simd/captured-reassigned-vector-cell.vl` and
  `simd/shared-vector-let-cell-written-and-read-by-two-closures.vl` (a synthesized `as!` over a
  captured vector cell's boxed read), `types/as-null-hole-param-argument-delivery.vl` and both
  probes match fully.
- `narrowing/type-test-one-predicate-is-as-match-runs.vl`'s start matches; its one other function
  (`box into another union`) is uncovered under both seeds.
- `unions/as-opt-record-union-field-read.vl`'s function matches, and its start moves on to
  `start uncovered is box not a local`.

Under mode 6, every witness reads 0 order, mismatch or fail rows. All ten run alike under both
seeds, and claimless over them is identical (10).

Checks:
- No program's covered count fell (per-program `blockers none`, master against branch: 0).
- Self-compile: 20516 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes.
- `ir-identity --names`: identical 9433, fail under both 3267, differ 0, built under one only 0;
  self-compile identical. `--claimless`: identical 14456, differ 0. `--cases`: identical 7777,
  fail under both 68, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7490, fail under both 67, differ 0; the moved list is empty.
- Armed shadow: 0 fail or mismatch rows on both. `--claims`: `ir-shadow: ok`.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900.
- `tests/vl_ir_door_guard_test.ts` 13 passed; `tests/vl_emitter_state_audit_test.ts` 7 passed.
- Fuel: L2 125842550584 against master's 125842550320 (per PR +0.01% on base 007b07c8).
- Late demands 9/9; late tag rows 307/307. Seed size +0.6% on its baseline.
