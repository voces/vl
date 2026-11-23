# IR-N3: `start: global read coercion`, atom globals at a string (2026-11-23, lane IR-N3)

The class is a module global read whose cell rep is not the rep the checker typed the read at.
It is split (coordinator, 2026-11-23): N5's narrowed-read fix takes the global union narrowed to a
record arm; N3 keeps the rest, of which this is the first family.

## A literal-union global at a string

A global whose cell holds a literal-union atom, read where the checker typed a string (or
`string | null`) and a delivery seats the read (`cell`), passes the id as a local's read does
(`narrowedLocalRead`'s `atomAtStr` and `atomNullable` arms); the delivery's atom arm decodes it.
Legacy reads the global with a plain `global.get`. The temp is typed at the binding's type, whose
rep is the cell's.

## Legacy tails the IR calls

None new: the global's `global.get` and the delivery's existing atom decode.

## Measured (fixpoint seeds on both sides)

Full proof on base ed1817bb8; after merging master ff34a69e4 (with #9733 and #9726), the mechanical
rerun and the class count.

| reading | result |
|---|---|
| legacy byte A/B | 20,087 programs, 0 moved, 0 rc-differ |
| `ir-identity.sh --cases` | identical 7,699, differ 0; witnesses same 62 (after the merge: 7,704, differ 0; same 61) |
| `ir-identity.sh --claimless` | identical 14,043, differ 0 |
| `ir-identity.sh --names`, mode 3 self | identical |
| corpus shadow, mode 6 | 45,441 matched; 0 order rows |
| `start: global read coercion` (tests/cases, after the merge) | 14 → 13 starts; functions 6 → 6 |
| tests/cases starts covered and matched (after the merge) | 7,037 → 7,038 |
| L2 self-compile fuel per PR | +0.00% |
| `self ir misses` | 0 |
| `vl_deep_nesting_test.ts` (SELFHOST_NATIVE_ALIGN=1) | 8 passed |
