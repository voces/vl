# Step 7: `exprIsLitAtom` answers a `??` by its join's rep, a minted chain link by its chain's, 2026-11-10

Group 6 of `2026-11-09-step7-classifiers-remaining.md`, after #7067
(`2026-11-10-step7-lit-atom-joins.md`). That PR found `exprIsLitAtom`'s `??` arms could not
move to the join's rep: arm B lost `literal-unions/hole-map-read-coalesce-chain-nullable-atom.vl`.
It named the missing fact as the emitter's coalesce lowering. Base is master `34f46a82` (#7076),
whose fixpoint seed is 6,598,974 bytes. Counts are over the 23,842-program sweep population.

## The shadow

A scratch compiler built by the base seed compared each `??` answer of `exprIsLitAtom` with the
join's rep, `nodeRepIsAtom` or `nodeRepIsNulAtom`. 4,684 calls reach a `??`. All but 17 agree.
Those 17 split into two kinds:

| node | answer | rep | calls | files |
| --- | --- | --- | --- | --- |
| the inner link `b ?? d` the emitter mints re-associating `a ?? b ?? d`, untyped | atom (`coalesceLitUnionFits`) | none | 13 | 4 |
| D3172's `e ?? "b"` over `K \| null \| i32` narrowed off `i32` | not an atom | atom | 4 | 1 |

The 13 are in `generics/chained-coalesce-hole-map-atom.vl`,
`literal-unions/hole-map-read-coalesce-chain-nullable-atom.vl`,
`literal-unions/nullable-litunion-coalesce.vl` and D3424. `emitCoalesceGo` mints the link with
pos -1. It carries the chain's type onto the link only when the default already has it, so here
the link has no type and no rep. D3172 is an emit reject, and the emitter rejects the `??` either
way.

No disagreement is on a retyped-dead `??` or on a fused map read, apart from those minted links.

## The missing fact, recorded where it is computed

`emitCoalesceGo` re-associates `(a ?? b) ?? d` as `a ?? (b ?? d)`, and the link `b ?? d` becomes
the outer link's default. The minted link is null exactly when the chain is, since the chain is
`a`'s non-null value or the link. It is built into the chain's cell. So the emitter records the
pair at the mint, `coalLinkChains[link] = chain` (emit_state.vl). A typed reader of the link asks
the chain's rep. No type is recorded.

## Switched

`exprIsLitAtom` answers a `??` as an atom where its join reps as the atom or the nullable atom,
reading the chain for a minted link. These go:

* the top-level `coalesceLitUnionFits` claim;
* the retyped-dead delegation to the operand;
* the fused map read's value-type and foreign-default test.

Every arm now reads a typed fact or the emitter's storage, so the probe goes and the name joins
`NOT_BLIND` in `scripts/classifier-census.vl`.

**The record is load-bearing.** The same candidate without the chain lookup makes both chain
fixtures above emit rejects: "`??` over an atom-valued map needs a member-literal (or atom)
default". With it, both print their `@log`.

## Census (`classifier-census.vl`)

| tree | probed | calls |
| --- | --- | --- |
| base `34f46a82` | 10 | 2,288,406 |
| this PR | 9 | 860,153 |

`exprIsLitAtom` (1,243,582) leaves the probe set. The dropped arms were askers of two others:
`mapReadMvSlot` goes from 709,846 to 606,757, and `unionNameOfHoleRead` from 161,870 to 80,290.

**Proof.** The fixpoint seed is 6,599,098 bytes (+124). Two `refresh-compiler.sh` runs are
byte-identical, and the one-level candidate equals the fixpoint.

* Sweep against the base's fixpoint: 23,842 same, 0 movers.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* The dead-export budget: 0, the baseline.
* `cases_wasm` shards 0–3: 7,405 passed.
* The inventory rows and refs tests, `vl_scaling_shape_test.ts`, `vl_cls_census_test.ts` and
  `vl_probe_rollback_test.ts`: 106 passed.
* `check-filed-witnesses --strict`: 4,689 as filed, 0 output mismatches.

`vl_cls_census_test.ts` wanted an `exprIsLitAtom` row by name, and every lane that removes a probe
has had to re-pin it. It now compiles three programs that reach the classifiers still probed. It
wants every armed row to name one that `emit_classify.vl` probes, and once none is probed it wants
no row at all, which is step 7's done criterion.
