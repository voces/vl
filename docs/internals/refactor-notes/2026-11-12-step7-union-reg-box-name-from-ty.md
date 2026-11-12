# Step 7 L6 (step C3a): a union box's name comes from its type wherever the type gives one, 2026-11-12

Step C's third cut, after C1 (#7430, the row a type keys to) and C2 (#7437, a let binding's
type). `boxDstName` now also names a value union no row keys by its type: its key text
(`valueUnionKeyTextOfTy`), else its member-order spelling (`unionSpellingOfTy`), when that is a
value union. A value atom's box tag is global per atom kind (`scalarTagOfKind`), so the
spelling's member order is no part of the box. The caller's name is used only where the type
gives neither. This is the precondition for C3b, which stops the callers that hold a type from
deriving a name for the box.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, compared each typed
`emitUnionBoxArg` entry's caller name with the name the type alone derives. It read every
`tests/cases` file and distilled `cells/` cell (9,202):

| | entries | programs |
| --- | --- | --- |
| equal | 31,292 | 2,814 |
| the same row under another spelling | 55 | 20 |
| different (C1's renames, and one value union in another member order) | 24 | 8 |
| underivable | 0 | 0 |
| no type | 2 | 1 |

Before the value-union fallback, 295 entries (45 programs) were underivable. These were nullable
value unions (`i32|null`, `i64|null`, `i32|string|null`), whose key text is empty for a
`TyNullable`.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `b0219f45`:

  ```
  same                            23997
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
