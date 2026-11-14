## Infrastructure (Track F)

- **`scripts/dup-struct-rows.vl` sees a copied type:** besides rows folded onto one type, it now reports pairs of struct rows that hold no function or set id and whose recorded types are `tySame` under two arena indices, and exits 1 when it finds one. D16152's witness fires it on a pre-#8004 compiler; self, fixtures and corpus read 0 today.
