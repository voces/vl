# D15748 closes: a returned module `const` bundle used as one member runs, 2026-11-12

#7321 kept the refusal for a returner of a module-scope `const` bundle whose call takes one
member (a binding called at one signature, an annotated destination). The returner is
elaborated as an instance, and `elabRetValuesRecord` (emit_elab.vl) asked the returned holder's
initialiser for its record under that instance; the initialiser sits in plain code, so it had
none, and the returner was not a record returner while the holder held the whole record.

- `elabRetValuesRecord`: a returned holder made in plain code is read under the plain key (-1),
  so the returner returns the record and the caller picks its member, as for a returned call.
- `elabGlobalReturnerWhole` and `elabCallTakesOneMember` are deleted: no call of such a returner
  needs refusing. `elabHolderCanHoldReturned` keeps `elabRetRecordShape` (an annotated return
  keeps its type).
- Filed D15749: a holder read where one member's type is expected (an annotated binding,
  parameter or return) is refused, a module holder or a local one alike; it holds the matrix's
  two `return_annotated` cells.

**Position matrix** (`bundle-copy-handed.matrix.vl`), master against this branch: runs 2 → 3 of
48 graded (`return_inferred` / annotated), 0 SILENT, 0 runs → not-runs.
