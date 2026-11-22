# IR verifier: a global read's storage row is the builder's record (2026-11-22, lane IR-D1)

D17049 lists every ir_verify call into legacy emit and checker-emit helpers. This retires the
first: `letBindTy` in rule 2's `globalReadAtTyOrStorage`.

## The change

- `IrFn.irGlobalStoreTy` (ir.vl), read with `irGlobalStoreTyOf` and written with
  `irGlobalStoreNote`: the storage-row type of each global the function notes, kept beside its rep
  as `irGlobalNote` keeps the rep (#9550).
- One builder helper, `globalNoteAt(g, d, rep)` (ir_build.vl), replaces `irGlobalNote` at all
  five global-note sites, and the identRead map-cell note from #9584,. The first time, it records `letBindTy(d, -1)`. A later note with a
  different type is a named miss, `global storage row disagrees`.
- `globalReadAtTyOrStorage(sym, dst, at)` accepts a read off its checked type's rep only at
  `repNodeOfTy(irGlobalStoreTyOf(vf, sym))`. That is the old check's exact semantics, read from the
  IR. ir_verify drops `letBindTy` and `identDeclOf`.
- Verifier self-test `global-read-off-store-type` is refused under rule 2: a read that neither the checked type nor
  the recorded store type justifies.

## Control

A first cut recorded the type only at the builder's three "stored" arms. That turned 264
tests/cases reads into rule-2 failures (239 in `@start`, 20 in `@init`, 5 in lambdas), so the check
reads the record and can refuse.

The measurements are in the PR body.
