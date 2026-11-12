# Step 7 L2 §7: `monoPinAnnSpelling` spells by the naming rule, emit_mono's last render, 2026-11-12

`monoPinAnnSpelling` held `emit_mono.vl`'s last `tyToEmitName` call. Replacing it with the naming
rule (`monoPinSpellOf`) floored 4 programs:

- `generic-param-literal-member-is-runs`;
- `literal-test-on-param-joined-with-a-literal`;
- D15170;
- D4203.

All four failed with `literal \`is\` over a union with no recorded members`.

The base is master `d303c9bcd`.

## Why the rule's spelling registered nothing

`monoMakeInstance` registers a pinned parameter's literal-holding union under the spelling
`monoPinAnnSpelling` returns (`monoRegisterValuePin`). For `T | "a" | "b"` at `T = i32`:

- The render softens the literals to their base, giving `i32|string`. That registers by name as a
  value union.
- The rule keeps them, giving `"a"|"b"|i32`. `registerInlineUnionGo` finds no row for that, and no
  type key, and both value-union tests decline. `isValueUnionTyOr` returns 0 because
  `valueUnionVerdict` (`check_ty_rep.vl`) counts a `TyLit` member as no value atom. So the
  instance's union is never registered.

## Changed

- **`valueUnionVerdict`:** when the flattened members hold a string or integer literal beside a
  member that is neither a literal nor null, the literal counts at the kind it boxes at (`string`
  or `i32`). A pure literal union keeps today's verdict, and so does a nullable literal union.
- **`monoPinAnnSpelling`:** spells by `monoPinSpellOf`, and `emit_mono` no longer imports
  `tyToEmitName`.

## Graded

- The 4 programs print their full expected output.
- Seed: fixpoint. `lint-self`: clean. `regress.vl`: no runs lost, 0 → silent.
- Render-parse budget: 12 `tyToEmitName` calls, one below baseline. The baseline is re-written
  centrally.
- Late demands: at baseline.
- `check-filed-witnesses --strict` over both inventories: 4813 as filed, 0 MOVED.
