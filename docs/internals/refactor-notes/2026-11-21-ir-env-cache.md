# IR: a nested function's cached environment, 2026-11-21

Lane IR-N6, step 3, stacked on step 2 (`2026-11-21-ir-capture-env.md`). A capturing nested
function declared by statement, not lambda-lifted, keeps its environment in a frame slot. The
slot is emptied where the declaration runs and filled at the first read of the function as a
value in an activation, so two reads compare equal (D7480, `envCacheOpen`). The builder refused
the declaration statement (`nested function env cache`) and the read (`closure env cache`).

## The change

- **One writer per piece, shared with legacy** (`wasmEmit.vl`):
  - `emitEnvCacheDrop(fe)`: the slot's `ref.null` and `local.set` where the declaration runs.
    `emitStmtGo` calls it in place of its inline bytes.
  - `emitEnvCacheOpen(ck)` and `emitEnvCacheClose(ck)`: the slot's `is_null` test around the
    build, then the slot. `emitClosureValueOf` brackets its environment build with them.
  - `envCacheSlotOfFe(fe)`: the slot, or -1 when this frame caches no environment.
- **The statement.** A new right-hand side, `REnvDrop { edFn }`, in the claimed `closure` family
  and in effect position only. Its lowering is `emitEnvCacheDrop`.
- **The read.** `makeClo` brackets the environment build with the open and close where the frame
  caches it. Inside the slot's test every capture must be a variable, so an env-to-env copy, which
  is a temp, misses (`closure env cache copy`). A function kept in a shared cell (D7700) misses at
  `closure env cell`.

Compiler lines +69 / −24 over step 2 (`wasmEmit.vl` +34 −17, `ir_lower.vl` +15, `ir_build.vl`
+10 −3). The shadow row `tests/ir-shadow-rows/closure-env-cached.vl` reads a cached function
twice, through two bindings and as a returned value; all four functions are covered and matched.

## Readings (base: step 2's fixpoint seed; candidate fixpoint)

| reading | step 2 | this step |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 42,116 | 42,329 (+213) |
| `tests/cases` functions with no blocker | 56,483 | 56,902 (+419) |
| self-compile functions with no blocker | 19,061 | 19,166 (+105) |
| `nested function env cache` (any), `tests/cases` / corpus | 223 / 12 | 0 / 0 |
| `closure env` (any), `tests/cases` | 184 | 105 |
| armed `tests/cases` covered = matched + 14 pre-existing (master `cb57cea3` → this step) | 54,784 | 56,902 |
| L2 self-compile fuel (master `cb57cea3` fixpoint → this step) | 104,807,226,717 | 104,961,271,984 (+0.147%, steps 2 and 3) |

The armed `tests/cases` rows that do not match are the same 14 on master's seed and this step's
(`spans: read index`, `effect outside I1`, four verifier rows); none is new.
