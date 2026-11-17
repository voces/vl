# A1.1: A0's closure joins the arrow rule's rows, 2026-11-17

Lane STORE, stage A1.1 of the per-instance key (coordinator ruling 2026-11-17: A1.1, then A1.2 with
class G). Agreed with L2: no rows are added to the instance vector and no `IV_*` constant; a call
through a function value is the join of the arrow rule's row (`check_arrow.vl`) with the set its
callee holds there, as `l2-inferred-interfaces-design.md` §4.3 says. Design:
`2026-11-16-store-inst-key-design.md`.

## What changes

`check_inst_keys.vl` (report path only, built when `$VL_INST_KEYS` asks):
- each arrow row whose argument types are closed keys every member of each set its hole callee
  holds (`arrowSetsOf`) at those types: a parameter with no annotation binds its hole, one annotated
  with a type parameter binds that name; any other annotation that reads a type parameter is the
  `open.arrow-shape` reason, an argument type left open is `open.arrow-args`;
- a lambda member's holes are named as the checker names them (`?#L<decl>.k`), not by the name the
  emitter has since given it;
- each such key seeds the substitution walk, so the member's own body calls close under it.

Nothing outside the report reads it; an unarmed compile runs none of it.

## Reading

`$VL_INST_KEYS=1 vl check --codegen tests` (7,223 programs), master `c33b25c8d` against this change,
one host:

| | master | A1.1 |
|---|---|---|
| equal | 9,035 | 10,295 |
| check-only | 68 | 101 |
| elab-only | 10,327 | 9,067 |
| keys from the join (`arrow`) | | 1,293 (405 programs) |
| open: arrow argument types open | | 801 (107 programs) |
| open: arrow member shape | | 21 (5 programs) |
| open: unbound | 121 | 481 |

Elab-only by why: unrecorded 5,479 → 4,466, of which lambdas 1,963 → 1,337 and named 3,516 →
3,129; open 2,928 → 2,925; arg-keyed 807; differs 1,113 → 869 (hole 249 → 121, type parameter 409 →
293, function identity 367 unchanged).

`open.fn-value` (5,084) counts the instance vector's rows through a function value; the join covers
them where an arrow row exists, it does not remove them.

The 33 new check-only keys (11 programs):
- 29 (9 programs): a set member keyed at a call shape the elaboration never delivers it to. The
  join keys every member of the set the callee holds at each call's types; the elaboration builds
  only the members that reach that call. This is the set-level approximation the per-instance key
  removes, and would cost instances, not output.
- 4 (2 programs): a nested callee whose key the elaboration completes with its enclosing type
  parameter (A0's family C).

None is an instance a program needs that the elaboration misses.

## What is left for A1.2

The remaining unrecorded lambdas (1,337) and named declarations (3,129), and the 801 arrow rows with
open argument types, are calls through function values inside un-annotated or generic bodies,
whose argument types close only under the enclosing instance. A1.2's consumer reads the keys per
instance for class G.
