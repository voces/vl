# B1: the written-binding join at check, shadowed, 2026-11-17

Lane STORE, stage B1 of storage per (KeyId, parameter). DECISIONS 2026-11-17 moves the join of a
written binding to check. It is a shadow until B3, which deletes the elaboration's (`mintSeedNote`).

## What changes

- **`check_set_bind.vl` `setBindWrittenJoin(d, ps, held)`** is the producer. It gives the functions
  written binding `d` holds: each declared function a written value names, plus, for a value reading
  parameter `ps[j]`, the functions `held[j]` gives that parameter in the instance asked about. It
  returns [] when a value is anything else. It is a pure function with no state; B2 calls it from
  the storage decision.
- **`check_inst_keys.vl`**, under `$VL_INST_KEYS`: for each B0 storage row whose parameter seeds a
  written binding, the join is computed with the row's call's arguments. It is merged over the calls
  that share the row's key and compared with the elaboration's `mintSeedWideOfParam`.
  - Verdicts per (key, parameter, binding): `equal`, `differs`, `check-only`, `open` (a value the
    join does not reach), and `unwidened` (the join is the parameter's own set and the elaboration
    took another path, so no storage widens).
  - `seed free` rows name the written bindings no parameter seeds whose join holds two functions or
    more.

## Reading

`$VL_INST_KEYS=1 vl check --codegen tests`, on B0 at master `54733d1ac`, fixpoint seed.

| verdict | joins | programs |
|---|---|---|
| equal | 39 | 18 |
| unwidened | 24 | 8 |
| check-only | 4 | 2 |
| open | 3 | 1 |
| differs | 1 | 1 |
| no parameter seed, two functions or more | 239 | 123 |

- **check-only (4):**
  - `closures/shared-type-param-handed-generic-and-hole-function.vl` `viaLet` gives `{same,dbl}`;
  - `closures/written-let-reassigned-to-other-param-called-at-two-types.vl` `one` gives `{id,dup}`.

  Both are GSP rows of the late residue: generic members, whose join the elaboration reaches by
  another path, not through `mintSeed`.
- **differs (1):** `closures/written-let-seeded-generic-written-hole-param-at-two-types.vl`
  (`take(id)`, `take(tw)`). The check keys the two calls apart and joins `{id}` in each. The
  elaboration's seed row holds `{id,tw}`, because `mintSeed` is not per instance. The check is
  the finer of the two; that is class G's case.
- **open (3):** `closures/joined-record-to-written-param-alias-runs.vl`, where a record value is
  written to the binding. The join reaches named functions and parameters only.

The class S rows (B0: all 7 `open: written`) are among the 39 equal.

**D12230** (an alias of a captured, reassigned binding in a list, called through a hole parameter)
has the join `{inner, other}` at check. The shadow cannot show it, because it runs after emit's
`captureBoxRewrite` has made the binding a capture cell. B2's consumer reads the join at check,
before that rewrite.

## Grading (fixpoint seeds, master `54733d1ac`)

- Unarmed: `vl check --codegen tests` output byte-identical to master's.
- `tests/vl_inst_keys_test.ts`: armed, one seed summary with an equal join. The control fails on
  B0's seed.
- L2 self-compile fuel: 95.802G, +0.07% on B0 and +0.24% on master measured alike.
- Lint clean, phase-state census ok.
