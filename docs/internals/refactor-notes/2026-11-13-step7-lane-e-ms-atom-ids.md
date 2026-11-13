# Step 7: a member slice's twin test reads the members' types; `msAtomIdOf` goes, 2026-11-13

Lane E, one of the three sites taken from lane G's non-stray set. Each union member column
(`unMemAtoms`, and the row-less `msFreeAtoms`) carried an interned id of the member's
paren-peeled spelling (`msAtomIdOf`, over a cross-program text table). The ids had one reader:
`msSetCarriesLitUnionArm`, which counts two members of one slice as a pair when their ids match.
Two literal arms on one base form a literal-union arm; any other repeat answers -1.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `580eb218`. At the pair
test it compared the id answer with the members' types, each literal arm read as its base and
compared with `tySame`. It was drained once after `emitProgramRun`, over the sweep's 24,224
programs. A control fired.

- 64,179 compares in 4,138 programs; 817 pairs by spelling.
- Without `armDeclSame` the type test also paired one shape under two declarations (`Cat|Kot`,
  `A|B`, `Boxed|Plain`), which the spellings keep apart. With it, those agree.
- What remains is the D14540 class: matching spellings over types that differ. These are
  `{k: 1, n: i32}` and `{k: 2, n: i32}` (both spelled `{k:i32,n:i32}`), and `i32[]` beside `K[]`
  with `K = 0 | 1`. The spellings pair these arms, so the function answers -1; the types keep them
  apart, so it answers 0. Three callers test `== 1` or `!= 1`. The fourth falls back to the
  type's answer on -1, and that answer is not 1 for these unions. The sweep confirms no program
  moves.

## Changed

- The pair test is `msSliceMembersAlike`: a literal arm reads as its base (`litArmBaseTy`), and
  two members are alike when `tySame` and `armDeclSame` both hold.
- `msAtomIdOf`, `msSliceAtomId`, the `unMemAtomIds` / `msFreeAtomIds` columns and the
  `msAtomTexts` / `msAtomIds` table are deleted, with emit_rep's `peelGroupParens` import.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `580eb218` against the candidate: 24,224 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
- Render-parse census: `msAtomIdOf`'s `peelGroupParens` entry leaves, so `ty-string-parse` goes from 20 to 19.
