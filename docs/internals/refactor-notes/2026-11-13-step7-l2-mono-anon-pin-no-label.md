# Step 7 L2, mono: no `#anonN` pin is read by its label (2026-11-13)

Lane D. Base `17755ac1`. Closes D16021.

## Cut

1. `recordClonedNodeTyFb` (`check_emit_queries.vl`) types an `#anonN` pin at its literal's
   record (`tyFb`) instead of the `{}` placeholder, unless `tyHasRepHoleAt(tyFb)`. A rep hole
   would read as a parameter no call binds (`paramValtypeFloor`). A pin forwarded through a
   second instance (`fwd(o: G) { show(o) }`) therefore pins at the literal's type.
2. `anonPinLitCarry` (`emit_nullable_rets.vl`) is called at `monoInstantiate`'s three sites that
   re-synthesize a pin at the instance's substituted type. Without it, the replacement node
   loses the literal's identity type (D6471: `{f: (string) => string, g: i32}` against the row's
   `{f: (T) => T, g: i32}`).
3. `retStructRowIndex` drops the label read (`structIndexByName(ty.tyName)`) and its
   `nameIsAnonHandle` test. A pin's row is the anonymous row at its literal type, else the typed
   ladder.

## Decision table

From an `MPROBE` build over the 24,070-record population, unarmed. Each `#anonN` pin's
label-free answer is compared against what the label read would have given:

| answer | programs | decisions |
| --- | --- | --- |
| anonymous row by literal-type identity, same as the label | 9 | 103 |
| typed ladder, same as the label | 237 | 2,074 |
| different from the label | 0 | 0 |

The forwarded witness moves from "the label disagrees with the typed ladder" to "the typed
ladder agrees" (11 decisions).

The first attempt guarded on `tyHasTyVar || tyHasInferHole`. That left the witness on the
placeholder. Recording without the carry moved 7 programs to disagreement, which is what the
carry repairs.

## Byte comparison

Master vs PR over every program reaching an anonymous pin, plus the witnesses: **250 SAME, 10
DIFF**.
- All 10 DIFF programs are in the generic-function-field family (D6422, D6471, D6702, D15447,
  the four `tests/cases` programs, and two witness spellings).
- Their output is identical, armed and unarmed.
- The disassembly differs only in that the empty `(type (struct))` the placeholder pin stood
  for is no longer emitted, with later type indices renumbered.
