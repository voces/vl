# Step 7 L2 §7: an `#anon` binding is re-spelled by its fields under the naming rule (renders 22 → 21), 2026-11-12

`monoSubstAnonShapes` re-spells each `#anon` handle in an instance's `tvV` binding as its
record's shape, so that a substituted annotation names a shape the body can test. The site was a
floor in `2026-11-11-step7-l2-mono-last-pin-renders-by-rule.md`. Taking `monoPinSpellShaped`
there lost `generics/generic-is-over-anonymous-record-pin.vl` to a compiler trap.

The cause: the naming rule spells a record that has a row by that row's name. For an anonymous
record, that name is the `#anon` handle the site is trying to replace. So the substitution kept
the handle, and the `is` over `T | i32` trapped.

The base is master `a33a4dde`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,943 programs.

## Changed

- `monoPinSpellFields(ty)` (`pin_spell.vl`) spells a record by its fields whether it has a row or
  not. Its parts are spelled by `monoPinSpellShaped`. Any other type is spelled as
  `monoPinSpellShaped` spells it.
- The field walk is one function, `monoPinSpellObjFields`. The rule's no-row arm shares it.
- `monoSubstAnonShapes` calls `monoPinSpellFields`, and its `tyToEmitName` is deleted. Its losing
  cell runs again.

## Floors left in emit_mono

| site | floor | losing cells |
| --- | --- | --- |
| `monoPinAnnSpelling` | the literal-`is` union reader keys a box by the render's spelling: an alias kept by name (`i32\|AB`), a lone string literal widened (`i32\|string`) | D15170, D4203, `generics/literal-test-on-param-joined-with-a-literal.vl`, `unions/generic-param-literal-member-is-runs.vl` |
| `monoPinUnionNameOfTy` | an instance-only `??` union row (#7278) is read back under the render's spelling, which names the record member by its `#anon` row. The rule names that row by its first declared record (`J`). | D15713 (invalid module: expected `#anon1`, found `J`) |

The second floor is a record-identity question: which name an anonymous row and a declared record
sharing it go by. That question is Family B's (w319).

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 23,943, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **render-parse** goes from 22 / 58 to 21 / 58, with `--write-baseline` (`--findings`) in this PR.
- **Locally:** refresh to a fixpoint, lint-self, and dead exports 0. The other gates are listed in
  the PR.
