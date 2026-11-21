## Testing

- **IR shadow row files grade coverage as a floor:** a `tests/ir-shadow-rows/` file expects `covered >= N` and `matched >= N` (with matched = covered graded in every row), and `vl_ir_shadow_test.ts` refuses an exact count, which another PR's coverage would break; named-miss and mismatch counts stay exact.
