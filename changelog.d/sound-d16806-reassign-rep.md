## Infrastructure (Track F)

- **#8694's re-pointed-record regression is pinned.** That regression made a `let` of a record holding a list of lists of un-annotated functions, then reassigned, build invalid wasm. #8707 since fixed it. A fixture and the two `hole-fn-nested-list-in-record-field` `local_assign` cells, in a `distilled/named/` block `d16806-record-lists-reassigned`, now keep it running; `regress.vl` had missed it.
