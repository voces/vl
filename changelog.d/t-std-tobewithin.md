## Type system (Track A)

- **`std:test` gains `toBeWithin(expected, tolerance)`** (external feedback AE-002): an absolute, inclusive tolerance beside jest's `toBeCloseTo(expected, digits)`, whose failure prints the measured difference (`expected 1.004 to be within 0.001 of 1 (differs by 0.0040000000000000036)`). A fractional argument for an integer parameter now names the parameter it meets (`argument 2: expected i32, got f64 — it is the parameter `digits: i32`, which takes a whole number`).
