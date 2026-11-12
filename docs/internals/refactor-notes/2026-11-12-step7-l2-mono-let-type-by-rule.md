# Step 7 L2 §7: a generic local's annotation is the naming rule's spelling of its substituted type; `monoSubstAnonShapes` is deleted, 2026-11-12

`monoSubstLetType` spelled a generic body's annotated `let` with `monoSubstAnn`: the annotation
text with each type parameter replaced by its `tvV` spelling. `monoSubstAnonShapes` then
re-spelled an `#anon` binding by its fields.

In `2026-11-12-step7-l2-mono-subst-ann-callers-measured.md`, taking the rule's spelling here lost 4
programs to invalid modules. Three of them were the let-union registry keying a row by member
order. w316 fixed that in #7379, with D15760 as its pin. The fourth,
`generics/generic-is-over-anonymous-record-pin.vl`, was the rule spelling an anonymous record by
its handle (`#anon0|i32`). That spelling parses to no type, so no typed lookup finds its row.

The base is master `bd129b4d`, after #7379 and #7397, with a fixpoint seed on both sides. The
population is the whole sweep: 23,975 programs.

## Changed

- `monoSubstLetType` takes `monoPinSpellNoAnon` (#7397) of the let's type substituted at the
  instance. That is the naming rule with a record whose row is an `#anon` handle spelled by its
  fields, at every depth. A binding that stays open keeps its annotation.
- `monoSubstAnonShapes` has no caller left, so it is deleted.
- `monoPinSpellFields`, read only by `monoSubstAnonShapes`, is deleted too.

## Probed: where the rule has no type to spell

The probe ran in a scratch compiler (#7119's accumulator). It kept `monoSubstAnn` as a fallback
whenever the substituted type was missing or open. The fallback was reached in 25 programs:

| case | programs | what the old path did | now |
| --- | --- | --- | --- |
| `const b: F = a`, with `F` bound to a generic function value (`(T) => T`, still open) | 24 | synthesized a TypeRef spelled with the callee's own `T`, with no type | keeps the annotation `F` |
| a loop value's `T \| null` (`loops/loop-value.vl`) | 1 | substituted the text | **keeps `monoSubstAnn`** |

Dropping the fallback for the loop value loses `loop-value.vl` (an invalid module in
`firstOver`). The parser synthesizes that annotation from text (`parser.vl`, the loop value's
`nm + "\|null"`), and the checker records no type on it (`nodeTyIxOf` is -1). The fallback is
kept only for an annotation that has no type: a floor outside emit_mono. It closes when the
parser's synthesized annotation carries its type.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 23,949, bytes-only 26,
  output movers 0, runs → not-runs 0, new compiler traps 0.
  - **25 bytes-only movers change only the source-position section.** The disassembly is
    identical. The 24 open-`F` programs, plus one more, now keep the let's own TypeRef where a
    synthesized one stood, so a few code ranges map to its column.
  - **D10521** drops a dead union-box type (`struct {i32, anyref}`, referenced only by its own
    definition) and a dead function type. No code moves.
- **render-parse** goes from 17 / 57 to 16 / 55 (`--findings`). The baseline is left for w310's
  next PR.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0, late demands 6, seed size +1.0%;
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-spell shadow, pin-helper and render-parse budget tests: 7,468 passed.
