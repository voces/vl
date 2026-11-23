# D17055: a `??` default over a holder of a function set is built as the set's ids, 2026-11-22

Lane IR-N6. This is a clause-1 soundness fix, small and standalone so it can go ahead of the
hole-closure batch. In `m4["k"] = [inc0, dbl]; const got = m4["absent"] ?? [inc0]` the checker
was clean, and the module failed to validate at the `??`.

## Cause

The function-set decision (`check_fn_tag.vl`) re-types each write into a holder of a set, a list
whose elements are the set's `i32` ids, to the holder's type. A store's value goes through
`ftRecWriteJoins`; a map entry's literal goes through `ftMapEntryLitJoins`. Nothing did the same
for a `??` whose left side is the holder. So the default literal `[inc0]` kept its own
one-function type and was built as a list of closures, while the map's value and the join are
the set's id list (`array (mut i32)`).

## The change

The holder loop joins the right side of a `??` whose left side is the holder at the `??`'s own
type, through `ftRecWriteJoins`, as a write's value is. A list literal of the set's members is
re-typed to the set's list, and each element is joined as an id.

## Bytes that moved, base → head (tests/cases A/B: 3 of 7,439)

| program | why |
| --- | --- |
| `closures/coalesce-map-default-list-of-set-members.vl` (new) | the witness: base fails to validate, head runs |
| `closures/hole-fn-list-named-callback.vl` | a `?? []` default over a map of a set's lists now registers at the set's list type; the type section interns in another order. Output is unchanged and matches its `@log` |
| `closures/hole-fn-list-returned-reread.vl` | the same, two `?? []` defaults |

At head, claimed against claimless differs 0 (`--claimless`: identical 14,026). The IR equals
legacy on the head tree.

## Readings (base master 87a19deaa, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| `--names` (corpus) / self-compile | — | identical 9,037, differ 0 / identical |
| tests/cases functions with no blocker | 70,159 | 70,161 |
| `ir-only-census`: tests/cases programs fully IR-only | 4,693 of 7,082 | 4,694 of 7,084 |
| L2 self-compile fuel, per PR | — | +0.01% |

Legacy lines deleted: 0. Moved to `@ir`: 0.
