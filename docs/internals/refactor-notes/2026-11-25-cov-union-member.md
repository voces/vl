# IR coverage: `member atom`; the layout family's post-I8 plan (lane COV-UNION, 2026-11-25)

## `member atom`

`k.length` where `k` is a literal union (a hole parameter, a generic's lambda, a global, a local,
a `??` result): legacy's `memberLengthArmOf` answers `atomStr`, widens the atom to its member
string and reads the string header's `len`. The builder fell through to `member atom`.

- Builder (`ir_build_ref`): an `RAtom` receiver of `.length` on the `atomStr` arm is delivered as
  a string (`deliverStr`, the atom decode) into `RListLen`.
- Lowering (`lowerLenOf`): on the `atomStr` arm the operand is the decoded string, so the tail is
  the string header's `len` (`fbStrLen`), not `arrLenTail`, which classifies the receiver node and
  refuses an atom.

Class cut (`member-atom.txt` plus the sweep), master before and this tree after: `member atom` 7 →
0 on the class programs (d651len_lit, one-literal-field-through-generic, length-and-hole-coalesce-default
×3, narrowed-global-length-and-pinned-join-store ×2), and 5 → 0 on the sweep; claimed 12 → 24. Q58
sweep `tests/cases/literal-unions/atom-length-in-each-position.vl` (a hole parameter, a generic's
lambda, a global, a local, a `??` result, a narrowed binding; print, return, argument, binding,
arithmetic): output equal to master's.

The other member classes are separate mechanisms (the ablation does not join them): `member unsup`
is an empty literal's element kind, `member record` and `member nullable` are records stored apart
from the read's row, and the three narrowed-union element reads (`xs[0].r`) open the box at the
field read.

## The layout family after I8 (coordinator ruling, 2026-11-25: parked until I8)

The map rows (D13902, `map-binding-keeps-own-type-when-read-so`, `union-valued-maps-share-one-struct`)
and the record rows (D17402, `rowless-record-narrowed-to-arm-as-field`, `getX`'s `a`, D16916) put one
wasm struct under two IR reps whose field reps differ: a map of P laid out at Circle's map shape
because a consumer takes it as Circle, a variant record read as a plain record. Mirroring legacy's
sharing needs a bridge across field reps that is unsound.

The plan after I8: build each value at the type the binding reads it at (the checker's struct), and
convert at the consumer that wants the other row (the call argument into `sink`, the variant door),
with the conversion an IR node of its own. Before I8, a legacy-emitted consumer still reads these
values at legacy's row across a function boundary no IR conversion covers, so this waits for every
consumer to be the IR's.
