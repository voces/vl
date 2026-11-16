## Type system (Track A)

- **D16881 marked blocked on S3.4d:** moving D16747's split refusal from build to `vl check` needs the closed per-instance callee signature, which mono decides after check; a check-time approximation would refuse a program that runs today through the value-flow rewrite. The row records the measurement.
