# The unknown-type caret names the component, 2026-11-14

Lane J, D1590.

## What moved the caret

D1590 was filed at `1:25`, which is the annotation's closing `}`, not `bool` (column 21). #2659
(`8ff5f3210`, 2026-09-05) replaced the old last-token anchor with the whole node, and that is
where the `1:13` came from. It was a deliberate change, and the sentence was never anchored on
the component it quotes. The commit message names the change, so no seed bisect was run.

## Fix

`unknownTyErr` (`compiler/check_relate_core.vl`) is the one place that raises this sentence.
When the banked component (`unkTyPart`) is a single identifier that differs from the whole
annotation and is spelled exactly once in the annotation's tokens, the raise spans that token.
A component spelled twice, a multi-token one, or one equal to the whole name keeps the node span.
The missing-import arm narrows the same way.

| annotation | before | after |
| --- | --- | --- |
| `{[i32]: bool}` | `1:13`, whole annotation | `1:21`, `bool` |
| `(i32) => bool` | `1:10` | `1:19` |
| `string \| Strng` | the union | `Strng` |
| `{[i32]: Other}` (missing import) | the annotation | `Other` |
| `x: bool` (bare name) | `bool` | unchanged |

Guard: two rows in `tests/vl_diag_span_test.ts`, the "exception 4" block.
