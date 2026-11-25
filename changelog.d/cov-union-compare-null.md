## Codegen, memory & runtime (Track B)

- **IR covers more union compares on the null leg (lane COV-UNION):** an operand read after a parked call box (a global, field or element the call may write) is read again at each use; a `K` read narrowed past its null takes the `K | null` leg over the same id bits; a `boolean | null` operand parked against a null-free box is its niche's i32.
