# IR: a record list's places follow its ref-list slot's row (2026-11-26, COV-CALL)

This is the lists PR of the "place reads at storage" series. It consumes COV-START's row
accessor (`rowRep`, `rowStoredTy`, `irVarRow`, `irBNoteRow`, `listElemStructRow`), which is the
producer half; this PR is the consumer half (coordinator ruling 2026-11-26).

**Mechanism.** A list literal whose record element holds records of hole functions is built at
the struct row its ref-list slot lays elements out at. COV-START's literal build does this. Every
place that holds or reads it typed it at the checked element type, so the byRow member read found
no row and missed (`member record`), or a list delivery missed (`convert list -> list`). Each
place now takes the row:

- **Element read** (`Index`): a record element is read at `rowRep(listElemStructRow(arr))` and
  noted at that row.
- **List local** (`slotListRowTy`): declared at the list of that row. A read of it stands as
  stored.
- **Element-bound local** (`elemRowLetTy`): `const e = ys[0]` is declared at the row and noted
  there (`irVarRowNote`). A read of a row-noted record local stands as stored.
- **Walk variable**: noted at its list's row where it is held at that row's rep.

Where the row's stored type and its rep disagree, the row's rep decides (COV-START's contract).
The new readers are plan facts only: the ref-list slot, the struct rows and `irVarRow`.

**Census delta.** `VL_IR_SHADOW=5` probe rows, `cov-start-d17666` base against branch:

| program | base | branch |
| --- | --- | --- |
| D17666's witness | `@start` missed (`member record`) | claimed |
| the position test | `inFn` missed (`convert list -> list`), `@start` missed (`member record`) | claimed |

**Q58.** `tests/cases/lists/record-list-of-hole-fn-records-read-at-slot-row-positions.vl` covers an
element read, an element-bound local, a walk variable and `.length` in a function, and an element
read at top level. Each reads only `r`: reading `s` as well unifies the rows and hides the defect.
On the branch it runs under `VL_IR_REQUIRE_CLAIM=1` (rc 0) and prints legacy's output.

**Not covered.** A global bound to an element (`const x0 = xs[0]` at top level) is noted at the
checked rep before its cell is chosen. It still misses `member record` and is left for a
follow-up. The maker spellings are D17671.
