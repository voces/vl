# A hole function handed on as a record literal's field beside a direct call, 2026-11-10

D15638 closes, the last open step-4 row. The pattern is #7055's (D15609) and #7071's (D15637):
the checker leaves a hand-on open only where the elaboration forwards it and mono can pin what it
forwards. D15639, D15640 and D15641 are filed for the neighbours this does not reach.

**The checker.** `holeBindArgListsHole` (check_relate_core.vl) counts a field initialiser of a
record literal as an open hand-on, but only where the literal is the call's argument itself. A
`const` of one stays closed: D15639 says why.

**The elaboration.** `elabMintHandedIn` (emit_elab.vl) forwards a parameter read as a field of
such a literal to the callee's parameter, through `elabRecLitFwdTargets`. The elaboration then
binds the callee's parameter at `{f: Fn#s}`, a record holding the set.

**Mono reads that binding instead of pinning from the argument.** `monoPinHoleParam` takes the
elaboration's bound type, as it already does for a set, a list of one and a map of one. Its
spelling is the record of ids it is stored as (`monoTagRecRepName`: `{f: i32}`), not the render,
whose `(_) => _` field text a row's field split mis-parses once there are two fields. The
instance key adds the sets field by field (`monoTagRecKey`), and the parameter is typed at the
bound record itself (`monoMakeInstanceParams`), so the callee's `r.f(x)` reads the set and calls
each member directly. A field of such a record handed on (`call1(r.f, x)`) takes the set's id rep,
as an index of a list of them already does (D15612's arm now admits a `Member`).

**The row.** A literal built under two instances reuses its first row (`sLitIdRow`), but only the
first instance's record type denoted it, so the second instance's parameter found no row. The
reuse now records that instance's type against the row too (`mintPinnedObjLit`, emit_collect.vl).

**Not shipped.** Following the `const` (and forwarding through it) runs D15639's repro but turns
`run(dbl); run(neg)` over `const r = { f: g }; call0(r, 4)`, which runs today, into invalid wasm:
the elaboration keeps no per-instance fact for the record. Typing the instance's literal at a
same-shaped row by canonical id instead picked a record-of-closures row. Making the callee's
field call note the parameter's set through `elabRecFieldRoot` gave invalid wasm; the forward
note already carries the set.

**Neighbours graded.** Run where master refused at the checker: the record with a non-function
field (`{ f: g, n: 1 }`), two set fields (`{ f: g, h: k }`), the field handed on, a second callee
type `f64`. Unchanged and running: the list fixtures, `const fs = [g]` at two sets, the `const`
record at two sets at one type, `{ f: g, h: g }` at two instances at one type. Moved from a check
reject to an emit reject: D15640, a callee also handed a record of a named function elsewhere,
because a record field holding a named function is a closure where a list element is a set id.

**Disassembly.** The fixture's `--names` build has `$id`, `$id$1`, `$dbl$1`, `$id$2` and no
`call_indirect` or `call_ref`.
