## Infrastructure (Track F)

- `scripts/mono-tyaram-grid.sh` grades again: its generator writes `return` in each cell's block body (the bare tail value it wrote had been refused at check, so all 261 cells came back REJECT under "no BAD cells"), and the grid now fails when fewer than 240 cells pass `vl check --codegen`. On current master: 252 OK, 9 REJECT (the `par` cells whose call-site literal names `T` outside the generic), 0 BAD.
