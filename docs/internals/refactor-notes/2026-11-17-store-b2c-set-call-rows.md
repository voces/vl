# B2c: instance-vector rows for calls through a function set, 2026-11-17

Lane STORE, stage B2c of storage per (KeyId, parameter), on B2b (#8970). The coordinator ruled on
2026-11-17:
- STORE owns `instVecAt` for this change;
- B2c is the set-call rows, shadowed against the elaboration's instance rows;
- B2d is the written-slot and field joins;
- lambda members go to B3;
- the shadow's expected set is whatever the ablation finds.

## What changes

- **`check_bind_rows.vl`.** A new row kind `IV_SET_CALL`: `ix` is a call through a function set, and
  `sub` is the member the call hands its arguments to.
- **`check_arrow_facts.vl` `arrowSetCallRows`**, run first in `arrowFactsBuild`. For each call the check
  recorded through a set (`fnTagCalls`), and each named member, it notes a row. The member's holes,
  and its bare type parameters, are bound at the argument nodes' types, which keep a set's identity.
  A call gets rows only when some argument holds a set and every set an argument holds has named
  members only: a lambda is built as a closure where it is delivered, which is B3's.
- **What reads the rows.** B0's storage rows and B2a's row facts read every vector row, so the decision
  sees these instances without change.
- **The shadow** (`check_inst_keys.vl` `ikSetCallRows`, under `$VL_INST_KEYS`). Each set-call row's
  (member, parameter, set) is `expected` when an instance the elaboration made of that member holds
  that set at that parameter, and `extra` otherwise.

## Reading

`$VL_INST_KEYS=1 vl check --codegen tests`, fixpoint seed, on B2b at master `7974bfd7a`.

| | rows | programs |
|---|---|---|
| set-call rows | 277 | 78 |
| expected | 277 | 78 |
| extra | 0 | 0 |

The first build also took calls that hand a set with a lambda member: 397 rows, 359 expected and 38
extra in 7 programs, every extra a lambda member's set. The elaboration closes those at their delivery.

## The ablation that replaces B0's heuristic split

Population: the 83 late rows that had an elaboration instance row and no check row, on B2b. Each was
re-classified by B0's join on this build.

| after the set-call rows | late rows |
|---|---|
| gains a check row | **13** |
| — and leaves the late residue | 1 |
| — complete, one shape (still refused by the holder rules) | 8 |
| — complete, shapes differ (B3) | 1 |
| — the key stays open | 3 |
| still no check row | 70 |

The 13 are B2c's family:
- `hole-fn-list-handed-generic-fn-and-value-at-module` `T {add}` (gone);
- `hole-fn-if-element-list-handed-hole-fn` `N {add}`;
- `hole-lambda-pushed-onto-hole-fn-list-called-at-two-fn-types` `P {cat$…}`, `P {snd$…}`;
- `lambda-list-element-called-at-two-function-types` `P {cat$…}`, `P {snd$…}`;
- `named-generic-to-list-elements-param-keys` `T {mul}`, `T {add}`;
- `hole-fn-from-list-handed-generic-at-two-types` `G {same}`;
- `hole-fn-list-element-handed-generic-beside-uncalled` `T {add}`;
- `hole-fn-list-handed-generic-fn-and-value-indexed-at-two-instances` `T {add}`;
- `hole-fn-list-loop-in-hole-fn-at-two-value-types` `T {add}`;
- `named-generic-to-list-elements-two-keys` `T {add}`.

The 70 left are not closed by a vector row. By the same source heuristic as B0's (a label, not an
ablation):
- 33 are lambda members (B3);
- 13 are written list slots or record fields (B2d);
- 24 are other: lambda callees handed a generic, written-binding joins whose keys disagree, and sets
  handed by a set's members (V).

## Grading (fixpoint seeds both sides, against B2b's)

- `@run` A/B (6,714 programs): 0 wasm movers, 0 output movers.
- `vl check --codegen tests`: output byte-identical apart from the late rows.
- Late tag rows 393 → 392 (`hole-fn-list-handed-generic-fn-and-value-at-module.vl` `T {add}`), written
  from a fixpoint seed, none new; late demands 10.
- `tests/vl_inst_keys_test.ts`: one setcall summary, every row expected. The control fails on B2b's seed.
- L2 self-compile fuel: 96.702G against B2b's 96.632G (+0.07%).
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908). Net compiler lines +161 / −1.
