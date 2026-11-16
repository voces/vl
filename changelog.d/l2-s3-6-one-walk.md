## Type system (Track A)

- **L2 S3.6a: a call solves its callee's later bound kinds in one body-order walk**
  (`refactor-notes/2026-11-16-l2-s3-6-one-walk.md`). `callFtyPinCstrs`' RET..BM and MEM..UFCS
  segments become one walk, and `SS_ARG`'s validator still closes the first (D14724). 0 of 20,752
  programs and 0 of 5,383 filed witnesses move.
