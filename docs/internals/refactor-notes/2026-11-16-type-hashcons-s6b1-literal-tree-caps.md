# Type hash-cons stage 6b, batch 1: six literal-tree walkers lose their depth caps (lane H), 2026-11-16

This is the first batch of 6a's plan (`2026-11-16-type-hashcons-s6a-cap-census.md`): exhaustion caps
that never fire, in walkers that cannot meet a cycle.

## Which walkers

There are 238 exhaustion caps that never fire. 92 sit in walkers that read only the AST (`nodeAt`),
and 58 of those follow no declaration, symbol or binding. From those 58, this batch takes the six whose
recursion visibly descends only into a node's own children (`Paren`, `Unary`, `BinExpr` operands) or a
value join's tails (`tailValueLeaves`, `valueTailLeaves`):

| walker | cap | callers' depth |
|---|---|---|
| `litTreeOps` (`check_num_lits.vl`) | `depth <= 0`, counting down | 8 or 32 from five files |
| `litTreeHasRadix` (`check_num_lits.vl`) | `depth <= 0` | its own |
| `lbiLitTree` (`check_num_lit_state.vl`) | `depth > CEX_DEPTH` | 0 |
| `lbiTreeHasRadix` (`check_num_lit_state.vl`) | `depth > CEX_DEPTH` | 0 |
| `cexF32Leaves` (`check_num_lit_state.vl`) | `depth > CEX_DEPTH` | 0 |
| `castBoundBits` (`check_cast_bound.vl`) | `depth > CEX_DEPTH` | 0 |

`leafIsLit` (`check_call_retire.vl`) took a depth only to hand it to `litTreeOps`, so it loses that
parameter too. `check_cast_bound.vl` no longer imports `CEX_DEPTH`.

Left out of this batch:
- `cexEvalAt`, `cexWideDecAt` and `cexTreeText`: they follow an identifier into its constant's
  initializer (`cexEvalName`).
- `argIsLitOnly`: it reads a constant's value by name (`readsLitConst`).
- `numLitAdoptDeep`: it hands its depth to the join walk.

## What changes for a program

Nothing on the corpus, since none of the six caps fired there. Past the old limits, an operator tree
of literals more than 8 or 32 levels deep (`litTreeOps`' callers), or 64 (`CEX_DEPTH`), used to read as
"not a literal tree". It is now walked to its leaves. The tree is the program's own source, so the walk
is as deep as the parse.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 32ee97e56) |
| identity | IDENT |
| net compiler lines | −4 over 7 files (each walker's parameter, its guard term, the `depth ± 1` at every recursive call, and the callers' constants) |
