# Step 7 L6 (step R3): a union keys a mixed literal set beside other members as the bases it is boxed at, 2026-11-12

This follows R1 (#7492) and R2 (#7501).

## Changed

R1's rule widened an integer literal set beside other members to its bases. It now covers any
literal set holding an integer: a string literal widens to `string`, an integer to `i32` or
`i64`, each once. So `("a" | 1) | null` keys as `i32 ; null ; string`, the key of the
`string | i32 | null` box it is stored in.

Unchanged:
- **A lone set.** A lone integer set keeps its own row (the census shows widening it loses rows
  today's lookups find).
- **A set of strings alone.** It is an atom, not a `string`.

This targets R2's no-row class: the nullable mixed literal sets that `msSetOfNameTy` still
answered by name.

## Census

A scratch probe compiler was run over the cases and cells, recording every key the rule changes:
- **9 calls in 5 programs change**, every one a nullable mixed literal set (`("a" ; 1) ; null`,
  `("s" ; 1) ; null`, `("a" ; "b" ; 1) ; null`, `("one" ; 0) ; null`). None keyed a row before.
- **5 calls** now find the widened box row; **4** find none at the lookup.

The same census for lone sets was 367 calls, 49 of which lose a row they find today, so lone
sets are left alone.

## Proof

**Targeted A/B:** the 5 census programs print the same output on a master seed and the
candidate.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,510 passed.
- emitter-state audit: passes.

**The full sweep:** CI's `sweep` label.
