# One storage decider: shared type parameters, and the switch bar, 2026-11-16

Lane STORE. This follows sealed holders (`2026-11-16-store-set-bind-sealed-holders.md`, #8579). It is
the second check-only family of the set-binding shadow, and it is still a shadow: no decision
reads it, and no program's wasm moves.

## Shared type parameters

In `go<F>(a: F, b: F)`, called as `go(same, con)`, `F` binds the join of both arguments, not either
argument's set. The join is a set only where the check's own join says so
(`fnTagSharedJoinSet`, the union of two generic members' sets). With a closed function such as
`con`, it is a closure.

A parameter annotated by a type parameter that another parameter shares (`sbSharedTyParam`) now
takes:
- the join's set, or no set when the join is a closure;
- the argument's type, so the parameter still counts as bound to a function for hand-backs;
- nothing forwarded from a caller's parameter.

Calls through a set are counted as facts / programs, over the 6,502 `@run` programs at master `c36ce5b0`.

| after | agree | check only | elaboration only | hand-backs |
|---|---|---|---|---|
| sealed holders (#8579) | 1,558 / 475 | 55 / 30 | 440 / 178 | 64 / 0 / 0 |
| shared type parameters | 1,555 / 477 | **44 / 25** | 443 / 182 | 63 / 0 / 1 |

| set ids | both | check only | elaboration only |
|---|---|---|---|
| sealed holders | 999 | 30 | 202 |
| shared type parameters | 1,001 / 479 programs | **22 / 18 programs** | 200 / 126 programs |

- **Tried and withdrawn:** skipping shared parameters outright cost 51 agreeing facts and 23
  hand-backs, because the union of two generic sets is a set the elaboration instances.
- **The one elaboration-only hand-back** is a shared parameter whose join the check does not name.

## The bar for switching a class

The coordinator ruled on 2026-11-16 that a class of late flips moves from `fnTagRedecide` to
`fnTagDecide` only when two conditions hold.
- **Set grain, which decides storage.** Check-only must be 0 for the sets the class adds. The tag
  decision reads the mint rows first for which sets to try (`fnTagDecide`'s mint pass, `ftTry`). A
  set the check invents would change a storage decision, which is exactly the wrong first decision
  this work removes.
- **Fact grain, only for the readers of `mintFactCallOf`.** Check-only must be 0 there:
  `ftFwdInSubsets` and `ftMemberSeenAtArms` read individual calls.

**Elaboration-only facts and sets are not a bar.** The elaboration notes a fact only where its
instance types the callee at a set (`elabMintFactAt`), which is downstream of its own rep choices.
For example, it notes calls inside many inline list-method callbacks, but not over an unwritten
one-member list. So per-call agreement in both directions is not reachable, and nothing in storage
reads it.

## Gates

- wasm and output byte-identical on all 6,502 `@run` programs, against master's own fixpoint seed.
- The refreshed seed is a fixpoint.
