# D15748: a returned module `const` bundle used as one member is refused, not invalid wasm, 2026-11-11

D15740 (#7263) keeps a bundle held in a module-scope `const` whole when a function returns it.
The new position matrix `scripts/capability-probes/matrix/bundle-copy-handed.matrix.vl` found the
family it missed. When a call of the returner takes one member of the record, emit lowers the
returner at that member, while the returned `const` is still the whole record. The member is
taken by a holder called at one signature (`const w = g(); print(w(3))`), or by a destination
naming one member's type (`const v: (f64) => f64 = g()`, `u(g())` to an annotated parameter).
The result was check-clean invalid wasm. Part of the family is older than #7263: master
`0a9e9948` builds the holder and annotated-parameter spellings silently already.

- `elabGlobalReturnerWhole` (emit_elab.vl): a module `const` is returned whole only from a
  function that may return a record (`elabRetRecordShape`) and none of whose calls takes one
  member (`elabCallTakesOneMember`). The rest keep the refusal, filed as D15748 (clause 2: the
  local-holder neighbour runs). The close is to project the member from the returned holder, as
  a returned call already is.

**Position matrix**, merged master against this branch: master builds 3 SILENT cells
(`return_inferred`/annotated, `return_annotated` in both faces), this branch 0; runs 2 of 48
graded on both, 0 runs → not-runs.
