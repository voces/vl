# Step 7 L2, mono: `retStructRowIndex` answers a tagged record's stored row by type (2026-11-13)

Lane D. Base `739db770`. Inventory row D16020.

## Cut

- `retStructRowIndex` (`emit_nullable_rets.vl`) gets a first rung. A record type holding a
  tagged set answers the row of the type it is stored at, via `monoTagMapRepTy`, which
  `emitProgram` installs as `tagRepTyFn` (the `tagRepNameFn` pattern).
- The rest of the typed ladder moves into `retStructRowOfTy`.
- The `#anonN` label rung is demoted. It used to answer first. It now answers only when its row
  disagrees with `retStructRowOfTy`, and it is a loud `emitFail` floor citing D16020 when no
  typed rung answers.
- A prototype pinned the instance at the literal's field-value record. It is dropped: a probe
  showed the pin already holds the tagged set wherever the argument is a literal
  (`pin.lit.held`, and never `pin.lit.open`), so the rewrite never fired.

## Decision table

From an `MPROBE` build over the 24,070-record population, unarmed:

| rung | programs | decisions |
| --- | --- | --- |
| tag-rep rung answers, same row as the typed ladder | 1 | 11 |
| tag-rep rung answers, a different row | 0 | 0 |
| label rung, same row as the typed ladder | 237 | 2,074 |
| label rung, a different row | 9 | 106 |
| label rung, typed ladder answers -1 | 0 | 0 |
| label names no row | 2 | 21 |

Armed (`VL_OPAQUE_SNAMES=1`), on the witness the tag-rep rung answers a different row 27 times.

## Byte comparison

| comparison | programs | result |
| --- | --- | --- |
| master vs PR, every program reaching either rung, plus the witness | 249 | 249 SAME |
| label rung kept vs deleted outright | 247 | 238 SAME, 9 DIFF |

In the second comparison, all 9 DIFF programs are invalid modules once the label rung is
deleted (`runs → not-runs`). That is why the rung stays, as a floor scoped to disagreement.

The floor's firing control is a scratch build that fails on every disagreement instead of
only on a typed miss. It prints the D16020 message on the first 3 of the 9.

## Armed movement

| program | master armed | PR armed |
| --- | --- | --- |
| D16020 witness | emit error, `ref valtype with no interned shape` | invalid module at the call |
| `union-of-records-arm-holding-type-param-built-at-instance.vl` | exit 70 | exit 70 |

The remaining disagreement is on the build side, where the literal is built at its own fields'
row. That is D16020's close (PR 2).
