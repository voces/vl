## CLI (Track C)

- **D16472 closed:** the native host prints every f64 as JS `String(v)` does: the fewest digits
  that round-trip, then the closest, then the even digit on a tie. 2^-24 prints
  `5.960464477539063e-8`, not the 17-digit exact value, and so do the other powers of two whose
  shortest form lies in the narrower gap below. `tests/vl_host_float_print_test.ts` compares the
  host with V8 over 11,208 values.
