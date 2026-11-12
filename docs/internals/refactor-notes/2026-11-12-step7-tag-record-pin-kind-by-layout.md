# Step 7 L2: a record of tagged-set ids reads its pin kind off its layout, 2026-11-12

`monoTagMapRepName` builds the pin spelling of a record holding tagged-set ids (`{f: i32}` for
`{f: Fn#a}`). A probe of every reader that resolves a struct row by name, over the sweep's 24,050
programs, found these spellings read in 56 programs. Every read came through one caller,
`monoBuildPinCol`'s `pinKindOfName(pin)`. Its `isSName` matches the spelling against the field-set
scan (`structIndexOfTypeName` → `shapeRowScanK`) and answers `PIN_ANON` (33 programs) or `PIN_NONE`
(23).

A tagged record's pin now reads its kind from `layoutFirstRowOf`: `PIN_ANON` when a stored row holds
the record's layout, `PIN_NONE` when none does. `layoutFirstRowOf` is the first row of the layout
in row order, with no canon filter. It is w317's split of `annShapeLayoutRowOf` into
`layoutRowWalk`, and `monoTagMapRepName` now also returns each field's stored code and spelling. A
shadow beside the old kind agreed in 46 of 46 tagged-record pins. The typed row finders
(`structRowOfRecordTy`, `repRowOfTyStruct`) disagreed in 12, because their `anonRowServes` filter
separates `{f: Fn#a}` from `{f: Fn#b}`.

## The pin's text is a floor

The text stays. After this change no reader resolves a row from it: it is an instance-key component,
the same class as `gaeApplyFieldTy`'s spelling.

Naming the pin by its layout's first row (`#anon0`) builds invalid modules in five programs:
D15640, D15651, `closures/hole-fn-inline-list-record-stored`,
`functions/named-function-in-record-beside-hole-record` and `…-handed-two-functions`. These
also fail when `anonHandleTyIx` keeps a pin type of the same `repRowId`, and when
`retStructRowIndex` asks the type before the name. For D15651, the invalid module differs from the
valid one only in its type section: the rename changes the struct type one instance parameter is
declared at.

Today's pin is a spelling that is not a declared name. Every name reader misses it and falls to the
parameter's recorded type, whose row is the one the argument values are built at. `#anon0` resolves
by name to the first row of the layout, a different heap type. So naming the pin needs the
value-build row exposed by type. `repRowOfTyStruct(bound)` is not that row: as a pin, it lost four of
the five.

## Proof

- Refresh ×2 is a fixpoint at 6,685,792 bytes.
- `regress.vl`, lint-self and the dead-export budget (with `--findings`) pass. The five programs
  above run.
- CI's sweep `diff` job is the mover list. The change is expected to be identity.
