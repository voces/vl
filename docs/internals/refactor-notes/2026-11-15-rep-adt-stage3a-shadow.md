# Rep ADT stage 3a: the field-code shadow, 2026-11-15 (lane E)

This is step 3a of [the stage 3 design delta](2026-11-15-rep-adt-stage3-design.md). It adds a
default-off shadow that compares each struct row field's stored code with the code its storage
type's rep derives. The shadow settles the design's named risk before 3c.

## The instrument

- **`compiler/emit_fc_shadow.vl`** (new). `fcShadowSweep` runs at the end of emit, beside
  `vkShadowSweep`. For every row of the struct table, after union arms are adopted into it, it walks
  the row's fields and records one `repAB` bucket per (minter, verdict).
  - The minter is read from the row: `ref`, `anon` (`#anon…`), `shape` (`{…}`) or `decl`.
  - The verdict is one of three: `agree`; `noStoreTy` with the stored code; or the stored code
    beside the derived one and the rep kind.
- **`fieldCodeOfRep`** is the candidate derivation that 3c adopts. It is one `match` over the
  descriptor's kind, with no `_` arm, plus the null discipline for the atom niche. Nullable records
  and variants share `FC_STRUCT`, and list kinds go through `fieldCodeOfListRep`. It answers -2
  where there is no rep.
- **Armed with `$VL_REP_SHADOW`.** Unarmed, the sweep is one boolean test.

## Readings

All 12,037 corpus cells and the self-build, armed. The rows are counted per program build, so a
row a program mints is counted once per build.

| | rows |
|---|---|
| field rows examined | 14,698 (self-build: 1,081) |
| stored code equals `fieldCodeOfRep(repOfTy(storage type))` | **14,694** |
| no storage type recorded (`sFieldStoreTy` -1) | **0** |
| stored code differs | 4, in 2 programs |

By originating grid, as the coordinator asked:

| grid | cell | rows | minter | stored | derived | the row |
|---|---|---|---|---|---|---|
| `d15270` | `d15270_generic_mk` | 1 | anon | 0 (`FC_I32`) | -2 (no rep) | `mk<T>`'s `{ f: id1, x: x }`; field `x: T` |
| `d681` | `d681_refused_spelling_pin` | 3 | anon | 0 | -2 | the un-annotated generics `add` (`x`, `y`) and `addx` (`x`); each field an inference hole |

**Finding: a template's anonymous row.** All four mismatches are rows minted for a generic body,
not for an instance. The storage type is the template's open type, so it has no rep. The stored 0
is the default an open type gets, not a code that depends on anything but the type. This is 2a's
class, an emit query for a template's open type, at the level of a struct row.

It is not patched here. 3c's derivation answers -2 for these rows. Before 3c merges, either:
- the minter is asked at the instance's type, as 2a did for expressions, if the row is read; or
- if no emitted code reads the row, it is a row the template should not mint.

Both cells run correctly today.

**No row lacks a storage type.** So step 3b, which makes storage types total, is already met on the
corpus. 3b shrinks to an assertion in 3c: a row minted with no storage type fails loudly.

## Byte identity, unarmed

Both seeds are fixpoints of master `bbae6a7e`, one with the instrument and one without.

| | |
|---|---|
| corpus exit codes / module bytes changed (12,037 cells) | **0 / 0** |
| self-build | fixpoint |
| seed size | 6,400,481 → 6,402,512 (+2,031 bytes, the instrument) |
| L2 self-compile fuel, unarmed | 88,334,849,935 → 88,334,850,193 (+258 instructions, the sweep's boolean test) |
| net compiler lines | +140 (the instrument, 138, and its 2-line call) |
| pin-helper delta | 0 |

## The estimate, firmed

The design delta gave −950 (range −700 to −1,150).
- The low end assumed anon rows whose code is not a function of their type. There are none:
  the only mismatches are open template rows, which derive to "no rep".
- 3b's +40 is no longer needed.

**Revised estimate: about −1,000 net compiler lines for stage 3,** with this instrument's +140
removed at 3e.
