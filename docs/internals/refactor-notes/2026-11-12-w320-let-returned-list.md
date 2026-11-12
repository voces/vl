# A `let` holding only list literals, returned by an inferred function, relays no existing list, 2026-11-12

Lane w320. Stacked on #7516 (D15871). Check only.

**The defect (D15894, clause 2, master too).** D2194 judges a call of a function with no result
annotation as relaying an existing list when it returns a module-level binding that is not a
literal `const` (`noRetFnRelaysList`). A `let` that holds only list literals was judged so, and
the call's delivery as a list of a wider record was refused; the `const` spelling runs.

**The change.** `noRetFnRelaysList` (check_list_origin.vl) also exempts a binding
`recFreshDeclOf` accepts: an un-annotated `let` every write of which is a list literal (#7516
extended it to reassignments). The call is then copied where it lands, as a `const`'s is: a push
through the delivered list leaves the binding's list as it was, in both spellings. A `let`
reassigned anything else, and an annotated list, still relay (D2194's pins hold).

**Proof.** `let-reassigned-list-into-wider-list.matrix.vl`: 45 / 46 before, 46 / 46. Fixture
`let-list-returned-by-inferred-fn-delivered-wider-runs.vl`.
