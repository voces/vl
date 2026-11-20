## Codegen, memory & runtime (Track B)

- **IR verifier, packed list literals:** a `u8[]` literal's elements are built as plain i32s, which
  its backing truncates. The verifier now admits them at a `u8` element rep instead of rejecting the
  fragment ("an element's rep is not the list's"). A verifier miss now names its message. No
  emitted byte moves.
