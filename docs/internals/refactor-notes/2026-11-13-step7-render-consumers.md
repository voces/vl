# Step 7, lane H: each render's consumer, reach and witness, 2026-11-13

Lane I grades the census's 101 `ty-render` calls by what the rendered string
feeds: a decision or a re-parse, a dictionary key, a label or diagnostic, or
nothing (unreached). This adds the columns that triage reads to
`docs/internals/render-parse-sites.md`, one row per render.

## The change

- **`render-parse-census.vl --render-sites`** lists each `ty-render` call keyed
  like a parse site: `<file>\t<fn>\t<renderer>\t<ordinal>`, then line and
  column.
- **`render-parse-origins.ts`** wraps each listed call's result in `hpR(k, …)`
  in its probe compiler, beside the parse sites' `hpS`. It counts the programs
  that reach the call during emit and keeps one witness program and one rendered
  value.
- **The consumer is read from the source, one hop.** It is what the result flows
  into: a key (an index, or a `get`/`set`/`has`/`delete` argument), a column
  push, a comparison, the string itself scanned (`raw[i]`, `.slice`), a call
  argument, a return or a block's tail value, a concatenation, a store, or a
  value nothing reads. A string bound to a name lists that name's uses, up to
  three, and a reassignment of the name is not a use.
- **`keyed`** is yes for a key. A call argument is followed into the callee: the
  parameter at that position is classified the same way in the callee's body,
  through up to four callees, so a render handed to `rlInternNameTy` reads
  `yes, via rlInternNameTy`. A column push reads `push` and a comparison reads
  `compare`.

## What it reports (master `e227bd69` plus #7771, 24,212 programs)

| keyed                                                | renders |
| ---------------------------------------------------- | ------- |
| yes (through a callee; no render is itself an index) | 5       |
| push                                                 | 5       |
| compare                                              | 27      |
| no                                                   | 64      |

38 renders are returned or are a block's value, so their consumer is the caller.
This column stops there: grading one follows the function's callers, which the
table names by function. Six renders are unreached (0 programs):
`arrLitElemName` (emit_classify:6909), `memReadBoxNarrowName`,
`fieldTypeRefusalMsg`, `nulNicheIsTestImpossible`, `mapSoftTwinTagFail` and
`emitMapUnionPayloadTail`.

## Controls

`tests/vl_render_parse_budget_test.ts` checks `--render-sites` against the
fixture's four render calls, including a second call to the same renderer in one
function, which gets ordinal 1. With master's census the check fails: the flag
is unknown, rc 2. With this census it passes.

The origins file is not regenerated here, per the fold rule. The sites table is,
because the new section is this change's output.
