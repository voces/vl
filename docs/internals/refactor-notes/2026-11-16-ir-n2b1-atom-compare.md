# IR N2b-1: atom compare through legacy's own arm decision, 2026-11-16

Lane IR-C. This is the first part of N2b, ahead of `pop` and the atom, niche and sentinel nullable
disciplines (N2b-2), by the coordinator's ruling. On master plus N2a, the census held 342 corpus and
92 self-compile functions on `atom compare` alone. Atom compare does not share the union-compare
routing: legacy writes it in its own path, `emitBinLitEq`, before the nullable and niche dispatch.
`CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **Legacy's decision is shared.** `emitBinLitEq`'s atom arms split into `atomEqPlanOf` and
  writers that legacy and the IR both call. `atomEqPlanOf` returns the arm (`AtomEqArm`):
  - `fold`: both sides are typed as one string literal.
  - `static`: one such side beside an atom, spelled as the member it equals.
  - `ids`: two atom values.
  - `none`: any other compare.

  The writers are the exported `emitStaticLitAtom` (the static side's effect and its interned id)
  and `atomEqTail` (`i32.eq`, then `i32.eqz` for `!=`).
- **`RAtomEq { aeL, aeR, aeStatic, aeNe, aeAt }`** builds the `static` and `ids` arms.
  - A static side's operand is an unread immediate. The lowering writes that side through
    `emitStaticLitAtom` with the member lexeme the shared plan names, so there is no second
    interning.
  - The verifier requires that operand to be an immediate.
  - Only a `StrLit` static side is taken. Any other spelling the writer would evaluate with legacy's
    expression writer, so it is a named miss (`atom compare static operand`).
- **`!=` lowers as `eq` then `eqz` in both arms, never `ne`.** Two shared witnesses pin it, one per
  arm. A swap to the IR's own `ne` would mismatch there. A swap inside `atomEqTail` would change
  legacy's bytes too, which corpus identity reports.

## Measuring the arms first

A throwaway build renamed the miss by arm before any code was written. This is the census on master
plus N2a, counting functions held by that arm alone:

| arm | corpus | self-compile |
|---|---:|---:|
| `static` | 338 | 80 |
| `ids` | 0 | 9 |
| `fold`, `null`, `??` | 4 | 0 |

## Coverage

Both readings are on the same 12,223-cell corpus.

| reading | N2a | this step | gained |
|---|---:|---:|---:|
| corpus covered = verified = matched | 22,529 | 22,866 | +337 |
| self-compile claimed in mode 3 | 5,247 | 5,314 | +67 |

The atom-compare misses that remain, counted as functions held by that class alone:
- `atom compare`, legacy's `none` arm: 4 corpus, 1 self-compile. This is a mixed pair legacy
  widens to a string compare, a `null` operand, or `??`.
- `atom compare fold`: 0 corpus, 0 self-compile alone, 2 self-compile together with another class.
- `atom compare static operand`: 0.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical; moving `emitBinLitEq`'s doc comment back is seed-identical |
| corpus identity against the N2a seed, 12,223 cells | CORPUS_ID |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,314 claimed and byte-identical, the same 2 fallbacks as before; corpus CORPUS_M3 |
| seed size, N2a seed to this one | 6,496,504 to 6,500,468 (+3,964) |
