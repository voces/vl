# View indexing from a module global: the descriptor reload, and the post-I8 plan (2026-11-23, lane F1, #9676)

#9676 reported that `x[i]` on a `std:buffer` view is not inlined at `-O3` (1.044 against 0.418
ns/element). On the current seed it is inlined. What remains is a descriptor reload, and fixing
it changes emitted bytes. **Coordinator ruling (2026-11-23): document the spelling now; build
(A) once in the IR after the cutover (I8), with no Q15 legacy change; park (B) with it.** #9676
stays open for this plan.

## What was measured

All rows: `vl build -O3`, the merged tree's fixpoint seed, ns per inner-loop iteration, control
(R=0) subtracted.

P1.4's bench (`bench/buffer-view-bounds/run.sh`, `VB_ONLY` subset, min of 5): `scale-view` 0.757
against `scale-hoist` 0.687; `reduce-view` 0.727 against 0.642; `axpy-view` 0.875 against
`axpy-fencedhoist` 0.886. Their kernel loops hold no `call` and no `struct.get`. The views are
built in `main` and passed down, so §M10's multi-value twins carry them as fields.

aillu's shape: three views in module-level `const`s, a branch-free pass over 4,194,304 cells, 101
passes, min of 9:

| kernel | ns/iter | loop reads (`global.get` / `struct.get`) |
| --- | --- | --- |
| `gview`: views in globals, `f[i] = f[i] + t[i] + o[i]` | 2.18 | 4 / 9 |
| `pview`: the same body in a function taking the three views | 1.75 | 0 / 9 |
| `gscal`: (A)'s hand analogue, `u8base`/`length` in module i32 consts, `getU8At` | 1.01 | 9 / 0 |
| `gat`: `u8base`/`length` hoisted into locals, `getU8At`/`setU8At` | 0.82 | 0 / 0 |
| `graw`: raw intrinsics over hoisted bases (unfenced) | 0.77 | 0 / 0 |

Each kernel loop holds eight `unreachable`s (the fence) and no call; `graw` holds none.

```vl
const terrain = buf.u8view(0, N)
const forage = buf.u8view(N, N)
const owner = buf.u16view(N * 2, N)
function pass() {
  let i = 0
  while i < terrain.length {
    forage[i] = forage[i] + terrain[i] + owner[i]
    i = i + 1
  }
}
```

## Refuted routes, no codegen change

- **wasm-opt flags.** Tried on the `-O3` output: `--flatten --licm -O3`,
  `--flatten --simplify-locals-nonesting --licm -O3`, `--precompute-propagate --licm -O3 --gufa -O3`,
  `--simplify-globals-optimizing --gufa-optimizing -O3`, `-O4 --gufa -O4`, and
  `--type-refining --gufa-cast-all -O3 --flatten --licm -O3`. Each leaves 8 to 9 `struct.get`
  in the loop.
- **Why the flags fail.** Binaryen's LICM moves only top-level loop statements. These reads sit
  in the loop condition and inside the fence's `if`s, and a `struct.get` on a nullable reference
  may trap.
- **`--traps-never-happen`.** It would allow the move, and would also delete the fence's
  `unreachable`s.
- **The std accessor's shape.** The reload happens at each inlined call site, which the callee
  cannot see.

## The plan, after I8

- **(A) Scalar-replace a view-typed module `const`.**
  - Applies to a module-level `const` whose type is a `new` record that no `struct.set` names.
    It gets one i32 global per field, set from §M10's multi-value constructor twin.
  - A use passes the fields to the field-taking accessor twins.
  - Measured by hand (`gscal`): 2.18 → 1.01, about 85% of the gap to `gat`.
  - The remaining `global.get`s stay inside the fence for the same LICM reason.
- **(B) A preheader copy.** For a loop whose body writes none of those globals, copy them into
  locals before the loop. That takes the rest (≈ `gat`). It needs a purity fact about the
  bracket functions before wasm-opt inlines them, so it waits for an owner.

Both change emitted bytes for every program holding a view in a module global. Built in the IR
after the cutover, there is one emitter to change and no legacy byte A/B to match.
