# A choice of named functions in a record literal handed to a hole callee, 2026-11-10

D15641 closes, and D15330 with it. D15639 and D15640 are not touched by this change. D15642
and D15643 are filed for the neighbours it does not reach.

**The gap.** `const g = if b { id } else { dbl }; call0({ f: g }, 3)`, with `call0(r, x)`
calling `r.f(x)`, was refused at emit: nothing called through the set at a type the check could
see, so the set stayed a closure, and no closure of `(i32) => i32` was ever built. The list
spelling `call0([g], 3)` ran, because the elaboration notes a fact for `r[0](x)` and the late tag
decision then tags the set.

**The elaboration** (emit_elab.vl). `elabElemRead` admits a field read of a parameter, so
`elabMintParamRowFactAt` notes the fact for `r.f(x)` where the instance binds `r` to a record
holding a set. It skips a parameter its callers forward a hole into (`mintParamFwdInsOf`): the
D15638 forward note already gives that callee the set, and a fact there tags the set late and
splits the literal's row (`functions/hole-param-called-and-handed-on-in-record.vl` went invalid).

**The late tag decision** (check_fn_tag.vl), four places:

- The literal handed to a hole parameter is a holder like a list literal there (`ftHoldCtxOk`).
- Its field value is an id where the literal's rep is the parameter's open record (`{f: _}`),
  read at the literal's own type (`ftOpenFieldHolds`). The other fields' sets are decided with
  this one through `ftSubNeed`, so the record holds ids at every field or none. Without that, a
  record `{ f: g, h: h }` with `g`'s set also delivered elsewhere had one tagged field and one
  closure field, which mono cannot spell: a program that ran on master was refused. Reading the
  own type for any rep with a hole (rather than only an open field) broke six fn-widened record
  fixtures.
- `ftChainCallsComplete` compares only calls through the same fields (`ftChainFields`): a
  record's two fields hold two sets, where a list's elements share one.
- A delivery to a closed function type of a set only the late decision would tag keeps the set a
  closure (`ftEscBuilt`), since no later check builds the adapter. Without it, `keep(g)` beside
  `call0({ f: g }, 3)` became invalid wasm. The same rule now runs the list spelling
  `callL([g], 3); keep(g)`, which was invalid wasm on master. A lone hole lambda keeps its
  closure built at the type (`fnCloCoerceNote`), as
  `closures/hole-lambda-inferred-return-in-generic-at-two-pins.vl` needs.

**Neighbours graded** (each refused or invalid on master, each runs now): the choice at two
calls `true`/`false`, at `i32` and `f64`, at `string`, with a non-function field, handed on
(`call1(r.f, x)`), two sets, two set fields, delivered to a closed function type too.
`call2({ f: g, h: h }, 3)` beside `keep(g)` elsewhere runs as on master (both fields closures).

**Not reached.** D15642: the escaping set called at two types through the record is invalid wasm
on master and still is, since it stays a closure of one signature. D15643: two `const` choices of
records whose sets share a member still refuse, as on master; disjoint sets run.

**Disassembly.** The D15641 and D15330 repros' `--names` builds have no `call_indirect` or
`call_ref`. In the D15641 fixture the three left are the escaping set's closure paths (`call0$3`,
`callL`, `keep@33`), which the fixture names as staying a closure.
