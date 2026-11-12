# A generic identity's result is copied where it lands, as its argument's call would be, 2026-11-11

Lane w320, stacked on #7221. One delivery rule.

**The gap.** #7200 copies a maker's direct call where it lands wider. `idn(mkB())` delivered at two
records that store a field differently was still refused by `recSitesLandApart` (D15712): the
delivered value is the identity's call, which returns its argument rather than a fresh literal.

**The change.** In `recAdoptNote`'s pass-through arm (check_fit_rules.vl), an identity handed the
fresh call directly (not through a binding) has `recFreshCallCopy` record the copy on the
identity's call. Emit copies that call's result as it copies any recorded call.

**Graded.** A new cell, `identity_at_kept_row`, in the three `kept-maker-delivery*.matrix.vl`
templates. On #7221's seed it runs on the main template and is check-clean invalid wasm on the
union and width templates; now it runs on all three. Grades: main 125/125, union 125/125, width
122/125 (D15716's three), each plus 3 owed. D15712 closes, and its fixture now runs.
