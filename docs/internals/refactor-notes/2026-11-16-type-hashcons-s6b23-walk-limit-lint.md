# Type hash-cons stage 6b: the `walk-limit` lint and its ratchet (lane HASH), 2026-11-16

The s6b21 census counted the compiler's numeric walk limits. This rule stops new ones from arriving while
the conversions run (coordinator ruling, 2026-11-16).

`walk-limit` (`compiler/lint.vl`, INTERNAL, `compiler/` only) flags a walk counter compared with a fixed
bound:

- **Counters:** a `depth…` or `budget…` name; `hop`, `hops`, `guard`, `steps`, `rounds`, `tries`, `iters`
  or `fuel`; or `.length` of a walk list (`path`, `seen`, `visiting`, `visited`, `rev`, `steps`, `work`,
  `stack`, `chain`, `walk`, `suffix`, `tsuf`, `trail`).
- **Bounds:** a literal from 3 to 1000 or an upper-case constant, after `<`, `<=`, `>` or `>=`. A
  countdown's own floor, `depth <= 0` or `depth < 1`, also counts.

It skips the two shapes the census found to be no limit:

- **Mode flags:** a literal over 1000 selects a code path.
- **Sentinel exits:** the same function assigns the counter its bound (`hops = 16`) to end its loop.

On master `12121cdbe` it flags 558 sites, the census's count of real limits. The ratchet is
`scripts/walk-limit-budget-baseline.json` (`vl check --budget`, targets `compiler/entry.vl`), written at
558. The count may only fall, and a PR that converts a limit lowers it in the same change.

## Checks

- The sentinel at `elabMintCalleeIn` and the mode flag in `tyHasTyVarGo` are not flagged.
- `tests/vl_lint_rule_scope_test.ts`'s fixture trips the rule under `compiler/` and nowhere else.
- `scripts/lint-self.sh` runs the budget: `walk-limit budget ok — 558`.
