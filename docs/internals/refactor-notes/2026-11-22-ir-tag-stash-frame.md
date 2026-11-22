# IR lowering: a tag dispatch's id stash lowers in its own frame (2026-11-22, lane IR-N7)

The verifier's stack attribution bisected the deep-nesting margin erosion to #9414. It measured a
600-level labelled while loop under a V8 stack, with a fixpoint seed per commit: 890 KB at its
parent, 925 KB at #9414. #9414 put the `RTagStash` staging (`stageLead`, the `lwFloors` push and
pop, the roots loop) inline in `node`, the lowering's per-statement recursion. Every local of a
function is in its frame, so those locals were paid at every level.

## Change

- **`tagStashEffect`** (`ir_lower.vl`) holds the arm's body unchanged, and `node`'s arm calls it.
- **`tests/vl_deep_nesting_test.ts`**: the margin comment's failing edge is 890 again.

## Measured

The margin edge, from the test's own child (`--v8-flags=--stack-size=N`, the labelled-loop
case), bisected to 5 KB, on fixpoint seeds:

| Seed | Fails at | Passes at |
|---|---|---|
| master e48f0bff | 921 KB | 925 KB |
| head | 893 KB | 896 KB |
