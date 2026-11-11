# Step 7 L6: a closure signature's tag slot is keyed by its type, and its render is the slot's name, 2026-11-11

Cut order item 6 (`2026-11-11-step7-union-registry-census.md`): the union-name renders stop
being keys and keep their product as a display name. This PR does that for `cloSigNameOfTy`.

A bare function-typed union arm tags by the slot its signature interns at in the
closure-signature table (`cloSigTagSlot`). The slot was keyed by the signature's render,
`tyToEmitName`. It is now keyed by the type's canonical id (`repCanonId`). The render is kept
beside it in `cloSigTagNames`, as the slot's name for the link (`emit_link`) and the relocation
key (`emit_reloc_keys`), and `cloSigNameOfTy` still spells the atom in a value union's name.

The base is master `069de8a3`.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, compared the two
partitions at every `cloArmTagOfTy` call. It read every `tests/cases` file and every distilled
`cells/` cell (9,202):

| | notes | programs |
| --- | --- | --- |
| one canonical id under two renders | 32 | 1 |
| one render over two canonical ids | 0 | 0 |

The one program is `closures/closure-result-union-anon-elem-grid.vl`. One function type is
spelled with its result union's members in two orders, `(i32)=>{f:boolean}[]|{w:i32}` and
`(i32)=>{w:i32}|{f:boolean}[]`, so it claimed two slots, and so two tags for one type. Keyed by
type it claims one. This is the member-order class the census records: member order carries
nothing about a type.

## Changed

- `cloSigTagSlotOfTy` (`emit_union_atoms.vl`) replaces `cloSigTagSlot`. It finds the slot by
  `cloSigTagIds`, a new column parallel to `cloSigTagNames` (`emit_state.vl`) that is reset with
  it.

## Proof

- **Bytes.** Every `tests/cases` file and every distilled `cells/` cell (9,202) was built with a
  master L1 seed and with this candidate's L1 seed. 9,201 are the same. The one mover is the
  program above. Its bytes change (one closure slot fewer), and its output is the same on both
  sides (6 of 6 lines). CI's sweep grades the whole population.
- **Locally:** one refresh, lint-self, rep-fuzz, distilled `regress.vl`, seed-size,
  late-demands, the dead-export and render-parse budgets, `cases_wasm`, and the emitter-state audit.
