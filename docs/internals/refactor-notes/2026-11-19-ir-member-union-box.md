# `member record`: union-box field reads (2026-11-19)

The second `member record` slice, after `2026-11-19-ir-member-record.md`. A field that stores a
value-union box (code 16) was outside both plain arms, so the builder missed its read: 43 corpus
functions and 12 self-compile ones had it as their only blocker (`union box field`, `variant
union box field` in that note's diagnostic census).

## Shape
- Legacy's union-box unbox after a field read is now `structUnionBoxTail` (the member's record
  arm, the scalar narrow and convert, the atom retag, the narrowed unbox) and
  `variantUnionBoxTail` (the narrowed unbox). `emitMemStructRead` and `emitMemVariantRead` call them
  after the field read; the IR's `fieldTail` calls them after its own.
- `structFieldPlain` and `variantFieldPlain` admit a union-box field; an ambiguous box
  (`memReadBoxAmbiguous`), whose legacy arm fails loudly, stays out.
- The builder takes such a read at the read's own rep (`memFieldUnionBox`): the tail unboxes the
  field's box to it, so the field's kid rep need not match.
- Legacy's `.length` block now calls `lengthIsField` first, so a rung added there later cannot
  silently pass the IR's gate (IR-REV, #9145).

## Measured
See the PR body.
