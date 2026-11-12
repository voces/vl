# Step 7 L6: each `unionNameOfExpr` call saves and restores its row slot, 2026-11-12

#7411 gave `unionNameOfExpr` a row channel: the rung that answers records the row behind its
name in `unNameRowLast`, and `unionNameRowOfExpr` hands it back. The slot was reset at each
call's entry. So a rung that answered without recording a row inherited whatever a nested
`unionNameOfExpr` call had recorded. The `??` arm asks the hub of each operand, then may answer
by another rung, which would hand back an operand's row beside the join's name. Each call now
saves the slot, clears it, and restores it on the way out. The completed call's own row goes to
`unNameRowOut`, which `unionNameRowOfExpr` reads at once. Both slots are cleared per program in
`classifyStateReset`.

The corpus never showed the stale row. #7411's probe found 0 rows differing from the name's.
This is a fix to the design, made before more rungs record rows.

The base is master `784c38bf`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,984 programs.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,984 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** `emitter-state-audit --check` is clean. `rep-fuzz-check.sh` is exact.
  `cases_wasm` passes 7,479 with 0 failed. lint-self is clean.
