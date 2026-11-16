## Type system (Track A)

- **L2 S3.6a: a call solves its callee's bounds in one body-order walk**
  (`refactor-notes/2026-11-16-l2-s3-6-one-walk.md`). `callFtyPinCstrs`' three fixed segments
  become one `ifaceSolveAt` over every kind. 0 of 20,750 programs move.
