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
  - a one-member join adds nothing to the parameter's own set;
  - a join with a generic member: each generic member is instanced per call shape, and the seeding
    parameter may also be called at another shape. That is B3's case (D15409).

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
| a join of two or more members only | 10 | 0 | 0, but D15409 (a filed witness) runs → emit reject |
| a join with a generic member left alone | **6** | **0** | **0**, all 5,458 graded witnesses as filed |

- The two regressions in the first variant were `closed-fn-handed-to-param-written-to-let-called-at-two-types`
  and `written-let-seeded-by-hole-param-assigned-closed-fn-param`. In both, the elaboration binds
  the closed function by its signature, so the check's join was not the instance's.
- The `N {mul}` row was `written-let-seeded-by-hole-param-handed-the-written-fn`. The check's note
  through the one-member `{mul}` made the late pass tag a set nothing tagged before.
- D15409 (`one<F>(a: F, c: F, k)`, `let b = a; if k { b = c }`, `b(3)` and `a("x")`, with `id` and
  `dup`): the check tagged the join `{id, dup}`. Mono's pin of `a` then had two function types, so the
  emit refused. The `@run` corpus had no such program; the inventory witness caught it at the gate.
  `check-filed-witnesses.vl --strict` over both inventories now runs before every READY. As a
  control, the unfixed seed moves exactly D15409.

## Late rows retired (403 → 397, written from a fixpoint seed, none new)

- `closures/written-let-fed-by-two-hole-params-called-at-two-types.vl` `N {add,mul}`, `SP {add}`
- `closures/written-let-seeded-by-hole-param-also-called-directly.vl` `N {add,mul}`, `SP {add}`
- `closures/written-let-seeded-by-hole-param-written-with-named-fn.vl` `N {add,mul}`, `S {add}`

The four rows with a generic member that the first version moved stay, as B3's:
`shared-type-param-handed-generic-and-hole-function` `GSP {same,dbl}` and `N {same}`, and
`written-let-seeded-by-hole-param-also-called-directly` `GSP {same}` and `N {same,dbl}`.

21 rows still carry the S letter:
- **pure S (2):**
  - `written-let-seeded-by-hole-param-written-with-same-fn`, a one-member join;
  - `written-let-seeded-by-hole-param-handed-through-list-call`, where the binding is handed as an
    argument, not called.
- **SP (2):**
  - `closed-fn-handed-to-param-written-to-let-called-at-two-types`, a closed function handed by name;
  - `forwarded-hole-fn-to-list-element-value-param`, where the parameter is forwarded through a list
    literal.
- **with G (17):** generic members whose keys give different joins or call shapes. These are B3's.

## Grading (fixpoint seeds both sides, master `7974bfd7a`)

- `@run` A/B (6,714 programs): 0 wasm movers, 0 output movers.
- `vl check --codegen tests`: output byte-identical apart from the late rows.
- `check-filed-witnesses.vl --strict` over both inventories: 5,458 graded, all as filed, 0 moved,
  3,422 checked against their Want output, 0 mismatched.
- L2 self-compile fuel: 96.640G against master's 96.505G measured alike (+0.14%).
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908). Net compiler lines +291 / −6.
