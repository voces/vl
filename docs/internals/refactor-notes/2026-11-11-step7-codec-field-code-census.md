# Step 7 codecs: the field code's writers, censused; the arm mint's fields are typed (23,883 same), 2026-11-11

The field code is a second stored encoding of a record field's rep: `sFieldTypes` (and the arm
staging column) holds an integer code where the field's type already lives beside it in
`sFieldStoreTy`. The target is that the field table stores the field's rep, readers take it
directly, and the decoders (`fieldCodeVKind`, `fieldCodeCellKind`, `listRepOfFieldCode`,
`listRepOfFieldCodeFrom`, `nulScalarListCodeKind`) and the spelling producers
(`fieldCodeOfSpelling`, `nameFieldCode`) go. This is the first slice: the writer census, and the
one writer that held a type and did not use it. Base is master `f50936aa` (#7141), fixpoint seed
6,613,699 bytes.

## What changed

`internInlineShapeTyGo` reads each field's type from `fieldsTy`, not `tyIx`. An arm mint
(`internInlineShapeFieldsTy(nm, -1, aty)`) passes `tyIx = -1` so the arm's type is not banked
(D34), and so its fields were coded from their spelling alone (`nameFieldCodeTy(ftxt, -1)`) and
stored with no type (`recFieldStoreTyOf(-1, …)`). Both now read `fieldsTy`. Every other caller
passes `fieldsTy == tyIx`, so only arm mints move. `tyIx` still stays out of the row.

## The writer census

The probe compiler was built by the base seed into scratch and never refreshed into `build/`. It
tagged each `sFieldStoreTy` writer with an id. After `emitModule`, it ran an `emitFail` marker on
the first field row with no recorded storage type, naming the writer and the code. At the two
`fieldCodeVKind` sites, it compared `vkNulNicheOf` of the code's kind with that of
`repOfTy(storeTy)`. Over the whole population (`scripts/sweep.vl`, 23,885 programs), counted by
the first marker each program hit:

| writer of a field row | holds the type | programs with an untyped row, base → candidate |
| --- | --- | --- |
| `#anon` literal row (`collectA`) | `anonRowTyIx`, always `>= 0` here | 0 → 0 |
| `pushFieldRow`, declared/variant recorders | `litTyIx` | 0 → 0 |
| `internInlineShapeTyGo`, `tyIx >= 0` | yes | 0 → 0 |
| `internInlineShapeTyGo`, arm mint (`tyIx < 0`, `fieldsTy >= 0`) | yes, unused until now | **149 → 0** |
| `internInlineShapeTyGo`, spelling only (`tyIx < 0`, `fieldsTy < 0`) | no | 20 → 20 |
| declared-alias row (`sTyIxOfName`) | yes | 0 → 0 |
| generic-application row (`gaeTy`) | yes | 0 → 0 |
| arm adoption copies (`emit_union_atoms.vl`, three sites) | copies the arm's | 0 → 0 |

**The floor is the spelling-only intern: 20 programs.** These are bound-constraint and member
shapes interned from a spelling with no arena type: `{toString(): string}`, `{eq(T): boolean}`,
`{area(): f64}` in `tests/cases/constraints/`, and the pinned bound-field reads in
`tests/cases/generics/is-*-pinned-*.vl`. The other members are D11771, D1441, D15544, D15606,
D15607, D15608, D15629, `d188rp_objnest`, and closure, struct, union, getter and soundness
cases. Typing them means the callers that intern a shape from a name hand in its type. That is
`internShapeDeepTy`'s recursion under an untyped outer field, and the bound shapes.

## Why the decoders cannot go yet: the stored type is not the stored rep

The same probe, at the two `fieldCodeVKind` sites (struct construct and field store), on the
candidate:

- **22 programs: the code is `0` and `repOfTy(storeTy)` says `str`.** `promoteLitFieldToAtom`
  re-lays a single-literal field (`kind: "syntax"`) as an atom after the type is recorded. The
  storage decision is program-wide (atom interning), so `repOfTy` of the type cannot carry it.
  The code is right; the type is not the rep. Examples are D1154, D11030, D14745 and
  `tests/cases/literal-unions/single-literal-type.vl`.
- **66 programs: the descriptor does not cover the stored type** (`rdCovered == 0`). By code:
  0 (37), 14 (11), 3 (6), 5 (5), 18 (4), 28 (2), 4 (1).
- **9 programs: the site is reached before the row's type is recorded.**

So the row needs a stored rep, written where the code is written and rewritten by
`promoteLitFieldToAtom`/`demoteLitFieldToString`, before any reader can drop the code. That is the
next slice: an `sFieldRep` column beside `sFieldTypes`. A typed `sFieldStoreKind` reader was drafted
and measured; it is not shipped, because the 22 promoted rows would make it owe a
`ref.as_non_null` on an atom slot.

## The price, measured

`sweep.vl diff`, master's fixpoint seed against the candidate's (23,885 programs):

- **23,883 same**;
- 2 bytes-only movers: `tests/cases/unions/self-recursive-arm-field.vl` and
  `struct-holding-self-recursive-arm.vl`. In each, type indices 5 and 7 swap at their uses in the
  type section. `wasm-dis` of both modules is identical. The arm's nested
  self-field now interns its row from the type, which reorders one mint.
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## Proof

- Refresh ×2 is a fixpoint at 6,613,699 bytes (±0).
- `scripts/gate.sh`: all 23 rows pass. That covers deno test, ci-native, lint-self + fmt, seed
  size, late demands, plumb-shape cost, dead-export and render-parse budgets, scaling shape,
  rep-fuzz, filed witnesses, inventory refs, capability probes and the distilled corpus.
- The ladder, comment and sentinel budgets (`vl check --budget`) all exit 0.

## What is left

- An `sFieldRep` column written with every code, and kept in step by the atom promote/demote, so
  that `fieldCodeVKind`, `fieldCodeCellKind` and `nulScalarListCodeKind` read it.
- The 66 uncovered stored types. They are the descriptor's own gaps, and the rep column takes the
  code's answer there until the descriptor covers them.
- The 20-program spelling-only floor, before `fieldCodeOfSpelling` and `nameFieldCode` can go.
  No render-parse site is cut by this slice, so the baseline is unchanged.
