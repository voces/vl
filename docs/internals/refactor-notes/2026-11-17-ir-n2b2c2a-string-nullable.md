# IR N2b-2c-2a: `string | null`, its null and its `??` through legacy's block, 2026-11-17

Lane IR-C. Discipline 1's `string | null` was ruled behind M1, `print` and the numeric
intrinsics, since alone it held 13 corpus functions. On the N3 seed a throwaway that tags each
nullable miss with its discipline reads differently:
- 47 corpus functions are held by `string | null` alone;
- 489 more have the nullable-string `??` (`coalesce niche`) as their one other blocker;
- 41 have `null test rest`, and 18 `print nulStr`;
- 5 self-compile functions are held by it alone.

This step admits the rep and its `??`. The null test and `print` of a `string | null` are
2c-2b. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **`valueRep` admits `string | null`** (`strNullable`: discipline 1 over the string rep).
  - A `null` literal into it is `RNullOf`, written by legacy's `emitNullAt` where
    `nullOwnIsStr` holds: the string's typed null ref.
  - A string into it is `RRetag`, the same ref with no bytes, where the checker records no
    box.
  - The verifier's retag and null rules take either niche (`nicheRetag`).
- **The `??` niche ladder is one decision.** `coalNicheArmOf` (`CoalNicheArm`) names
  `emitCoalesceNiche`'s arm in its order: the `boolean | null` select (boxed when the default
  joins), the `K | null` sentinel, its widening to a string, a nullable collection, a nullable
  closure, `string | null`, then the boxed operands. Legacy dispatches on it.
- **The string block is shared.**
  - `coalNulRefOpen` opens the block at the result's nullability
    (`coalesceNulStrStaysNullable`), and `coalNulRefBranch` is its `br_on_non_null`.
  - `coalNulStrBlockPlain` is the plain block's shape: no box joins the default, no record
    or list default diverts it, and the default is no atom.
- **`RCoalStr { czL, czD, czAt }`** is built for that shape when the default is a string
  literal. The literal is an unread immediate, written by legacy's literal writer only on the
  null path. Every other niche arm is a named miss (`coalesce niche <arm>`, `coalesce string
  shape`, `coalesce string default`).
- `CoalNicheArm` is registered as a closed set in `compiler/lint.vl`, and `czL`, `czD` in its
  field tables.

## Pins

Each is a shared witness, one covered function matching legacy and printing the right value:
- a `string | null` built from `null` and from a string;
- one passed through;
- one assigned in a local;
- `x ?? "n"` to a string;
- `x ?? "n"` inside a `print`.

Two older tests named `string | null` as uncovered. One now uses a coalesce whose default is
no literal, a named miss; the census test's row reads `coalesce string default`.

## Coverage

| reading | N3 | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,728 | 5,732 | +4 |
| corpus covered = matched (12,296 cells) | 23,593 | 24,099 | +506 |

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 2 mismatches N3 already reports |
| corpus identity against the N3 seed, 12,294 cells | 9,016 identical, 3,278 fail under both, 0 differ (so the niche split moves no corpus byte) |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 5,732 claimed and byte-identical, the same 2 fallbacks; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 94,325,285,366 to 94,380,806,992 (+0.06%) |
| seed size, N3 seed to this one | 6,540,580 to 6,543,334 (+2,754) |
