# A record value names its struct row: `irVarRow` and `rowRep` (lane COV-START, D17666 part 1)

**What.** The producer half of D17666, as the coordinator split it on 2026-11-26. A record value the
builder produces at a known struct row is noted on its function with that row (`irVarRowNote`):

- a record built at a row (`builtAtRow`);
- a field read whose field targets a row (`irBRowFieldTarget`);
- an element read off a list laid out at a row (`listElemStructRow`).

One accessor answers the row (`irVarRow`, `irOpRow`). The value's rep is the row's own, `rowRep(si)`:
the rep of `rowStoredTy(si)`, the row's type with each targeted record field at its own row's stored
type. Every builder read of a row's type goes through `rowStoredTy`. The lowering reads a field off
the noted row (`recvStructRow`). A struct literal nested into a field that targets another row than
the literal's layout row is built by the targeted row's layout (`nestedLitTargetRow`). The list place
is COV-CALL's (their lists part, stacked on this branch).
`mkObjTy` does not intern (`addTy` appends), so `rowStoredTy` mints at most one type per row whose
fields move, per compile: the memo is reset in `irShadowBegin`, which runs once per compile.

**Verifier.** Rule 3 holds the invariant (`varRowsWhy`): a noted variable's rep is the row's rep or
its nullable. Where the variable is also noted as built on a heap (`irVarHeapOf`), that heap is the
row's. An earlier form compared the heap of the rep's canonical type and fired 89 times on generic
records, so the row, not the rep, names the heap. Over all 27,421 programs the rule fires 0 times. A
control build noting `rr + 1` fires it on the corpus and on the new witness.

**Fixes on the way.**
- `rowTyBuildsAtGo` carries a path-scoped `seen`. Two sibling fields targeting one row read as a
  cycle.
- The receiver-row member read excludes narrowed-variant reads (`narrowedFieldPlain`). Without that,
  769 tests/cases functions newly missed "member record".

**Measured** (shadow-5 census per function, master 69553c623 vs head, both probes built alike):

| population | fnc base→head | fnu base→head | newly claimed / missed |
| --- | --- | --- | --- |
| tests/cases | 88,511 → 88,511 | 226 → 225 | 0 / 0 (1 miss reason moved) |
| witnesses | 22,481 → 22,481 | 60 → 60 | 0 / 0 |
| capability probes | 650 → 650 | 4 → 4 | 0 / 0 |
| distilled | 46,953 → 46,953 | 17 → 17 | 0 / 0 |

`ir-identity.sh --cases` gives 0 differ and 0 behavioural differences. `regress.vl` reports no runs
lost. The phase-state surface of `ir_build.vl` rises 13 → 16 (`TyObj`, `mkObjTy`, `mkNullableTy`),
because `rowStoredTy` rebuilds a row's stored type.

**Witness.** `tests/cases/records/recursive-record-row-read-positions.vl`: a record whose row holds
itself, nullable and in a list. It is claimed under `VL_IR_REQUIRE_CLAIM=1`.
