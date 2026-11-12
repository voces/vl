# Width subtyping B: a view rep for an existing record held at a narrower type, 2026-11-12

Lane w315. Design note only, with no code. Option A (DECISIONS "Width subtyping of an existing
record: specialize per concrete record", owner ruling A, B later) is done (#7498, #7524, #7541,
#7578). This note sets out what option B would add, so the owner can decide whether and when.

## What A leaves refused

A takes an existing record at its own layout wherever one storage sees one concrete layout: a
parameter (specialized per record), a binding or return (the annotation is dropped and
re-checked), and a fresh container (built at the element). It refuses, as the one-layout
contract, every storage that would hold two layouts. The matrix
`existing-record-into-narrow-record.matrix.vl` reads `runs 59 of 59 graded · 17 owed refusals`.
The 17 cells are B's scope:

| cells | faces | what would hold two layouts |
| --- | --- | --- |
| `mixed_slot`, `assign_literal_then_record` | 2 + 2 | one binding given `A` and `B` (or a `Pos` literal and `A`) |
| `slot_feeds_join`, `mixed_list` | 2 + 2 | a list literal or join of `A` beside `B` |
| `owed_map_value`, `owed_map_set` | 2 + 2 | a `{ [string]: Pos }` whose storage is fixed at `Pos` |
| `owed_array_push` | 1 | a push onto an existing `Pos[]` |
| `owed_existing_field_write`, `owed_existing_element_write` | 2 + 2 | a write into an existing `{ f: Pos }` field or `Pos[]` element |

B also reaches two rows: D4050 (a `Cat[]` read as `readonly Animal[]`) and D15872's join
spellings, which are refused by contract today. It does **not** reach D4051: a mutable
`Animal[]` over a `Cat[]` would let an `Animal` be pushed into `Cat` storage, which no rep makes
sound. The container ruling keeps refusing that.

## What a view is

A view is a value of the narrow type `Pos` that holds a reference to an existing record of some
wider layout, plus the means to reach `Pos`'s fields in it. Reads and writes through it reach
the one record, so B keeps A's no-copy semantics (DECISIONS "Record covariance", B rejected
copy-on-delivery).

There are three candidate encodings:

* **(V1) a tagged view.** A struct `{ obj: eqref, shape: i32 }`. A field access switches on
  `shape` (a `br_table` over the concrete layouts the program delivers there), casts `obj` to
  that struct, and does `struct.get` or `struct.set` at that layout's field index. The shapes
  are closed per program, because the checker sees every delivery.
* **(V2) an accessor view.** A struct `{ obj: eqref, acc: ref $Acc_Pos }`, where `$Acc_Pos` holds
  one getter and one setter `funcref` per field, built once per (wide, narrow) pair. An access
  is a `call_ref`. It is open-ended (no closed shape set), at the cost of a call per access.
* **(V3) a layout prefix where one exists.** If `Pos`'s fields are a layout prefix of the wider
  record (sorted by name, D622), the wider struct is already a wasm subtype and no view is
  needed. This is the case that runs today. B only applies to non-prefix pairs.

Recommended: V3 where it applies, else V1. The shape set is closed, a `br_table` plus a cast
beats a `call_ref`, and the emitter already lowers closed unions by tag.

## Which storage takes the view rep

Only storage that would hold two layouts. A `Pos` slot A already handles (one concrete layout)
stays a plain struct, and a `Pos` that never receives a wider record stays a plain struct. The
decision is per storage, made by the same delivery flow that decides A's slots: the
one-layout refusals become "this storage is a view". Programs that never mix layouts pay
nothing.

A view-rep storage receives:

* an exact `Pos` (a literal, or a `Pos` record): wrapped as a view of shape `Pos`;
* a wider record: wrapped as a view of its shape;
* a view: stored as is.

## Identity, equality and mutation

* **Identity.** `==` on records is reference identity. A view compares by its `obj`, so a view
  equals the record it wraps and every other view of it. Map keys and `is` follow the same rule.
  This needs `==` to unwrap on any operand typed at a view-rep storage.
* **Mutation.** A write through a view sets the wide record's field, and a read through the
  wide record sees it, as A's specialization does. Width only: a field whose type differs
  between the layouts (depth subtyping) stays refused, as D2060 and D793 refuse it today.
* **Narrowing and unions.** A view inside a union arm carries that arm's tag like any struct.
  Narrowing a view back to `A` (`if v is A`) is a shape test on `shape`. That is new surface,
  for the owner to decide.
* **Printing and JSON.** A view prints the narrow type's fields, not the wide record's. That
  matches how a `Pos`-typed value reads everywhere else.

## Cost

* **Per access through a view:** one extra load (`obj`), one `br_table` on `shape`, one
  `ref.cast`. That is an indirection per read or write, compared with A's direct `struct.get`.
* **Per delivery into view-rep storage:** one small allocation (the view struct). A view of a
  view is not re-wrapped.
* **Code size:** a dispatch per (narrow type, field, access kind) used. This counts toward the
  seed-size gate only if the compiler itself mixes layouts, which it does not today.
* **Gates:** `plumb-shape-cost.vl` (fuel +5%) and `seed-size.vl` (+3%) should not move for
  programs without view storage. A cost probe per position belongs in the first PR.

## Open questions for the owner

The status of each lives in `open-rulings.md`; this list only files them.


1. Implicit or spelled? (`width-view-implicit-or-spelled`) Should a `Pos` slot silently become a view, with a hidden indirection
   on every access, or should the source spell it (`view Pos`, or a `readonly` record)? A
   spelled view makes the cost visible. An implicit one makes the 17 cells run as written.
2. `is` narrowing from a view back to its concrete record: **ruled out of scope by the owner,
   2026-11-12.** A view is not narrowed back; the first PR refuses `is` on a view by name.
3. Equality (`width-view-equality`): identity of the underlying record, as above, or refuse `==` on views?

## Estimated PR sequence

1. DECISIONS entry for B, the view struct type and its constructor, and one position (a
   mixed binding, `mixed_slot`) with reads. Matrix target +2.
2. Writes and identity through a view: `struct.set` dispatch, and `==` unwrapping. Cost probe.
3. Joins and list literals of two layouts: `slot_feeds_join`, `mixed_list`, and D15872's
   spellings. Target +4.
4. Existing lists: element write and push (`owed_existing_element_write`, `owed_array_push`).
   Target +3.
5. Maps and record fields: `owed_map_value`, `owed_map_set`, `owed_existing_field_write`,
   `assign_literal_then_record`. Target +8.
6. The `readonly` list view (D4050): a list-level view over a `Cat[]` read as `Animal[]`.
7. Retire the one-layout contract wording for every position B runs, re-status the rows, and
   fold the contract into "a mutable list never widens" (D4051 stays refused).

That is about seven PRs, each graded by the matrix with no `runs → not-runs`. Step 1 needs the
owner's answers to questions 1 and 3.
