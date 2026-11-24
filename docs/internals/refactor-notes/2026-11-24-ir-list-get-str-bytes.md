# IR: list `.get(i)` and string `.bytes()` (2026-11-24, lane IR-D1)

The probes batch's PR2: mechanisms C and D. Every `xs.get(i)` missed as `method get` and every
`s.bytes()` as `method bytes`.

## Mechanism C: `xs.get(i)`

Legacy writes `.get(i)` with `.pop()`'s body (`emitPop` with `getIdx`): it marks the call's
operands (`listGetStageMark`), resolves the receiver as a pop does (`listOpRecvLocal`), syncs a
view (`emitListGetViewSync`), then runs the same scalar or ref tail, whose condition and element
read each write the index from the call (`pushTakeCond`, `pushTakeElem`). `RListPop` gains `lqIx`,
the index operand. The builder routes `get` to it. The lowering opens and closes legacy's markers
(`listGetStageEnter`, `listGetStageRestore`), stages the receiver as for a pop, syncs, consumes the
index operand unwritten, and runs the shared tail with the index node.

Named misses:
- `get index staged`: an index legacy does not re-read in place (`listGetIdxReReadable`), which it
  tees into its stash on the first read;
- `get index operand`: an index whose build writes nodes or is not an i32;
- `coalesce listGetOr`, already named: `xs.get(i) ?? d` over a scalar list, legacy's fused read.

A receiver legacy stages (a field, a call) is claimed: the staged path is pop's, and
`list-get-staged-receiver.vl` matches.

## Mechanism D: `s.bytes()`

`StrOp` gains `bytes`; the lowering writes the receiver then `strBytesTail`, moved out of
`emitStrBytes` unchanged.

## Verifier

- `RListPop`'s `lqIx` holds at most one operand, an i32: `get-of-list` holds (0);
  `get-index-of-string` is refused (2).
- `bytes` yields a list of u8s off a string: `bytes-of-string` holds (0); `bytes-of-i32` is
  refused (2).

## Readings

Each census arm ran in a tree at its own commit: the base in a tree at `052fa48d`, the head in
this branch's tree, both on fixpoint seeds. 0 claimed functions are lost in any population.

Where the 89 functions go, counted by origin (a start and a module `@init` count by their
`claimed start` row):

| Miss | Origin | Base | Claimed | Next miss |
|---|---|---|---|---|
| `method get` | cases | 31 | 26 | 2 `get index staged`, 1 `coalesce listGetOr`, 2 `is box not a local` |
| `method get` | distilled | 6 | 0 | 3 `rep ?`, 3 `shared member callee kid` |
| `method get` | probes | 4 | 4 | |
| `method get` | witnesses | 10 | 9 | 1 `get index staged` |
| `method bytes` | cases | 30 | 29 | 1 `push late receiver` |
| `method bytes` | probes | 3 | 3 | |
| `method bytes` | witnesses | 5 | 5 | |

76 of the 89 are claimed.

- Identity: names `identical 9433, differ 0`, self-compile identical; cases `identical 7905,
  differ 0`; claimless `identical 14464, differ 0`; legacy A/B `7969 same`, empty.
- The Q58 sweep (`tests/cases/lists/list-get-*.vl`, `tests/cases/strings/str-bytes-*.vl`, 40
  files) is claimless-identical: `identical 40, differ 0`. `cmp` and `wasm-dis` identical, claimed
  against legacy: `list-get-staged-receiver.vl` (a staged field and call receiver),
  `list-get-sweep-let-record.vl`, `str-bytes-sweep-let.vl`.
- `list-get-effect-index.vl` prints `20 1 - 2`, and `list-get-staged-receiver.vl`
  `20 -1 b - 2`, on the base seed, the head seed and the claimless compiler: an effectful index
  or receiver runs once.
- The legacy diff is 19 lines: three exports, `listGetStageEnter` (save then mark, as
  `emitPop`/`emitPopGo` do), and `strBytesTail` moved out of `emitStrBytes`.
- Fuel: per PR +0.17%; the pair (head seed building the base tree) is L2 126346374940 against
  base 126346067142.

## Legacy tails the IR calls

`popRefTail`, `popScalarTail`, `emitListGetViewSync`, `listGetStageEnter`, `listGetStageRestore`,
`strBytesTail` (wasmEmit.vl); the last three new, `strBytesTail` moved.
