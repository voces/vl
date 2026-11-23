# IR coverage, batch D: a cached closure environment's own captures (2026-11-23, lane IR-N7)

| Mechanism | Change | tests/cases blocker class, functions (any / alone), before → after |
|---|---|---|
| cached environment's own capture | `cloEnvOf` reads this frame's own capture as a temp inside a cached environment's slot test, as `emitClosureEnvOf` does, instead of refusing it | `closure env cache copy` 24 / 24 → 0 / 0 |

The batch also held a closure element in a `for` walk, which #9682 landed first, and a capturing
`.map`/`.filter` callback, which lane N1 carries (coordinator ruling). Both are master's or N1's.

## Measured

Fixpoint seeds: master 53f48d792 and the batch head.
- tests/cases functions with no blocker: 78,790 → 78,814; covered = verified = matched (one
  unmatched function is the same on both sides).
- `ir-only-census`: programs fully IR-only, 5,574 → 5,576 of 7,136.
- L2 self-compile fuel: -0.00% on the base. Late demands 9 / 9; late tags 307 / 307.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `cloEnvOf` | `emitClosureEnvOf` |
| `irEnvCached` (unchanged, shared reader) | `emitEnvCacheOpen`'s slot test |

## Legacy tails the IR calls

None new. `emitEnvCacheOpen` / `emitEnvCacheClose` and `emitClosureIds` are already called by `makeClo`.

## Still open

- `capture binding`, 19 functions alone, in seven shapes.
- `captured call argument coercion`, 15 functions alone.
