# Step 2: the elaboration's answer at argument positions, classed by cause

Base: master `df17b191`, built to a fixpoint (6,579,835 bytes). Population: the 23,728 programs of
`scripts/sweep.vl -- list`, each built once with `$VL_REP_SHADOW` by a scratch seed that was never
committed. Counts are answers at a call of `monoArgPinTyIx`, not programs. This follows shadow 2 of
`2026-11-08-step2-live-pin-shadows.md` (35,243 of 43,074 positions without an elaboration answer).

## Shadow A: why `elabNodeTyAt(ax, fnIx)` has no answer

The frame's key is `elabKeyAt(fnIx)` (or the module-scope argument's instance key).

| class | positions |
|---|---|
| answered | 7,816 |
| (a) key −1: outside every instance, the checked type is the answer | 35,264 |
| (b) inside an instance, no record: a minted node with no checked type either | 15 |
| (c) key −2 / −3 (no demand keyed the slot, or several in-place instances) | 4 |
| (c) inside an instance, the record still open | 2 |

Of (a), 34,693 checked types are closed and 571 are open (a generic function or `T[]` handed on at
the root). The checked type equals the substituted pin, `monoPinSubTyOf(monoArgPinTyIx(ax, ctx), ctx)`,
at 34,434 of the closed ones. Class (b) is not a recording gap, because the pin answers −1 there
too. Of the 6 in (c), 2 have a closed checked type and 4 stay open in the pin as well. So no argument
position inside an instance lacks a type the pin has, and the per-instance end state is reachable
at arguments without new records.

## The reader: `elabNodeTyOrChecked` (emit_elab.vl)

It returns the elaboration's type at the instance, else the checked type where that is closed,
else −1. `elabClosedTyAt` (emit_ty_canon.vl) is not this reader: it answers −1 at the root, and its
callers rely on that.

## Shadow B: the reader against the substituted pin, per caller

| caller | same | `tySame` | differ | reader −1 |
|---|---|---|---|---|
| `monoArgClosedPinTy` | 16,598 | 453 | 103 | 115 |
| `monoPreBindArg` | 593 | 55 | 0 | 0 |
| `monoPinAnnotatedParam` (three sites) | 20,192 | 599 | 132 | 66 |
| `monoPinHoleParam` (w162) | 46 | 14 | 0 | 25 |
| `monoPinTyParamComposite` (not this lane) | 3,397 | 321 | 6 | 386 |

Totals: no answer falls from 35,285 to 592, and those 592 are open checked types. Of the 241
`differ` answers, 235 come from the pin's rep arms: `monoLitBuiltTy`, `elabArgBuiltRep`, the record
copy, and `TY_NULL`. Those arms name the row a literal is built at, not the node's type, so they are
step 7's (`repOf`), not a reader's. The other 6 are D6544's literal adoption
(`tests/cases/generics/hole-call-of-generic-at-its-own-instance.vl`). The elaboration types the
`1` in `a(2.5, 1)` as `f64` and the pin as `i32`. The elaboration's answer is the designed one, so a
switch there changes what the module is keyed by.

## Switched

`monoPreBindArg` reads `elabNodeTyOrChecked` in place of the substituted pin. It agreed at all 648
of its positions. `monoArgClosedPinTy` and `monoPinAnnotatedParam` stand. Their `differ` answers are
the pin's rep arms, and the arms come first, so they would need splitting into "the rep arm, else
the reader". That is the next lane's. Lambda pins and delivery types still need their own shadows.

## Graded

Fixpoint (a second refresh is byte-identical). Seed 6,579,835 → 6,579,977 bytes (+142). Pin-helper
budget 921 → 921 (the reader lives in emit_elab.vl).
