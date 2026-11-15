## Infrastructure (Track F)

- **A radix literal in a float context is the value its digits spell** (owner ruling 4.1, revised): spec T2.3 says so, the oracle models it, and `scripts/oracle/radix-float-grid.ts` writes the 182-cell acceptance grid, which today's compiler meets on 138 cells (lane N moves the rest). Radix constant trees at a float wait on ruling 4.2.
