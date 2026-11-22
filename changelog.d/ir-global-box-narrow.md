## Codegen, memory & runtime (Track B)

- **IR coverage: a union-box global read narrowed to a record, list or map arm.** A module global whose cell holds the union box, read where the checker narrowed it to a record arm (`variant`) or a ref-element list or map arm (`container`), is built as `RBoxNarrow` over the cell's box read. That is the local narrowed read's node (`boxNarrowArmOf`, `boxContainerReadOf`), written by legacy's own unbox tails. Before, only the atom arm was built.
