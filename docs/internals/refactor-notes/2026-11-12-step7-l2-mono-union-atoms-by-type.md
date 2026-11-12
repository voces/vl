# Step 7 L2: emit_mono's last union-spelling splits ask the type; an unreached rung is deleted, 2026-11-12

Lane G handed this lane three `emit_mono` callers of `unionSetAtomsOf`, the union registry's text
split. Cut 4 (#7633) converted `monoPinUnionName`. This cut converts the other two:

- **`monoPinMintedUnion`'s `pcAtoms`:** whether a list element union's canon name `pc` splits
  into fewer than two atoms. When it does, the pin is not a union list.
- **`monoSubstLetType`'s `subAtoms`:** whether the registered spelling of a substituted `let`
  annotation splits into two atoms or more. When it does, it is typed by its spelling.

Both now ask `monoPinCanonIsUnion(ty)`: does `monoPinCanonKind` answer 1, with no declared alias
(`unionAliasDeclNameOfTy`) and no literal-union alias (`litUnionAliasNameOfTy`)? The alias test
is needed because `canonEmitName` names an aliased union by its alias, and the text split counts a
declared name as one atom.

## Measured

A scratch probe compared each twin with the spelling's answer, counting decisions over 24,070
programs. It was built on cut 4's tree and never seeded.

| site | twin | agree | differ |
| --- | --- | --- | --- |
| `pcAtoms` | canon kind 0 only | 215 | 137 (48 programs: literal-union elements canon'd to their alias) |
| `pcAtoms` | canon kind 0, or a literal-union alias | 318 | 34 (13) |
| `pcAtoms` | canon kind 0, or a declared alias, with or without the literal-union test | 351 | 1, `std/array-mapindexed-litunion-result.vl` (module byte-identical) |
| `subAtoms` | canon kind 1 | 1,182 | 1, `generics/for-in-var-callee-result-stored-at-pin.vl` (module byte-identical) |
| `subAtoms` | canon kind 1 and no alias (this cut) | 1,183 | 0 |

The cut's helper is the last two rows' predicate, negated for `pcAtoms`. `pcAtoms`'s element is a
union or nullable, so canon kind 2 cannot arise there.

This probe has the same blind spot as cut 4's: a program that already refuses reports nothing.
CI's sweep covers the refusal fixtures.

## The unreached rung (coordinator ruling)

The famb struct-name note's "nullable-receiver rung" (`structIndexByName(structNameOfTy(t))`) was
already gone in #7615. The rung left unreached in `monoArgTyNameProjected` is the nullable record
field's pin: `fnm + "|null"`, from D3301.

The ruling was a loud floor and a sweep. The same probe compiler put
`emitFail("MPROBE-FLOOR …")` where the rung returns. **It fired in 0 of 24,070 programs.** The
rung is deleted, with `monoFieldDeclNullable`, which only it called.

## Counts

- `unionSetAtomsOf` in `emit_mono.vl`: 2 → 0. That was lane G's last caller in this file.
- `emit_mono.vl` spelling reads: 16 → 14.
- Functions: `monoFieldDeclNullable` deleted, `monoPinCanonIsUnion` added, so pin-helper is
  unchanged.
- Imports gone: `unionSetAtomsOf`, `nodeTyIsNullableStruct`, `sFieldElemTyIxAt`.

## Proof

- **Locally, on master after #7633:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - late demands 8;
  - kind-ladder 0;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict` as filed.
- **Byte-identical modules** for the four programs where a probe saw a difference, and both D15540
  refusal fixtures keep their message.
- **The sweep** is CI's (`sweep` label).
