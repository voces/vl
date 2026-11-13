# Step 7 D6: the code-0 fit test reads the record's field types, 2026-11-13

The interner's field-text split can only go once its readers are typed. Lane E split the two
readers left outside its and F's cuts: it keeps `annShapeWiderRowOf`, and lane D takes
`code0SpellingFitsRow` (`emit_field_codes.vl`).

**The old test.** `code0SpellingFitsRow(fnames, ftypes, si)` read a field's code-0 kind from its
spelling: `"i32"` is 1, `"boolean"` is 2. It refused a row whose own type holds the other kind for
that field (`rowFieldCode0Kind`, D3693).

**The new test.** It is now `code0FieldsFitRow(ty, si)`. It walks record type `ty`'s own fields
and reads each kind with `code0KindOf`, the same reader the row side already used. It has two
callers:

- **`layoutRowWalk`** (`annShapeLayoutRowOf`, `emit_shape_intern.vl`) passes the query's
  `fieldsTy` in place of the interner's field texts.
- **`anonHandleTyIx`** (`emit_shape_rows.vl`) passes the pinned record's type. It no longer parses
  the pin's spelling into field names and texts (`shapeFieldParse`). It still asks
  `nameIsWholeSpanShape(nm)` whether the pin is a spelled shape rather than an `#anonN` handle, and
  that question is left to the pin's owner.

## Measured

A probe compared, at both callers, each field's spelled kind and the whole answer against
`code0KindOf` of the field's type, over 24,070 programs (at `JOBS=3`).

| caller | answers compared | agree | fields whose own kinds differ |
| --- | --- | --- | --- |
| interner | 437 (182 programs) | 437 | 137 (36 programs) |
| `anonHandleTyIx` | 53 (28 programs) | 53 | 45 (24 programs) |

In every field that differs, the spelling says `i32` but the type has no code-0 kind. An example
is a tagged function set stored as `i32` (`functions/choices-of-sets-sharing-a-member-handed-to-hole-callees.vl`,
D15330, D15430). None of them changes an answer, because the row never stores `boolean` for such
a field.

The interner caller refuses 30 decisions in 28 programs, the same under both tests.

All 182 programs that reach either caller were built with a base compiler and with this cut's,
and all are byte-identical. The seed is about 950 bytes smaller.

## Counts

- `code0SpellingFitsRow`: deleted.
- `shapeFieldParse` in `anonHandleTyIx`: gone.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`.
- **CI's sweep** should report no movers.
