## Type system (Track A)

- **L2 S3.0, one body-order stamp** (`refactor-notes/2026-11-16-l2-s3-0-body-order.md`): every
  `Bound` carries a `seq` from one counter (`bndPush`), replacing the let/bm-only `cstrSeqNext`, so
  S3's solver can walk a callee's bounds in body order. Identical.
