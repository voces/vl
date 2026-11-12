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

The pin's text is unchanged. Naming the pin by its row (`#anon0`) still breaks D15640, D15651,
`closures/hole-fn-inline-list-record-stored` and the two `functions/named-function-…-beside-hole`
cases, so that step waits on the readers that special-case an `#anon` name.

## Proof

- Refresh ×2 is a fixpoint at 6,685,792 bytes.
- `regress.vl`, lint-self and the dead-export budget (with `--findings`) pass. The five programs
  above run.
- CI's sweep `diff` job is the mover list. The change is expected to be identity.
