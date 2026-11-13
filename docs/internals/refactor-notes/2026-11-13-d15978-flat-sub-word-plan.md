# D15978 plan: a `flat` record's sub-word field has storage semantics (2026-11-13)

Design and baseline only. The owner ruled (a) (DECISIONS, "A sub-word field of a `flat` record has
storage semantics"): a `u8`, `i8`, `u16` or `i16` field stores a computed value's low bits at its
width, refuses a visibly out-of-range literal at that width, and reads back widened to `i32`. It is
built after step 7. Nothing here changes the compiler.

## Today, on master `57cda2b6`

- The arena has `TY_U8` only. The other three widths exist only as spellings that
  `flatStorageSpellWidth` (`check_leaf_steps`) reads for the memory layout. As a field's type they
  resolve to `u8`, so a literal is range-checked as a `u8`: `-3` in an `i16` field is refused.
- `flatHasSubWordField` (`emit_collect`) reads the same spelling and marks the record layout-only,
  so it mints no declared struct row. A value of it is built as an anonymous struct of `i32` slots,
  which never narrow.
- A field read types as `u8`, a storage type, so `p.a + 1` is refused (`operator '+' is not defined
  for u8 and i32`), while a `u8[]` element read already widens to `i32`.
- A bare `u8` in a value position is refused as a storage type. `i8`, `u16` and `i16` there, and as
  a list element, are `unknown type` (filed as D16043).

## Rows and reps that change

1. **Arena (checker).** Add `TY_I8`, `TY_U16` and `TY_I16` beside `TY_U8`, through the same leaf
   rung (`primTyOfName`), with the same storage-type refusal in a value position.
2. **The field's type is its width.** A `flat` field's annotation resolves to that width's type.
   The layout width is read from the type rather than the spelling, which retires
   `flatStorageSpellWidth`'s parse of the name.
3. **Literal range at the field's width:** `u8` 0..255, `i8` -128..127, `u16` 0..65535, `i16`
   -32768..32767. The message names the field's width.
4. **A read widens.** A member read of a storage-typed field types as `i32`, as a `u8[]` element
   read does.
5. **The rep: packed GC struct fields.** A sub-word field is a packed `i8` or `i16` field of a
   real struct row. `struct.new` and `struct.set` truncate on store; `struct.get_s` (`i8`, `i16`)
   and `struct.get_u` (`u8`, `u16`) widen on read. `flatHasSubWordField`'s layout-only exclusion
   (`typeDeclMintsRow`) is deleted, so such a record mints its declared row. The linear-memory
   layout (`P.size`, `P.a`, the byte intrinsics) is a separate path and does not move.

**Why packed fields, not narrowing on store into an `i32` slot.** A missed store site under explicit
narrowing prints the unnarrowed value, which is silent. With a packed field the narrowing is the
storage itself, and a read site that still emits a plain `struct.get` fails wasm validation, which
is loud. The work is a census of every `struct.get` emitted for a struct field: member read,
destructure, spread or copy, equality, print and `switch`. Each must choose `_s` or `_u` by the
field's type.

**Phase 2 (D16043).** `i8[]`, `u16[]` and `i16[]` as packed GC arrays (`array.get_s` / `_u`),
sharing the arena types from step 1. It is a separate row so D15978 can close on the field
alone.

## The position matrix

There are four templates, one per width:
`scripts/capability-probes/matrix/flat-sub-word-{u8,i8,u16,i16}.matrix.vl`.
- The value under test is a `flat` record built from a computed value, which must read back
  narrowed.
- Each template's own cells add the store spellings: an in-range literal, a computed field in a
  literal, field assignment, a nested `flat`, a list element's field, `p.a + 1`, and the
  out-of-range literal (an owed refusal).

Graded on master `57cda2b6`, the `--before` picture. The two findings beyond D15978 are filed: D16044 (an `i8` literal above 127 is accepted, clause 1) and D16045 (`p.a + 1` refused, the read not widened):

| width | graded | runs | WRONG (unnarrowed) | check refuses | owed |
| --- | --- | --- | --- | --- | --- |
| `u8` | 78 | 2 (the in-range literal) | 74 | 2 (`p.a + 1`) | 2 |
| `i8` | 80 | 0 | 76 | 4 (`p.a + 1`; `-3` checked as `u8`) | 0: the out-of-range `200` runs and prints `200` |
| `u16` | 78 | 0 | 74 | 4 (`p.a + 1`; `60000` checked as `u8`) | 2 |
| `i16` | 78 | 0 | 74 | 4 (`p.a + 1`; `-3` checked as `u8`) | 2 |

0 silent and 0 traps in all four. The WRONG cells are check-clean programs that print the value
the ruling says must be narrowed. They are clause 1 under the ruling.

## Expected movers

- **The matrix:** every graded cell to RUNS, and the out-of-range literal to an owed refusal that
  names the field's width, in all four widths, `i8`'s included.
- **The corpus:** two programs spell a `flat` sub-word field.
  - D15978's witness moves from check reject to runs, printing `-3` and `7`.
  - `tests/cases/memory/flat-sub-word-widths.vl` uses widths only for layout and must not move.
- **The seed:** no `flat` sub-word field in `compiler/`, so a byte-identical seed is expected.
  `refresh-compiler.sh` plus `cmp` confirms it.

The close is graded with `capability-matrix.vl --before <master> --after <candidate>` on all
four templates, plus a sweep with 0 runs→not-runs.
