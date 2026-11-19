# IR coverage: a string's `.charCodeAt` (2026-11-19, lane IR4)

On master 8b89f4bc3, the blocker census (`VL_IR_SHADOW=4`) showed `method charCodeAt` alone
blocking 13 self-compile functions.

## What changed

`s.charCodeAt(i)` is the same operation as `s[i]`: a guarded `backing[start + i]` over the string's
backing, through the same loop-hoist arm. The IR already builds `s[i]` (`RListGet`, arm `string`).
It asks `rawStrHoistOf`, skips a receiver a live hoist holds, and ends in `rawStrGetTail`.

- **Legacy:** `emitStrCharCode` now asks the hoist through `rawStrHoistOf` and ends in
  `rawStrGetTail`, so its own copy of the guard and `array.get` is deleted. `rawStrHoistOf` now
  takes the receiver node instead of the `Index`, so both reads key it on one thing.
- **IR:** `StrOp` gains **`charcode`**, built in `methodRhs` when legacy's `exprIsStrMethod(…,
  "charCodeAt")` answers with one argument. `lowerStr` writes it as `s[i]`'s read is written:
  - the receiver, or `irLSkip` of it when `strCallHoistOf` finds a live hoist;
  - the index;
  - `rawStrGetTail`.
- **Verifier:** the `RStrOp` rule now takes a `charcode` index as an i32, as it takes a slice's
  bounds.

## Measured

Fixpoint seeds: master d32521247 against this branch on the same base.

| | master | this branch |
|---|---|---|
| self-compile claimed (mode 3) | 15,550 | 15,565 (+15) |
| corpus covered = verified = matched | 35,273 | 35,277 (+4) |

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,515, differ 0 |
| `--claims` / mode 3 | ok / identical |
| armed shadow | all matched; ok |
| L2 fuel | 100,778,804,910: −0.004% on master (100,782,837,712) |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, ladder-sets, dead exports, comment budget | clean / ok / 0 / ok |
| phase state, late demands | ok (hidden 154) / 9 of baseline 9, 307 tag rows |
| `deno task test` | 9,576 passed, 0 failed |

**Lines: compiler +35 / −16.** `wasmEmit.vl` is +6 / −8: legacy's duplicate guard-and-read is
deleted. The IR side adds about 20.
