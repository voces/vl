# D16160, layer 2: a held list of records handed on is read at its stored row

**Change.** One function in `emit_collect.vl`.

**The defect.** A bound list of records whose function field carries a tagged set is stamped by
the checker with its stored rep (`fnTagHeldRepOf`), a list of rows whose field holds the member's
id. A callee it is handed to binds its parameter at the binding's own type, whose element is the
record with the tagged field. No row stood for that type, so the instance's `v[1].f` failed
`field access receiver is not a struct`.

**The fix.** `heldListElemAlias`, called from `collectAHeldRep`, aliases the binding's own element
type to the row its stamped rep stores it at (`structTyIxAlias`), as D15638 does for a record
literal's instance type. It is a read of the checker's stamp. A pin in `monoPinHoleParam` was
tried first and is not needed: the instance's storage types come from the elaboration's binding,
which the alias resolves.

**Layer 1 is still open.** With no call through the binding in place, the first decision leaves
the set untagged. `elabMintParamRowFactAt` notes no fact for a field of an element read, so the
literal keeps a closure rep. That is the rest of D16160.

**Fixture.** `closures/list-of-records-of-hole-fns-called-in-place-and-handed-on.vl` is new.
