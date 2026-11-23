## Codegen, memory & runtime (Track B)

- **IR coverage: a generic's `null` instance capturing its `null`-typed parameter.** Legacy holds such a capture at `nullref`, and `capRepFor` now accepts that valtype for a `null` rep. A read of the capture on legacy's `nulnone` arm is its destination's null, as a `null` unit local's read already is (`captureRead`). Legacy's bytes don't change. Filed along the way: D17062, a lambda literal returned at a generic's `() => U | string` result is refused at its second distinct instance.
