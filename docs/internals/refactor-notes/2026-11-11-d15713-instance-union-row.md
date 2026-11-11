# D15713, registry half: a `??` that is a union only at an instance gets its row, 2026-11-11

D15713 (w320's row, on #7200's branch; unfiled: D15713 until that row lands) is check-clean
invalid wasm:

    type J = { f: i32 | null }
    const m = Map()
    m.set("a", { f: 4 })
    function pick(d) { (m.get("z") ?? d).f }
    const j: J = { f: 2 }
    print(pick(j) ?? 0)

At the instance `pick` at `J`, the `??` is `{f: i32} | J`. The template's type is `{f: i32}`,
because the hole is seeded from the left side, so it has no type variable. #7228 (w321) made the
three `??` result readers ask `nodeTyAt`. This PR, stacked on #7228, is the registry half.

## Changed

- **`monoRegisterElabJoinRows` registers the row of a `??` that is a union only at an
  instance** (`emit_mono.vl`). Before, it registered kept-apart joins over a type parameter
  (`tyIsTpJoinUnion`) and the apart if-joins. A `??` whose template type is no union now goes
  through the same per-instance loop, and so through `monoRegisterPinUnion` when its instance
  type is one.
- **`coalesceResultUnionName` asks the registry with the instance's type**
  (`emit_start_block.vl`). `nodeVariantUnionName` and `nodeRegisteredUnionName` read
  `nodeTyInOf`, the template's type, so `registeredUnionNameOfTy` and `variantUnionNameOfTy` are
  their type-taking bodies. The `??` result asks them with `nodeTyAt`.

## What is left of D15713

With both changes the `??` builds the union box. The module still fails to validate, now one
step later: `pick`'s signature is `(result i32)`, the template's, while at `J` its result
`(…).f` is `i32 | null`, a box. The per-instance signature and the member read on the instance
union are per-instance node-type readers, the elaboration's and the monomorphizer's, not the
registry's. The row stays open, and its witness is check-clean invalid wasm before and after,
at a different instruction.

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against #7228:

  ```
  same                            23910
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self (clean), rep-fuzz (exact), distilled `regress.vl`, `cases_wasm`,
  `mono-tyaram-grid.sh` (no bad cells), seed-size (+0.5%), late-demands (6, the baseline), and the
  dead-export and render-parse budgets.
