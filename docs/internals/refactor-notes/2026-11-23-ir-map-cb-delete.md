# IR: a `.map`/`.filter` callback that captures (2026-11-23, lane IR-N1)

The lane was `map callback env` and `method delete` from the 693fd72c census. `method delete` was
already closed on master 88df143e: #9688 built `m.delete(k)`, and no such row is left in
`tests/cases`, the corpus or the self-compile census.

## What landed

- **`RMapFilter` gains `hfEnv`**, the captures of a function-literal callback that has an
  environment (`mapFilterWhy`'s `map callback env`). The builder reads them with `cloEnvOf`, after
  the receiver, and misses if reading them writes a statement (`map callback env read`) or if the
  closure would be refused (`closureValueWhy`).
- **The lowering** writes the receiver and `mfRecvTail`, then the closure from those captures
  through the IR's own `RMakeClo` lowering (`irLMakeClo`), then `mfLoopTail`. That is the order
  legacy's `emitMapFilter` writes, `emitClosureValue` coming after the receiver's store.
- A callback whose environment is cached misses on `closure env cache copy` until N7's #9703
  lands (N7's note).

## Legacy tails the IR calls

None new. `mfRecvTail` and `mfLoopTail` were already the IR's.

## Bytes and coverage

- `--names`: self-compile identical. `--cases`: identical 7,704, differ 0. `--claimless`:
  identical 14,034, differ 0. `tests/cases` A/B: same 8,819, differ 0. The moved list is empty.
- The order check reads 0 order rows over the corpus (12,304) and `tests/cases`.
- `tests/cases`: `map callback env` 28 functions fall to 0. Covered = matched goes from 78,753 to
  78,781. Corpus functions with no blocker go from 45,428 to 45,432. The self-compile census is
  unchanged.

## Fuel

L2 self-compile, +0.06% on base 88df143e (118,858,235,776 to 118,930,274,303).
