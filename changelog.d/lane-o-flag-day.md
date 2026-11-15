## Infrastructure (Track F)

- **The oracle's VL inputs follow the return rule (#8383).** Three templates still ended a
  block body in a bare value, so every program built from them was refused at check and agreed
  vacuously:
  - `gen_data.ts`'s `mk` (all 2,000 data cases);
  - `gen.ts`'s `tr_<type>` helpers (all arith cases);
  - `join-grid.ts`'s `kind` (all 64 cells), and the `argf64` position of `radix-float-grid.ts` (26 cells).

  Each now writes `return`.
