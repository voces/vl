# IR coverage step: a start body's string accumulator, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10, after the function-body accumulator
(#9154); measured on fixpoint seeds of this branch and master `8b89f4bc3`.

## Why this class

Every self-compile start function (138 of them) missed on `string accumulator`: the start build
refused any start that owned a top-level accumulator, because the rows `strInPlaceMode` reads were
the start's only while legacy's start had just scanned them.

## What landed

`saScanFor(-1)` rescans the top level with `strAccScanStart`, exactly as legacy does before the
start's code, so the shared decision reads the start's own rows whenever the start build asks. The
start build's refusal goes; the per-occurrence door (`lowerNodeIn`) keeps its own. The append itself
is #9154's: the IR builds the parts as `str.acc` and lowers through `strAccAppendTail`, whose global
arm writes the accumulator's module binding.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile start functions covered (138) | 0 | 135 |
| self-compile start first-miss `string accumulator` | 138 | 0 |
| self-compile functions covered (19,042) | 14,669 | 14,669 |
| corpus functions covered (45,678) | 35,249 | 35,249 |

All covered starts verified and matched (shadow mode 1); a start with a `while` accumulator is
claimed in mode 3 and ships legacy's bytes. `ir-identity.sh --names` against master's seed:
identical 9,037, differ 0, self-compile identical; `--cases`: identical 7,514, differ 0. L2 fuel
+0.9% on the shared baseline. Compiler lines: 0 net (2 added, 2 deleted).
