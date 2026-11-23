# IR-M1: the start body's progress cell, and a boxed nullable global read at its box (2026-11-23, lane IR-M1)

Two mechanisms, one commit each, from the start family the coordinator assigned.

## The read-before-init progress cell (`RInitProgress`)

When a program has a progress cell (`gInitProgIdx`, D2652), legacy's start body calls
`emitInitProgressAt(ord)` after every item of `startMergeOrder`. That covers a global whose
initializer runs elsewhere too. Whenever `gInitProgAfter[ord]` names a guarded global, the call
writes `i32.const <guard>; global.set <cell>`. The item's top-level row is banked after the store,
so the row covers it.

The IR used to refuse every such start body (`progress cell`). Now:

- `startIrOrder` keeps a global whose initializer runs elsewhere, as `-2 - gi`.
- `buildStart` writes a progress store as an `SEffect` of `RInitProgress { ipOrd }` after each
  item where `gInitProgAfter[ord]` is set, before the item's row is noted. `ord` comes from
  `globalStmtOrd` / `startStmtOrd`.
- The lowering calls legacy's own `emitInitProgressAt` through `irInitProgressHook`, which
  `runEmitPasses` installs beside `irStartPrologueHook`. `ir_lower` cannot import `emit_sections`.
- The verifier refuses the Rhs bound to a value (rule 2). Self-tests: `init-progress-as-value`
  (refused) and `init-progress-effect` (holds).

The fragment builder's own `progress cell` refusal is not changed.

## A boxed `T | null` global read at its box core

A union cell (`globalCellKind` "union") holding a boxed nullable (discipline 4) is the `{tag,
payload}` box itself, and its null is one more tag. A read the checker typed at the box inside it
(`nullNarrowArmOf` "plain") is legacy's plain `global.get`, with no `ref.as_non_null`. The IR reads
it as a narrowed read with `ggNn` 0, which the verifier's narrowed arm already admits.

## Readings

tests/cases census, master eeac5bb6 → head, on fixpoint seeds:

| class | master → head |
| --- | --- |
| `start: progress cell` | 31 → 0 |
| `start: global read coercion` | 38 → 25 |
| `global read coercion` | 9 → 7 |
| programs fully IR-only, of 7,114 | 5,288 → 5,297 |

43 functions are newly claimed and none newly missed. Three reach a later miss instead:
`start: print union if` gains 2 and `start: union compare box` gains 1.

## Legacy tails the IR calls

- `emitInitProgressAt`, through `irInitProgressHook`.

## Left in `start: global read coercion`

Parked by the coordinator. After this batch, 32 functions remain (25 start, 7 body). Each shape is
a consumer's own receiver path, not one mechanism:

| cell rep > read rep | start | body | what reads it |
| --- | --- | --- | --- |
| `box>record` | 9 | 3 | a coalesce or member read over a narrowed global, such as `u.r ?? 0` on an `i32 \| null` field |
| `nullable>nullable` | 5 | 0 | |
| `atom>str` | 2 | 3 | |
| `box>box`, `box>nullable` | 4 | 0 | |
| one-offs (`i32>closure`, `str>atom`, `record>record`, …) | 5 | 1 | |
