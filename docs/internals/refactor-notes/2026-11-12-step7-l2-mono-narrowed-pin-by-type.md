# Step 7 L2: a narrowed argument's pin is tested against the wide pin's type, 2026-11-12

`monoNarrowedPinName` asks whether a narrowed argument is an arm of the pin `wide` that the
annotation ladder chose. Until this PR, both helpers that answer it parsed `wide`'s spelling:

- `monoNameNarrowsFrom` used `nullablePartOf(wide) == narrow` and `unionArmsOf(wide)`;
- `monoNulRecNamesNarrow` used `nullablePartOf(wide) == inom`.

These were two of the three type-string parses left in `emit_mono.vl`. Older notes record them
as blocked because `wide` carried no type (the residue's D3, and
`2026-11-10-step7-l2-mono-key-census.md`). That block is gone: `monoArgTyName` now returns the
pin's type through `tyOut`, and `monoArgPinName` already held it as `wTy`.

## Measured

The probe was a scratch compiler, never refreshed into a seed, built on master `cf01f012`. At each
site it evaluated the spelling answer and the typed twin side by side, and it counted decisions
per program; it did not deduplicate them. It ran `vl check --batch --codegen` over the sweep
population (`sweep.vl -- list`, 24,170 programs). 24,070 were recorded.

One chunk of 100 programs did not finish, because D12131's witness exits 70. It exits 70 on the
master seed too. The other 99 programs in that chunk were graded one at a time, and they changed
none of the counts below except the "wide pin has no type" column, by 2.

The typed twin works like this:

- the narrowed type `nt` is a top-level arm of the wide pin's type `wTy`;
- arms come from `flattenVariantsInto`, plus a nullable's whole inner;
- two arms are equal when `tySame` holds and their declared record names
  (`nominalStructNameOfTy`) are equal.

| site | decisions (programs) | both typed, agree | disagree | wide pin has no type |
| --- | --- | --- | --- | --- |
| `monoNameNarrowsFrom`, the main rung | 15,089 (4,869) | 14,954 | 0 | 135 (84); the spelling answered "no" in all |
| the same, the nominal rung | 1,140 (524) | 1,117 | 0 | 23 (14); all "no" |
| the same, the literal-union rung | 411 (179) | 411 | 0 | 0 |
| the same, under `monoNulRecNamesNarrow` | 4 (1) | 4 | 0 | 0 |
| `monoNulRecNamesNarrow`'s own `nullablePartOf` | 224 (38) | 224 | 0 | 0 |

A plain `tySame` with no nominal-name check also agreed everywhere. This PR keeps the nominal
check anyway, because two declared records with the same shape are distinct arms. A side with no
type answers "no member", which is what the spelling answered every time it was reached.

The residue file recorded five files where a typed membership test disagreed, through a sub-union
pin such as `string|null` out of `string|i32|null`. They no longer disagree. That pin answers
"no" on both sides, and `monoNicheNarrowsFrom` is still the rung that claims it.

## Changed

- `monoNameNarrowsFrom(narrow, wide)` is replaced by `monoTyNarrowsFrom(nTy, wTy)`.
- `monoNulRecNamesNarrow` takes `wTy`.
- `monoNarrowedPinName` and its nominal, nullable-record and literal-union rungs take `wTy` from
  `monoArgPinName` (`tyOut[0]` before the rungs rename the answer).
- The `wide` spelling stays in `monoNarrowedPinName` for its brace and arm-count guards
  (`monoWideArmsHoldBrace`, `monoArmCount`) and for `monoNicheNarrowsFrom`. Those read the union
  registry's arms by name, not through a ratcheted parse.

## Left in `emit_mono.vl`

- **`monoNulAnnName`'s `nullablePartOf(name)`** is the last parse. The probe measured its typed
  twin (the type is `TyNullable` and the ladder echoes the rule's spelling of its inner) over
  1,378 decisions in 637 programs:
  - 1,374 agree;
  - 2 decisions in `generics/generic-union-param-litunion-alias-arm.vl` disagree. The type says
    yes for `K|i32|null`, and the spelling, which splits only two-member nullables, says no;
  - 2 decisions in `globals/nullable-record-union-global.vl` have no type. They come through
    `monoNarrowedNulRecPinName`'s `monoAnnPinName(n, -1)`.

  This is the next cut.
- **The annotation ladder `monoAnnPinName(name, ty)`** is the remaining spelling reader. Over 24
  call sites:
  - at every typed call, the ladder answers the rule's spelling of `ty` as it answers the passed
    name (7,778 decisions, 0 disagree);
  - three callers pass -1: `monoNarrowedNominalPinName` (30 decisions), `monoNarrowedNulRecPinName`
    (2) and `monoArgTyNameRep`'s variant names (39).

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - render-parse 12 / 38 at the base; 13 / 36 after merging #7600;
  - pin-helper 911, with the baseline written (it was one stale at 912);
  - late demands 8 (baseline 8);
  - seed size +2.2% (6,735,476 → 6,735,747 bytes);
  - `mono-tyaram-grid.sh` 252 OK, 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict` on both inventories: 4,847 as filed, 0 moved.
- **The sweep** is CI's (`sweep` label).
