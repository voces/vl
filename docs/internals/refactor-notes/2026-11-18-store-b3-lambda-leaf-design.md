# B3 site 10, the lambda leaf: design and measurement, 2026-11-18 (lane STORE)

Lane STORE, after the fresh re-ablation of the 18 live `ftLate` sites on master (the B3.2a table
was stale: `ftCloDelivered` and `ftNamedRecLits` are already gone). Site 10 is `ftNodeOk`'s
`FuncDecl` arm: a lambda member stands as its own id (a leaf) at check only as a list element or an
argument of a call through a set (`ftLamPlainAt`), beside a declared member, or written straight
into the binding; after the elaboration it stands anywhere. Forcing the arm to the check's answer
loses 71 late rows over 37 programs and changes 13 programs' diagnostics.

## Where the late-only leaves stand

A throwaway seed noted, for each lambda the late arm took and the check's arm would not, the node
holding it; each of site 10's 71 rows was classed by the positions of its set's late-only leaves:

| position of the lambda | rows |
|---|---:|
| the initializer of a binding (`const f = (a) => …`) | 39 |
| an argument of a direct call to a declared function | 27 |
| an argument of a call through a set | 2 |
| a parenthesised lambda | 1 |
| none noted | 2 |

## The producer for each

**A binding's initializer (39 rows).** The check already has what the leaf needs. B3.2a's
lambda facts (`arrowFactsBuild`, a member's fact asked in a quiet run) type the lambda at each call
row's arguments, and the net (`ftFactsCoverInstances`, code 40) fails loud if an instance call
finds no fact. So the producer is the position itself: `ftLamPlainAt` admits a lambda that is a
`LetDecl`'s initializer.

Measured on master + #9051 (L1 seeds, `VL_LATE_DEMANDS=1 vl check --codegen tests`):
- 36 rows gone, 0 new, diagnostics byte-identical;
- the 20 programs whose rows moved: run output identical under both seeds, wasm identical in 19.

**A direct call's argument (27 rows).** Not free. Admitting it moves 18 rows but breaks the
bundle-record programs (`closures/bundle-record-delivered-to-a-declared-destination.vl`
fails validation, `bundle-record-from-a-maker-used-at-one-signature.vl` refuses,
`bundle-record-held-in-a-record-field.vl` fails validation in the top-level code), as B3.2a found:
there the instance keys the lambda's own types. The producer is the declared callee's instance
fact per (call, KeyId): the arm at the instance's own binding of the parameter, which the
check's instance vector already names. That is B3.3's per-key arm, and it comes after the
binding-initializer step.

## Finding (ii): D15641's record rows span literals

Site 17 (`ftOpenFieldHolds`), run at check, moves 5 of its 10 rows and breaks
`functions/named-function-record-beside-hole-handed-two-functions.vl` (validation in `both$1`).
Each half of the program runs alone. Together, deciding `{idf}` at check fixes the rep of the record
row `{ f: fn }` that the other group's literal shares, while that group's set (`{dbl,inc}`) is
decided late. A record's rep holds ids at all its fields or none (D15641), and the row is shared by
every literal of that shape, so the all-or-none spans literals. The late pass sees every set on the
row; the check decides one. The producer, for sites 17 and 18: decide every set that shares a record
row together at check, or none of them.

## Stage order

1. **B3.10a**: the binding-initializer leaf (36 rows), with the late arm's share of site 10 that
   it retires re-ablated.
2. **B3.10b**: the declared callee's per-key arm (27 rows, with B3.3's site 9).
3. **The record-row producer**: sites 17 and 18 (10 + 51 rows).

Each stage reports net lines, rows moved and a full @run A/B.
