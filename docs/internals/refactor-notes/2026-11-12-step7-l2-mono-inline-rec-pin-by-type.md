# Step 7 L2: an inline record pin is spelled from its type, 2026-11-12

Two pin-text producers recognised an inline record pin by its spelling:

- `monoInstanceFor`, building an instance's pinned parameter names;
- `monoSlotPinAnn`, building a stored slot's function-type spelling.

Each tested `nameIsBraceSpanEnds(pn)` and then re-spelled `pn` with `monoPinShapeSpell`, which
splits the fields with `annObjFieldSplit` and drops the spaces (D9381, D9431). Both producers had
the pin's type in hand: `pinTys[pj]` and `fts[k]`. They now ask it:

- `monoTyIsInlineRecord(ty)` holds for a `TyObj` that no declaration names;
- such a pin is spelled `monoPinSpellShaped(ty)`, the naming rule's one producer, which spells a
  record with no row by its fields.

## Measured

Two scratch probes ran over 24,070 programs, counting decisions. Neither was seeded.

**The decision** (`nameIsBraceSpanEnds(pn)` against `monoTyIsInlineRecord(ty)`):

| site | agree | type yes, spelling no | spelling yes, type no |
| --- | --- | --- | --- |
| `monoInstanceFor` | 5,180 | 21 (13 programs) | 0 |
| `monoSlotPinAnn` | 2,385 | 2 | 1, a map spelling `{[K]: V}` |

**The text** (today's pin text against the cut's):

| site | same | different |
| --- | --- | --- |
| `monoInstanceFor` | 5,188 | 13 (8 programs) |
| `monoSlotPinAnn` | 2,378 | 10 (5 programs) |

The two text rows share programs, so 8 programs differ in all. Each was built with a base compiler
and the cut's, both from one seed, and compared with `cmp`. All 8 are byte-identical:

- D3875, D3900, D3901, D15031, D9431;
- `generics/callback-pin-inline-record-beside-generic-list.vl`;
- `parser/call-first-stmt-then-brace-tail.vl`;
- `closures/generic-fn-param-in-un-annotated-container.vl`.

The renamed pins name the same instance and the same interned shape.

A third reading: calling `monoPinShapeSpell(pn)` unconditionally gave today's text at all 7,589
decisions. So the brace test was not deciding anything the text depended on.

The probes report through `emitFail` and cannot see programs that already refuse. CI's sweep
covers those.

## Counts

- Deleted: `monoPinShapeSpell`, a spelling parser over `annObjFieldSplit`, and two
  `nameIsBraceSpanEnds` reads.
- Added: `monoTyIsInlineRecord`.
- Imports gone: `nameIsBraceSpanEnds`, `annObjFieldSplit`, `trimWs`.
- `emit_mono.vl` spelling reads, counting `annObjFieldSplit`: 13 → 9. `isSName` also fell 2 → 1
  on master from lane B's work.
- pin-helper: 910, unchanged.

## Proof

- **Locally, on master after #7648:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed +1.9%;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,857 as filed.
- **The sweep** is CI's (`sweep` label).
