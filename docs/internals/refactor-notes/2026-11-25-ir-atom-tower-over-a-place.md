# IR atom tower over a place (2026-11-25, lane COV-IS)

- **The miss**: `atom tower place`. Legacy's string-to-atom tower (`strToAtomArmOf`'s `chain`)
  reads its source again for each tested member; the builder (`atomTower`) took a name only.
- **What landed**: a place other than a name (a field read, an index) is built again per member,
  past the node's own tower hook (`exprAtPre` with no pre-path), when the read is effect-free
  (`exprEffectFree`, unchanged). A storage-marked read was tried first and failed verifier rule 2
  (a stored field read is its declared box), so the read is the plain one.
- **The class** (`VL_IR_SHADOW=2`, CENSUS's list at `0c946159`, 13 rows):
  `unions/layout-family-string-field-read-as-atom-positions-runs.vl` (retK, argK, gen, letK) and
  `…-hazards-runs.vl` (listElem, paramEq, letEq) now match; the latter keeps one `pre-path atom
  hook`. `literal-unions/index-place-literal-else.vl` (3), `unions/inferred-string-list-is-atom-list.vl`
  and `soundness/list-element-narrowing-map-copy-runs.vl`'s start move on to `index element coercion`.
- **Q58 position sweep**: the two layout-family programs above are the class's own position
  matrix (return, argument, generic, `let`, list element, parameter compare, `let` compare).
