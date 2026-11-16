# One storage decider: the first class moves to the check, 2026-11-16

Lane STORE. The check's tag decision (`fnTagDecide`) now tries the sets that its own set-binding
rows find a call through (`setBindTrySets`, `check_set_bind.vl`). Before this, those sets reached a
decision only through the elaboration's mint rows in `fnTagRedecide`. The bar is the one recorded
in `2026-11-16-store-set-bind-shared-ty-params.md`: no check-only set among those this class adds,
0 runs→not-runs, and no new trap.

No branch of `fnTagRedecide` is deleted yet. It still decides the sets this class leaves to it, so
it stays as their decider.

## What the check tries

Each set that a call through a parameter, or a path from one, reaches, except where an instance may
bind the place otherwise. Each exclusion is the cause of a regression in a prototype without it.

| left to the late decision | why | what the prototype without it did |
|---|---|---|
| a set with a generic member | the instance types the call at the member's closed signature, a closure (`elabMintFactAt` sees a `TyFunc`, not a set) | 5 more programs whose check tag the late pass drops |
| a set reaching a parameter stored into a written `let` or by `=` | the written binding joins sets; a check tag changes that join's check-time consumers | 6 runs→not-runs (`written-let-seeded-by-hole-param-*`, `closed-fn-handed-to-param-written-to-let-*`) |
| a set handed to a set's members by a call through a parameter, and the set handing it | tagging the higher-order set early stops the late pass from tagging the set it hands | 1 runs→not-runs (`hole-fn-choices-handed-a-set-at-two-instances`) |
| a partial set: some place it reaches is also reached by another set, by a value of no set, by a parameter holding a closure, or by an escaping parameter | the late decision refuses it from `mintSetPartial`, which reads instances | `{h}`, `{inc0}`, `{mul}` tagged where master never tags them (wasm-only movers) |

**A producer source the switch exposed:** a call through a local `const` alias of a declared
function, `const k = apply2; k(mul)`. It hands its arguments to that function. Without this source,
`{add}` looked like the only set reaching `apply2`'s parameter.

## Measured

The population is 6,513 `@run` programs. An ftlate probe (scratch seed, never refreshed) prints the
check's tag count and the late pass's adds and drops.

| | programs whose decision the late pass changes | late drops of a check tag |
|---|---|---|
| master | 415 | 2 (`*-fn-list-written-then-called`, pre-existing) |
| this PR | **353** | **2** (the same two) |

- **A/B:** wasm and output byte-identical on all 6,513 programs, fixpoint seed against master's own
  fixpoint seed. So the final decision is unchanged in every program. 62 programs now reach it in
  the check rather than after the elaboration.
- **Prototype history:** the generic-member exclusion alone gave 295 and 7 runs→not-runs. Each row
  of the table above came from closing one of those regressions.

## Cost

`setBindBuild` now runs on every compile, once, inside the check's tag decision.
- It scans the arena once for escapes and once for rows.
- The fixpoint over rows is bounded by the row count.
- The per-parameter "lacks a set" and per-set "stored" tables are built in one pass after it.

Self-compile fuel and the scaling-shape test are below.

## What is left

The 353 programs are the next classes. Most sets with a generic member are decided where the
instance binds the member's closure, so that class needs the instance's own view. That is S3's
solver at the call (§4.3). The written-binding and partial classes need the producer's view of
writes and of every binding a place gets.
