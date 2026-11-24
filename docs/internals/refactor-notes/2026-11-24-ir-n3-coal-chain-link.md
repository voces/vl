# IR-N3: a `??` chain's untyped inner link (2026-11-24, lane IR-N3)

Legacy lowers `a ?? b ?? d` re-associated, as `a ?? (b ?? d)` (`coalChainMint`). It types the
minted inner link only for a struct-bearing or number-apart chain, or where `d` already has the
chain's type; otherwise the link carries no type and reps as its chain (`coalLinkChains`, inner to
outer). Legacy's classifier reads it so (`exprIsLitAtom`), and its bytes do too: the inner link's
null-test `if` is `(if (result (ref $7)))`, the chain's own box. The IR asked the link's own type and
missed (`rep ?`), at the link itself (`@binary ??`) or at its `holeMap` null test (`@if`).

## The shared decision (`coalLinkChainOf`)

`emit_state` exports `coalLinkChainOf(ix)`, the chain minted link `ix` reps as, or -1. Legacy's
`exprIsLitAtom` and the IR both call it (R8).

## The IR (`exprTyOf`, `chainLinkTy`, `ibLinkIfTy`)

An untyped `??` node that `coalLinkChainOf` names is of its chain's type (`exprTyOf` of the outer
link), so its rep and its temps follow. Along the `holeMap` arm, a minted link's null-test `if`
with no type of its own is noted at the link's type (`ibLinkIfTy`) before it is built. A minted
link that reaches any other arm builds as before and misses by that arm's own sentence.

## Grading — the position matrix (fixpoint seeds, base master dce7af959 in its own tree)

Since D17401 (#9941), a chain whose value is a union box types its inner link in legacy, so the
untyped links left are those of a chain that is no box: a literal union's atom (`r ?? mkK(n) ??
"a"`). The boxed mixed-kind chains this family first missed on are covered by that fix alone.

`scripts/capability-probes/matrix/coalesce-chain-untyped-inner-link.matrix.vl`: 76 of 76 graded cells
run under both seeds, 0 runs → not-runs; its effect cells (logging calls as the receivers and map
keys) run each link once, left to right. Shadow mode 1 over its cells: covered and matched, 0
mismatch; mode 6: 0 order rows. The 60 module-scope cells stay at `coalesce chain unminted` under
both seeds, its own class (legacy mints a chain's links ahead of function bodies only).

tests/cases: `literal-unions/nullable-litunion-coalesce.vl` midCall and the shadow row's `lit` move
`rep ?` → covered, matched. `soundness/coalesce-null-binding-with-null-call-default-filled-later-runs`
c moves `rep ?` → `coalesce nulRef default rep`, which its two-link spelling `y ?? r()` already
hits (another arm, named, not claimed).

R8 checks. A compiler built from master with only `exprIsLitAtom`'s switch to `coalLinkChainOf`
builds master's compiler byte-identically to master's fixpoint seed. On the literal-union witness the
claimed and claimless modules are byte-identical. `emit_state`'s phase-state counts are unchanged
(cross 272, hidden 20).

## Legacy tails the IR calls

None new: `coalLinkChainOf` is a shared decision, not a tail.

## Measured (fixpoint seeds on both sides)

Base master dce7af959 against the candidate, each a fixpoint after one refresh: byte A/B 20,875
programs, 0 moved, 0 rc-differ; tests/cases A/B differ 0; mode 3 corpus differ 0, mode 3 self
byte-identical; `--names` self-compile identical; `--claimless` identical 14,500, differ 0; corpus
shadow 46,916 matched, 0 order rows. Claimed-function delta: self ir misses 0 → 0; corpus 46,916 of
46,958 functions with no blocker, before and after; tests/cases covered 87,769 → 87,770, matched
87,758 → 87,759, start bodies 7,834 both; no claim lost. Self-compile guest fuel on the base tree
128,605,752,908 → 128,617,192,785 (+0.009%).
