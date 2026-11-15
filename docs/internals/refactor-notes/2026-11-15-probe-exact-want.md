# Capability matrix and probes: a want is the whole output, 2026-11-15

Lane B, from lane N's report: the matrix graded master's `-2147483648` as RUNS against the want
`2147483648`.

## The defect

`matches` (`scripts/lib/probe-grade.vl`), which both `capability-matrix.vl` and
`capability-probes.vl` grade with, accepted:

- a want that was any SUBSTRING of the output;
- `X twice` when `X` was printed only once (it dropped the word and substring-matched);
- extra lines beside the wanted one.

Only `X then Y` was exact. A wrong value that contains the right digits graded RUNS. A cell
whose template wants several lines kept only the last `// want:` line, since each line replaced
the one before. So did my own `call_operands_once` cell, which wanted `A`, `B`, `true`.

A control template whose wants were strict substrings of the output (`-2147483648` for
`2147483648`, one `7` for `7 twice`, `noise` then `true` for `true`) graded RUNS in all 72
graded cells.

## The fix

- `matches` compares every output line whole. `X` means exactly one line, `X twice` the two lines
  `X`, `X`, and `X then Y` the lines in order.
- A cell with a second `// want:` line is an error that says to write `// want: A then B`.
- `tests/vl_capability_matrix_test.ts` gains the control above. It passes with the fix and fails
  without it (`substring/annotated: want WRONG …, got RUNS`).

`check-filed-witnesses.vl` already compared a row's `Want:` block exactly
(`normOutput(stdout) != normOutput(want)`), and is unchanged. The day-one sampler and
`decl-order-ab.vl` grade with no want, so they are unaffected.

## The re-grade

**Matrix.** All 1,344 templates were generated with a stand-in `vl` (`--vl /bin/true --keep`).
That gave 76,702 programs, run with `vl run --batch` on a fixpoint seed of master `68cf81051`.
Of the 70,776 that ran, the old rule graded 70,493 RUNS and the new rule 70,174.

The 319 cells that flip RUNS → WRONG all print the wanted line plus a line the template prints
deliberately: a print in the PRELUDE or SETUP, or one per instance. I read each template, and
every extra line is the correct output. The wants now name the whole output:

| template | cells | want was | want now |
| --- | --- | --- | --- |
| `is-string-literal-at-non-string-instance-generic` | 128 | `0` | `true then 0` |
| `written-fn-binding-copy-two-calls` | 91 | `q` | `r then q then q` |
| `written-fn-binding-copy-litunion` | 46 | `q` | `r then q` |
| `hole-lambda-called-first-at-another-type` | 44 | `4` | `s then 4` |
| `callback-over-built-list` (`filter`/`slice_beside_own_row`) | 4 | `null` | `null then null` |
| `fresh-list-element-into-nullable-field` (`held_list_own_instance_beside`) | 2 | `12` | `1 then 12` |
| `null-unit` (`two_instances`) | 2 | `7` | `7 then 7` (a `WANT2`) |
| `record-eq-fields-stored-apart` (`call_operands_once`) | 2 | `true` | `A then B then true` |

On master `68cf81051` no cell's output merely CONTAINS its want. On the older seed `f211a3f9a`,
before D16390 (#8184), two cells did: `radix-tree-at-f64` `peer_times`, in both faces, printed
`-2147483648` against `2147483648`. That is the cell lane N reported, and it runs on
`68cf81051`. The template's other WRONG cells were WRONG under the old rule too, so they are not
flips.

**Probes.** All 247 probes, graded with the old and the new rule on the same seed: two flip.
Both print a correct second line that their `Should print` header left out. The headers are now
`40 then 4` (`built-container-read-at-own-type.vl`) and `5 twice`
(`hole-param-pinned-from-sibling-block-binding.vl`).
