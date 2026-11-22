# IR: a nullable literal-union compared with a string (nulNiche string operand), 2026-11-22

Lane IR-N4, the self-compile tail. A `==`/`!=` on legacy's `nulNiche` route whose operand is a
literal-union atom (`kindOf(n) != p.from` with `kindOf` returning `K | null`) missed as
`string operand coercion`: legacy decodes the atom to its string (`emitEqOperandRaw`), and the
IR had no node for the decoded nullable string. This was 15 self-compile functions.

## Change

- `eqOperandDecodes` (wasmEmit) is the decision `emitEqOperandRaw` takes; the builder's
  `eqOperandRaw` calls it and delivers the operand at `string` or, for a nullable atom,
  `string | null`. That type is interned once at init as `TY_NUL_STR` (types are not hash-consed,
  so a build-time `mkNullableTy` would mint one per build).
- `nulNicheEqWhy` loses its atom refusal; the string compare now covers it.
- `RNulNicheEq` gains `neR2`: legacy's guard writes the right operand twice. For a non-temp
  variable `neR2` is `neR`; otherwise the operand is built a second time, and only when it is
  effect free (`exprEffectFree`), per the purity ruling. Three self functions whose right operand
  is a call miss as `nullable eq right operand`.

New predicates (R8): `eqOperandDecodes` is legacy's own answer, called by both sides;
`exprEffectFree` is the existing purity query.

Phase state: `cross` in `check_types.vl` 22 → 23 (`TY_NUL_STR`) and `surface` in `ir_build.vl`
8 → 9 (its import), re-baselined in this PR.

The shadow row is `tests/ir-shadow-rows/nullable-atom-eq-string.vl`.

## Readings (base: fixpoint seed at master `56a40ede`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| self-compile `blockers none` | 19,760 | 19,772 |
| self-compile `string operand coercion` | 15 | 0 |
| self-compile `nullable eq right operand` | 0 | 3 |
| self-compile covered = matched | 19,760 | 19,772 |
| armed `tests/cases` covered (matched + 1 pre-existing) | 68,168 | 68,176 |
| corpus covered = verified = matched | 45,028 | 45,034 |
| L2 self-compile fuel per PR | | +0.11% |

The fail and mismatch rows are the same on both seeds. `--names` identity: 9,037 identical,
0 differ, self-compile identical. `ir-identity.sh --cases`: 7,612 identical, 0 differ.
`--claimless`: 14,018 identical, 0 differ. Late demands 9 and late tag rows 307, both unchanged.
Seed size `--check` passes (+2.5%).
