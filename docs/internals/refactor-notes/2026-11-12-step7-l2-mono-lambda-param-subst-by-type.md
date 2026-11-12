# Step 7 L2 §7: a cloned lambda's parameter is substituted by type, and its check compares types, 2026-11-12

`2026-11-12-step7-l2-mono-subst-ann-callers-measured.md` (#7351) left `monoSubstAnnNode` on
`monoSubstAnn`. Spelling the substituted type by the naming rule lost the eight `d2567` named
cells. The loss came from the lambda clone's own check in `monoLamSubstParams`. It compared the
elaboration's type spelled (`monoPinNominalSpelling(et)`) with the substituted node's text, so the
rule's spelling of a nullable union read as another type.

The base is master `7d392da3`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,953 programs.

## Probed

The probes ran in scratch compilers that were never refreshed into a seed: #7119's accumulator,
and an `emitFail` marker whose channel was validated earlier in this lane.

| question | reached in | answer |
| --- | --- | --- |
| the check's spelling compare vs `tySame(et, node type)` | 136 | 0 disagreements; the node always has a type |
| `monoSubstAnnNode` with no substituted type, while `monoSubstAnn` still spells one | 0 | never reached |

## Changed

- **`monoLamSubstParams`' check** asks `tySame(et, nodeTyIxOf(nt0))`. The
  `monoPinNominalSpelling` call it read is gone.
- **`monoSubstAnnNode`** builds its TypeRef from the substituted type, spelled by
  `monoPinSpellShaped`. With no substituted type, it answers -2, as an empty substitution did.
  - Its `monoSubstAnn` and `monoDeclAnnName` reads go, and so does the `synthTypeRefFb` branch.
  - The function and `monoLamSubstParams` lose their `tvN` / `tvV` parameters.

`monoSubstAnn` keeps two emit_mono callers, `pinC` and `monoSubstLetType`, plus
`monoSubstAnonShapes` and w321's `is` arm. Their floors are in #7351's note.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 23,953, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Budgets.** render-parse is unchanged (20 / 58 on master).
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0, late demands 6;
  - `mono-tyaram-grid.sh` (252 OK, no BAD), distilled `regress.vl` (no runs lost);
  - `cases_wasm_*`, `vl_pin_spell_shadow` and the pin-helper test (7,459 passed).
