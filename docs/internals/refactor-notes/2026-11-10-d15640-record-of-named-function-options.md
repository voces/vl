# D15640: a record of a named function beside a record of a hole function, 2026-11-10

D15640 stops here on a design question. This note records what was measured on master
`deea236c` and the options left. No compiler change ships with it.

**What decides the outcome.** The late tag decision tries the singleton set `{dbl}`, because
`call0`'s instance from `both` calls `r.f` at `f64` through the set. The try fails at the
holder `const r = { f: dbl }`: `ftHoldCtxOk` (check_fn_tag.vl) takes a `const` holder only
when it has no annotation, and the record-adoption solve has written one. With a probe in
`recAdPinLet` (check_rec_rows.vl), the binding is pinned at `{f: (i32) => i32}`, the type
`call0`'s checked instance demands. At check time the set is untagged, so the record is a
record of closures from the check onward. A list element naming a function is a set id
instead, so `const fs = [dbl]` holds the set and both instances of `call0` agree (the row's
ablation: runs, `8` `2` `5`).

**Measured, not shipped:**

| change | outcome on the repro |
| --- | --- |
| `recAdSolveAt` skips the pin when the destination holds a set (`fnTagHoldsTy`) | unchanged: the destination is already the closed record |
| `recAdSolveAt` skips the pin when the literal's own type holds a set | unchanged: at check time no set is tagged, so neither holds one |
| `ftHoldCtxOk` admits, late, a `const` whose annotation is a record-adoption pin | unchanged: the try fails further on, and no later check rebuilds the binding at ids |

**Options:**

1. **Store a named function in a record field as a set id, as a list element already is.**
   Then `{ f: dbl }` holds `{dbl}` from the check onward, and the late decision decides it like
   `[dbl]`. This changes the representation of every record of named functions, including
   deliveries to annotated record types and the record-adoption rows. It is the design choice
   the row names.
2. **Rebuild an adoption-pinned binding after the late decision.** No check runs after the
   elaboration's tag rounds (`elabPrepare`, emit_sections.vl). The binding would need its
   annotation and its literal's row re-stamped at the ids rep without a check. That is the
   same gap `ftEscBuilt` (#7083) keeps closures for.
3. **Keep the two instances apart.** `call0` at the closure record and `call0` at the set record
   are already two instances (D15638's key). `dbl` would need an `f64` instance from the set
   record's call alone, without tagging `{dbl}`, which the closure record's instance forbids
   today. This is unmeasured: it means a set that is tagged for one holder and not another.

Until one is chosen, the row stays an emit reject. It was a check reject before #7075.
