# B2b: the written-binding join decided at check, 2026-11-17

Lane STORE, stage B2b of storage per (KeyId, parameter), on B2a (#8965). The ruling (2026-11-17, 2):
the producer is a check-time call note carrying the interned per-key join, and the binding's own type
does not change. `mintSeed` goes at B3.

## What changes

**`check_arrow_facts.vl` `arrowSeedJoins`**, run with the facts:
- **Which bindings.** It takes each written, un-annotated `let` that a parameter initialises and that no
  closure writes. Per recorded call of the binding's function, it computes the join with B1's
  `setBindWrittenJoin`, from the set each parameter is handed.
- **When a binding gets a set.** Only when all of these hold:
  - every call row closes;
  - every call gives the same join of two or more named functions;
  - every call hands the seeding parameter the same set.

  The join is then interned (`fnTagSetOfMembers`, new in `check_elab_cap.vl`).
- **Calls through the binding.** Each is noted through that set (`fnTagCallNote`), with its fact at
  every key's argument types, which must agree. The binding must be read only as a callee, besides its
  own initialiser and writes.
- **What is left as before:**
  - a closed function handed by name keys by its signature, not by identity, so it gives no join;
  - a one-member join adds nothing to the parameter's own set.

**`check_fn_tag.vl`.** During the check, `ftPlan` reads the binding's leaves and the seeding parameter's
set from this table (`arrowSeedBindsOf`, `arrowSeedHeldOf`). After the elaboration it reads
`mintSeedBindsOf` and `mintSeedHeldOf`, as before.

## Ablation

Measured against B2a as late rows gone, new rows, and regressions:

| variant | gone | new rows | regressions |
|---|---|---|---|
| a parameter handed a closed function by name counts as holding it | 16 | 1 | 2 |
| a parameter holds only a set | 11 | 1 | 0 |
| a one-member join counts | 11 | 1 (`N {mul}`) | 0 |
| a join of two or more members only | **10** | **0** | **0** |

- The two regressions in the first variant were `closed-fn-handed-to-param-written-to-let-called-at-two-types`
  and `written-let-seeded-by-hole-param-assigned-closed-fn-param`. In both, the elaboration binds
  the closed function by its signature, so the check's join was not the instance's.
- The `N {mul}` row was `written-let-seeded-by-hole-param-handed-the-written-fn`. The check's note
  through the one-member `{mul}` made the late pass tag a set nothing tagged before.

## Late rows retired (403 → 393, written from a fixpoint seed, none new)

- `closures/shared-type-param-handed-generic-and-hole-function.vl` `GSP {same,dbl}`, `N {same}`
- `closures/written-let-fed-by-two-hole-params-called-at-two-types.vl` `N {add,mul}`, `SP {add}`
- `closures/written-let-seeded-by-hole-param-also-called-directly.vl` `GSP {same}`, `N {add,mul}`,
  `N {same,dbl}`, `SP {add}`
- `closures/written-let-seeded-by-hole-param-written-with-named-fn.vl` `N {add,mul}`, `S {add}`

Class S keeps 6 rows:
- `written-with-same-fn`: a one-member join;
- `handed-through-list-call`: the binding is handed as an argument, not called;
- 4 `GS` or `GSP` rows whose keys give different joins, which is B3's case.

## Grading (fixpoint seeds both sides, against B2a's)

- `@run` A/B (6,705 programs): 0 wasm movers, 0 output movers.
- `vl check --codegen tests`: output byte-identical apart from the late rows.
- L2 self-compile fuel: 96.733G against B2a's 96.618G (+0.12%).
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908). Net compiler lines +280 / −6.
