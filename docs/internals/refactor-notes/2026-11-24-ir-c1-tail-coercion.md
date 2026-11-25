# `tail coercion`: a nullable value recovered at the non-null result (IR-C1)

`tail coercion` was 8 functions with mode-4 rows on master 10cbad91. Six are corpus functions, the
`d3290` grid (`named/d3290_r4_gN_n{2452,2453,3468,3469,4484,4485}`: a field, an element and a
global, each with `Knul0` and `Knul1`): a lambda `() => x ?? "n"` in a generic instance at
`T = K | null`. The other two are in tests/cases.

A probe compiler, never committed, split the miss's two halves. All six corpus functions are
`rep nullable vs str`: the tail value is built at its node's nullable rep, and the lambda returns
`str`. Legacy's `emitReturnPlainValue` writes the value, then `ref.as_non_null` where
`retNeedsNonNullRecover(retArg, fnIx, fnPos)` holds. The IR never asked it.

- **`retRecover`** (`ir_build.vl`): after `deliver`, a value whose rep is an `RNullable` over the
  result's rep, where legacy's own `retNeedsNonNullRecover` holds, is built as
  `RRecover { rcV, rcAt: arg, rcNn: 1 }` at the result rep. `fnPos` is `fnStmtsPosOf` for an
  unannotated result, else -1, as `emitReturnValue` computes it. `retDelivered` (expression tail
  and explicit `return`) and the tail `if` arm's value call it. No new kind.
- **Label split**: a tail whose delivery already missed now keeps that miss (`ibMiss`) rather than
  `tail coercion`. In the tests/cases IR-only census, no function moved: 1,926 missed functions at
  base 41c3d2f63 and at head, no class count changed (`scripts/ir-only-census-ab.sh`, which runs
  each side at its own `compiler/`; the first reading ran both sides from one tree).

## What stays (FREE, per the queue)

- `functions/tail-if-map-nullable-twin`: an arm's map at a nullable twin row (`rep map vs map`).
- `generics/hole-optional-member-read-record-union`: an `f32` arm where the result is nullable.

## `return coercion`

The explicit `return` spelling goes through the same `retDelivered` (queue ruling: keep it). Corpus
`return coercion` is 6 functions before and after, and the tests/cases census is unchanged, so
nothing moves out of it. No function in M1's d15214 or D1's hole-fn container-return set moved.

## Legacy tails the IR calls

None. `retNeedsNonNullRecover` and `fnStmtsPosOf` are legacy predicates the builder asks.

## Readings (base 41c3d2f63, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7749, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14054, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45530 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, margin | 467 ok; fail 903 KB / pass 906 KB on both |
| L2 self-compile fuel per PR | +0.01% on 123,638,118,586 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| emitter-state audit | 0 never-cleared, 0 unguarded |
| `self ir misses` | ok, 0 missed (baseline 0) |
| `tests/vl_deep_nesting_test.ts` (host linked) | 8 passed, 0 failed |
| corpus blockers `tail coercion` / `return coercion` | 6 → 0 / 6 → 6 |
| shadow row `tail-nullable-recovered-at-result.vl` | 16 covered = matched (master: 12; 3 `tail coercion`, 1 `return coercion`) |

The row's runs print `z y w v n a n a`: each face recovered, and where the left side is null at
run time, the default delivers. The lambdas of the field, element and global cells are byte-for-byte
the same under legacy (base) and the IR (head). The global face reads
`return (ref.as_non_null (global.get $global$4))`.
