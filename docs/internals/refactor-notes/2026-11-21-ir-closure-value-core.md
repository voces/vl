# IR: a function value on legacy's inert or alias-core arm, 2026-11-21

Lane IR-N4. This is the coordinator's "`Map()`/closure global initializer cells" step. As built,
it is the closure half: `closure value inert` and `closure value aliasCore`, the arms
`fnValueArmOf` gives a function name read as a value that nothing calls, or that only an alias
calls.

## The change

- Legacy writes both arms with `emitClosureValueCore`. It writes the same closure as
  `emitClosureValue` (`emitClosureValueOf(cloAdapterCanonOf(fe))`) but checks only
  `closureValueCoreWhy`, not the generic-function refusal.
- `cloValueFeOf` takes the `inert` and `aliasCore` arms beside `checked`. `cloValue` checks the
  refusal of the arm it takes.
- `RMakeClo` gains `mcCore`. The lowering calls `emitClosureValueCore` when it is set and
  `emitClosureValue` otherwise. A captured call's closure keeps `mcCore: false`, so its bytes are
  as before.

Compiler lines +24 / −9. Legacy lines deleted: 0. The shadow row
`tests/ir-shadow-rows/closure-value-core-arm.vl` has covered and matched floors of 3, and no
`closure value inert` or `aliasCore` row.

## The `Map()` half: not in this PR

Dropping `mapNewInit`'s node-type test moves 23 of the 35 `Map()` cells off
`global initializer coercion`. None of their start bodies builds; each then stops at another miss:

| next miss | cells |
| --- | ---: |
| `global read coercion` | 10 |
| `map get rep` | 5 |
| others | 8 |

Across the 665 `tests/cases` files with a `Map()`/`Set()` global, no start body that matches
reaches the relaxed test. It would ship unwitnessed, so it waits for the binding-vs-storage rep
pair (D14426), which `global read coercion` also needs.

## Readings (base and candidate are fixpoint seeds; merge-base `4b5d638e`)

| reading | base | this PR |
| --- | ---: | ---: |
| self-compile covered = matched / claimed | 19,395 / 19,282 | 19,395 / 19,282 |
| corpus functions with no blocker (covered = matched) | 43,944 | 43,955 (+11) |
| corpus claims | 43,805 | 43,816 |
| `tests/cases` armed shadow covered / matched | 61,021 / 61,020 | 61,099 / 61,098 |
| `tests/cases` start covered / matched | 4,264 / 4,263 | 4,291 / 4,290 |
| `tests/cases` `closure value inert` + `aliasCore` rows (functions) | 128 + 75, start 89 + 7 | 0 |
| `tests/cases` fail or mismatch rows | 3 | 3, the same list |
| L2 self-compile fuel | 105,397,418,158 | 105,400,152,645 (+0.003%) |

Byte identity:
- Mode 3 and mode 5 self-builds equal the plain build, and the self-compile is identical under
  both seeds.
- `ir-identity.sh --names`: 9037 identical, 0 differ.
- `--cases`: 7580 identical, 0 differ.
- `--claimless`: 14014 identical, 3267 fail under both, 0 differ.
- tests/cases A/B: 7294 identical, 0 differ.

Late tag rows: 307, the baseline.
