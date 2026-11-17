# Rep ADT stage 3e: a field with no rep fails loudly, and the code floors go, 2026-11-17 (lane REP)

After D16720–D16722 (#8884, #8897), every field read derives its code from its storage type's rep.
The consumers still kept a code floor for a row whose storage type has no rep. This step is the
coordinator's (b), taken with (a)'s first slice, once (b)'s precondition held everywhere.

## The precondition

A scratch compiler, never seeded, made `fieldCodeIn`'s no-rep branch an unconditional
`emitFail("PROBE-NOREP …")`. A control with the D16720 close disabled trips it on
`functions/set-in-record-literal-handed-to-hole-callee.vl`; the probe build does not.

| population | programs | no-rep cells |
|---|---:|---:|
| `tests/cases`, `std`, distilled cells, capability probes | 21,062 | 0 |
| every matrix template (1,495), both faces | 85,570 | 1, already a loud emit reject on master (D16727, unfiled: D16727 until #8905 lands) |
| full census (`mkmatrix`, `sab`, blocks A–E), at `JOBS=4`, alone | 250,438 | 0 |

`gradecensus` keeps a cell's first error message, so the 265 cells emit already refuses could
hide a probe behind their own message; none of them runs, so none is a runs→loud move.

## The change

- `fieldCodeIn` fails loudly on a storage type with no rep, armed or not. This is the contract:
  a program whose record field has no rep was compiled with the stored code; it is now refused.
  The measurement above is the evidence that no program that runs today is one.
- The consumers that fell back to the code where `rowStoreRepIn` answered null now answer from
  the rep only. A row that exists but has no rep reaches `fieldCodeIn` and fails; a row that does
  not exist answers false (or null), as the code `-1` did:
  - `emit_atom_kinds.vl`: the `fieldRowIs*`, `armRowIs*`, `variantField*` predicates,
    `strOfRep`, `numKindOfRep`, `nulAtomOfRep` and `fieldSlotTableOf` lose their code arms
    (`fieldRowCode`/`armRowCode` become `fieldRowNoRep`/`armRowNoRep`).
  - `emit_rep.vl`: `rowsStoreAlikeIn` and `fieldRowRefsElemHeap`; `fieldCodeRefsElemHeap` is
    deleted.
  - `emit_eq_rows.vl`: `fieldRowKindIn`; `fieldCodeKind` is deleted.
  - `emit_classify.vl`: `sFieldStoreKind`; `fieldCodeVKind` (emit_sig_tokens.vl) is deleted.
- `readCellKind`'s code fallback stays: it serves member reads with no single field row (a
  shared field across union arms), which stage 5's shared-field plans own, not a missing rep.

| reading | value |
|---|---|
| corpus identity against master's compiler | 8,496 modules, 0 DIFFER, 0 LOST |
| compiler lines | +100 / −131 |

## Next

The stored code columns (`sFieldTypes`, `armStageTypes`, about 60 references in 14 files) are
now read only where the rep answers too, or to reach `fieldCodeIn`'s failure. Deleting them is
the follow-up.
