# One storage decider: why the remaining late flips are late, 2026-11-16

Lane STORE, after the first class switch (#8623). This is the plan's progress measure: for each set
that `fnTagRedecide` still adds over the check's decision, why the check left it. It also records
the producer coverage this PR adds.

## The reason table

The population is 6,528 `@run` programs. A scratch probe (never refreshed) tags each set the late
pass adds with the reason `setBindTrySets` left it.

| reason | sets | programs |
|---|---|---|
| **P**, partial: a place it reaches is also reached by another value (class 2) | 268 | 141 |
| **N**, the producer never finds the set: a missing source | 218 | 114 |
| **G**, a generic member (class 4) | 113 | 91 |
| **T**, tried, and the check refuses it | 58 | 51 |
| **V**, handed to or by a set's members (class 3) | 14 | 5 |
| **S**, reaching a stored parameter (class 1) | 7 | 7 |

The same programs counted by what blocks them, overlapping:

| blocked by | programs |
|---|---|
| P only | 106 |
| N only | 76 |
| G only | 62 |
| T only | 45 |
| N+P | 18 |
| G+P | 14 |
| N+G | 12 |
| V only | 5 |
| N+S | 4 |

81 of the 218 N sets have a generic member, so they become G once found.

## Classes that wait for S3

**Class 1 (S) is an instance-fact class.**
- Witness: `closures/written-let-seeded-by-hole-param-written-with-named-fn.vl`, with
  `swap(h) { let hh = h; hh = mul; hh(1.5, 1.5) }` called as `swap(add)`.
- Master tags `{add}` and `{add, mul}` together, both in the late pass. Tagging `{add}` alone
  breaks emit.
- `{add, mul}` is the written binding's join, made per instance. At check time `hh` is typed at
  the hole parameter's type, so no set exists. Forcing `ftLate` on at check does not admit it.
- So it moves with L2 S3's `BK_LOWER` solve at the call, beside class 4 (G). The coordinator
  ruled on 2026-11-16 against a check-time join of a written binding, because it would be a second
  producer of that fact.

**Class T needs per-call member results.**
- Witness: `closures/hole-fn-if-join-result-handed-hole-fn.vl`. The producer now finds `{add}`,
  handed through `const f = if c { apply2 } else { apply3 }; f(add)`, and the check tries it.
- The check refuses it even with `ftLate` forced on. The late pass accepts it from the mint rows,
  which give the call `g(1, 2)` inside `apply2`'s instance through `{add}`, with each member's
  result at that call's argument types (`mintFactRsOf`).
- The producer can give the call and the set. The result at closed argument types is per-call
  typing: the solver's `BK_ARROW` at the call, or a check-time member result where the argument
  types are already closed.

## Producer coverage in this PR

| source | what it adds |
|---|---|
| an argument reading a parameter that a nested function captures | the row forwards from the parameter's owner, not the nested function the call is in (`sbArgOwner`) |
| a call through a local `const` the check types at a set (a choice of declared functions) | its arguments go to each member's parameters. These rows do not mark the higher-order exclusion, because the check decides the choice set itself |

Measured with the ftlate probe:
- programs whose decision the late pass changes: 353 → 352;
- late drops: 2, the same pre-existing pair;
- 5 programs' sets move from N to T, onto the try-list though refused for now.

A/B: wasm and output byte-identical on all `@run` programs, fixpoint seed against master's own
fixpoint seed.
