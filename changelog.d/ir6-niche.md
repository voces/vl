## Codegen, memory & runtime (Track B)

- **Fixed: an `is` test its receiver's nullable niche cannot hold dropped the receiver's effects
  (D17031).** `mk() is C` over `A | null` was `false` without ever calling `mk`; the receiver now
  runs and is dropped, as a dead null test's operand already was, in a value, a condition, a loop
  test and an `||` alike.
- **IR coverage: an `is` test over a nullable reference niche** builds in the IR: the test the niche
  cannot hold as `false` after its receiver, and the test of the niche's own type as its null test.
