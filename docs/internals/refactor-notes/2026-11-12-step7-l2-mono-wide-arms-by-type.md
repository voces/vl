# Step 7 L2: a narrowed pin's niche and nullable-record rungs read the wide pin's arms from its type, 2026-11-12

Lane G's typed union key has landed: `unionTyArms(ty, atoms, tys)`. With it, the three
`emit_mono` callers of `unionArmsOf`, which splits the wide pin's spelling into registry arms, can
read the wide pin's type `wTy` instead. `monoArgPinName` threads `wTy` into `monoNarrowedPinName`
(#7606).

## Measured

A scratch probe held a typed twin beside each spelling test and counted decisions over 24,070
programs. It was never seeded.

| test | twin | agree | differ | no type (spelling "yes") |
| --- | --- | --- | --- | --- |
| `monoNicheNarrowsFrom` → `monoArmsNarrowFrom` | the niche's `unionTyArms` atoms are a proper subset of `wTy`'s | 14,949 | 0 | 135 (0) |
| nullable-record rung: `monoArmCount(wide) <= 2` | `monoTyArmCount(wTy) <= 2` | 140 | 0 | 0 |
| nullable-record rung: `monoWideArmsHoldBrace(wide)` | `monoTyMentionsBrace(wTy, true)` | 152 | 0 | 0 |
| list-of-records rung: `monoWideArmsHoldBrace(wide)` | the same | 203 | 3 | 100 (82) |
| record rung: `strContains(wide, "{")` | `monoTyMentionsBrace(wTy, false)` | 1,360 | 172 | 39 (23) |

The first three rows convert in this PR. The last two do not, for two reasons:

- in 82 and 23 decisions the wide pin has no type, yet its spelling held a brace;
- the typed twin disagrees in 175 decisions.

Both are guards from D2780 and D9330. They ask whether a record's brace render could equal an arm
of `wide`. The membership test they guarded reads the type since #7606. So they look like guards
for a test that no longer compares spellings. The next step is a loud floor and a sweep to
retire them, not a twin.

The probe reports through `emitFail` and cannot see programs that already refuse. CI's sweep
covers those.

## Changed

- **`monoNicheNarrowsFrom(narrowTy, wTy)`** reads both types' arms through `unionTyArms`. The
  spelling arguments are gone, and so is `monoArmsNarrowFrom`.
- **`monoTyArmCount(ty)`** counts the keyed arms, else the flattened variants. `monoArmCount` is
  deleted.
- **`monoTyMentionsBrace(ty, top)`** is a `_`-less match over `Ty`. It answers whether the
  type's spelling holds a brace:
  - an inline record or a map, anywhere through lists, nullables, unions and signatures;
  - a declared record or a declared union below the top spells its name, so it holds none.

  The nullable-record rung uses it.
- The `unionArmsOfTy` import goes.

## Counts

- `unionArmsOf` in `emit_mono.vl`: 3 → 1. The one left is the list-of-records guard in
  `monoWideArmsHoldBrace`, named above.
- pin-helper: 910, unchanged. Two functions are deleted and two added.
- `emit_mono.vl` spelling reads: 7 → 5.

## Proof

- **Locally, on master:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.8%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,859 as filed.
- **The sweep** is CI's (`sweep` label).
