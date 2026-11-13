# Step 7 L2 D6: two field slots hold one element by type, not by name, 2026-11-13

Lane F, D6 `sFieldElemName` re-key, first readers. Measured at master `1fff67ce`.

## What changed

- **`fieldElemSame` reads only the element types.** It is behind `sFieldElemSame` and
  `armFieldElemSame`, with 8 callers: struct and arm twin tests, the variant-signature compare
  and `sigFieldMayMatch`.
  - Both slots typed: `tySame`, as before.
  - Neither typed: the same element.
  - Exactly one typed: different elements.

  The element-name columns are no longer passed to it.
- **`sigFieldMayMatch`'s name fallback is deleted behind a loud floor**, together with
  `sigElemCanonId`, which parsed the element name to a canonical id. It handled a nested-record
  field with no element type; that case now `emitFail`s with a sentence naming the missing
  recorder.

## Decision table (probe, 24,203 programs)

I ran `emitFail` probes at the end of `emitProgram`, one marker per category, recorded with the
sweep's `vl check --codegen` path.

| element types recorded | answer from the names | answer from the types | programs |
| --- | --- | --- | --- |
| both | `tySame` | `tySame` | (unchanged) |
| neither, both names `""` | true | true | 3,916 |
| neither, a name non-empty | `na == nb` | true | 0 |
| one, names equal | true | false | 0 |
| one, names differ | false | false | 6 |

The 6 are D1461, D14752, D15152 and three `tests/cases/unions/` literal-set-beside-base cases.
In each, one slot is a literal-set field and the other its base.

`sigFieldMayMatch`'s name branch is reached in 0 programs. The control is the `fieldElemSame`
markers in the same probe build, which fired in 3,922 programs.

## Measurement

Sweep with fixpoint seeds, master `1fff67ce` → this: see the PR.
