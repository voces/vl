# One storage decider: sealed holders, and the set-grain diff, 2026-11-16

Lane STORE. This follows round 1 (`2026-11-16-store-set-bind-sources-1.md`). The work is the first
check-only family: holders written after their literal. It is still a shadow: no decision reads
it, and no program's wasm moves.

## The rule

A local binding's list literal describes what it holds only while the binding is sealed: never
re-pointed (or re-pointed only by values of the same element set), and never read except as a
holder. A holder read is:
- an element callee, `fs[i](…)`;
- a `for` iterable;
- the receiver of a list method with an element callback, or of `.length`;
- a `push` of a function the literal already holds, by name or by a set within the literal's;
- a `const` alias, which is sealed when the alias is.

Any other read hands the list on or writes into it, so the producer takes no set from the literal
(`sbEscapeNote`, `sbHolderSealed`). That covers element calls, `for` variables and list-method
receivers.

## Measured

The population is 6,502 `@run` programs at master `c36ce5b0`, with calls through a set counted as facts / programs.

| | round 1 | this round |
|---|---|---|
| agree | 1,570 / 477 | 1,558 / 475 |
| check only | 63 / 34 | 55 / 30 |
| elaboration only | 428 / 173 | 440 / 178 |

- **Removed:** 8 check-only facts. Five are in `hole-fn-list-written-then-called` and
  `generic-fn-list-written-then-called`, two of the census's four drop programs: the writes
  `a[0] = dbl` and `put(a)` widen the list.
- **Lost:** 12 agreeing facts, in 6 programs, behind reads the rule does not yet accept. Examples
  are a returned list re-read and a lambda member capturing a parameter. They move to
  elaboration-only and are the next refinements of this rule.
- **Tried and withdrawn:** dropping every inline list-method callback's calls. It cost 97 agreeing
  facts, because the elaboration does note calls inside many inline callbacks. The remaining
  inline-callback check-only facts (`a7.map((f) => f(3))` over an unwritten one-member list) are
  where it notes none. That criterion is the next item.

## The set grain

The tag decision reads the mint rows for one thing first: which sets to try (`fnTagDecide`'s mint
pass, `ftTry`). So the `setbind` line now also compares the set ids each side names.

| sets | both | check only | elaboration only |
|---|---|---|---|
| ids | 999 | 30 | 202 |
| programs | 477 | 23 | 128 |

A class can switch the decision only where this grain agrees for every set the class adds. The fact
grain (per call) stays for the readers of `mintFactCallOf`: `ftFwdInSubsets` and
`ftMemberSeenAtArms`.

## Gates

- wasm and output byte-identical on all `@run` programs, against master's own fixpoint seed.
- The refreshed seed is a fixpoint.
