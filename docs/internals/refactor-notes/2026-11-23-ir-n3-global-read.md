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
