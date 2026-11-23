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

## Legacy tails the IR calls

- `emitInitProgressAt`, through `irInitProgressHook`.

## Left in `start: global read coercion`

The remaining shapes are each a consumer's own receiver path, not one mechanism:

- `box>record`: a coalesce or member read over a narrowed global, such as `u.r ?? 0` on an
  `i32 | null` field.
- `nullable>nullable`
- `atom>str`
- `box>box` / `box>nullable`
- one-offs
