## Infrastructure (Track F)

- **The covariance walk behind record deliveries stops at a cycle, not at twelve levels** (type
  hash-cons stage 6b). It already kept the pairs it was inside; its union step now keeps a path of
  the unions it has entered. Output is byte-identical.
