# I8a's remaining const cell fallbacks (2026-11-25, lane COV-START)

I8 needs `emitConstCellInit` off `emitExpr` (ir-i8-cutover §2). I8a (#9335) routed it through
the door, with a fallback to legacy on a miss. This note measures whether that fallback is still
taken, then closes three of the shapes that take it.

## The fallback is still taken

Armed shadow (`$VL_IR_SHADOW=1`) over all 27,421 programs of four populations: the distilled
cells and named set, tests/cases, the capability probes and the witnesses filed `runs`. On master
75ea62ad, 18 programs have a const cell miss, so legacy's `emitExpr` writes those cells:

| miss | programs |
|---|---:|
| `array element coercion` | 8 |
| `array ref` | 7 |
| `object field coercion` | 4 |
| `box ladder` | 2 |

Each is a general builder class: the same shape inside a function misses the same way. So I8a is
not complete.

## The mechanisms, one commit each

- **A constant list literal at its storage row.** `const xs = [{ x: 6 }]` handed to a
  `{ x: i32 | string }[]` parameter. Legacy builds the literal at the wider record (D2060), and
  the binding's storage row (`letBindTy`, D14434) is that list. Under `gConstExprEmit`,
  `globalInitValue` builds a list literal at that row (`arrayLit` with the row's type), and the
  cell stores it.
  - A first cut applied this to start bodies as well. It turned one claimed start
    (`named/d16132_spread_of_built_unann.vl`) into a rule-3 verifier refusal: a spread over the
    rebuilt list meets the binding's own type. So it is held to constant cells.
- **A packed `u8` field** takes a plain i32, which the struct's packed field truncates, as a
  packed list's element does. The verifier's record rule admits it. No hand-built self-test: the
  `u8` type is a checker symbol `ir_selftest.vl` may not import (phase-state census). The
  committed sweep holds the admit path under the verifier.
- **A variant's omitted sentinel field.** The field is a `boolean | null` or an atom `| null`, and
  `emitVariantStruct` writes the minted `null` as that field's sentinel. The IR writes the field's
  own null (`nullOwnOfRep`). A `string | null` field keeps the delivery's reference null; the
  string owner mismatched legacy's bytes.

## Measured, master 75ea62ad → head

Same probe, same program lists:

| reading | master | head |
|---|---:|---:|
| programs with a const cell miss | 18 | 13 |
| tests/cases functions claimed (distinct) | 44,383 | 44,385 |
| tests/cases start bodies claimed | 7,710 | 7,711 |
| armed shadow mismatch, fail and fallback rows | 26 | 26, the same rows |

## Left

| miss | programs | the shape |
|---|---:|---|
| `array ref` | 6 | an empty `[]` at a list of maps of hole-fn closures. Legacy builds it at slot 0, "some other list's row" (`arrRefSlotOf`), since a map whose value type is still open keys no row. Not a claim to match byte for byte. |
| `array element coercion` | 5 | a record list beside twin rows of one layout (D2938, D6731, D6772): the element is built at the nullable-field row `J`, and the list holds the non-null `{f: {v: i32}}` on the same heap |
| `box ladder` | 2 | the shared box plan's ladder arm (`boxPlanWhy`) |
