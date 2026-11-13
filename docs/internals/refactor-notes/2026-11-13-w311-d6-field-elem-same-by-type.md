# Step 7 L2 D6: two field slots hold one element by type, not by name, 2026-11-13

Lane F, D6 `sFieldElemName` re-key, first readers. Measured at master `1fff67ce`.

## What changed

- **`fieldElemSame` reads only the element types.** It sits behind `sFieldElemSame` and
  `armFieldElemSame`, which have 8 callers: struct and arm twin tests, the variant-signature
  compare and `sigFieldMayMatch`. It no longer reads the element-name columns. The rule:
  - two typed slots are the same element when `tySame` says so, as before;
  - otherwise they are the same only when neither has an element row (`fieldElemNone`: no element
    type, or a scalar one).
- **`sigFieldMayMatch`'s name fallback is deleted behind a loud floor**, together with
  `sigElemCanonId`, which parsed the element name to a canonical id. A nested-record field with no
  element type now `emitFail`s with a sentence naming the missing recorder.

## Decision table (probes, 24,203 programs)

`emitFail` probes at the end of `emitProgram`, run under the sweep's `vl check --codegen` path.

| element types recorded | answer from the names | answer from the types | programs |
| --- | --- | --- | --- |
| both | `tySame` | `tySame` | unchanged |
| neither | `"" == ""`, true | true | 3,916, all with both names `""` |
| one, a scalar (`TyPrim`), both names `""` | true | true | 7 |
| one, a literal-set union, names differ | false | false | 6 |
| any other mix with a non-empty name | `na == nb` | — | 0 |

The rows:
- The 7 scalar cases are D10931 and 6 `tests/cases` programs that pass a union of lists to a
  generic. One slot recorded its scalar element type and its twin recorded none.
- The 6 literal-set cases are D1461, D14752, D15152 and three `tests/cases/unions/`
  literal-set-beside-base programs. One slot is a literal-set field and the other its base.

**Refused first version.** I first answered "exactly one typed → different". The first probe had
counted only the cases with a non-empty name, so it missed the 7 scalar cases. The sweep refused
that version: 7 runs → not-runs, all `a union arm's fields are not its row's`. The scalar rule
above is what the second probe found.

`sigFieldMayMatch`'s name branch is reached in 0 programs. The control is the `fieldElemSame`
markers in the same probe build, which fired in 3,922 programs.

## Measurement

Sweep with fixpoint seeds, master `1fff67ce` → this: all 24,204 the same (0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps).
