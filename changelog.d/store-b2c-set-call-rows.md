## Type system (Track A)

- **Set-call rows (STORE B2c):** a call through a function set records an instance-vector row for each named member it hands a set to, so the storage decision sees those instances at check; under `$VL_INST_KEYS` the rows are shadowed against the elaboration's instances (277 rows, all expected, 0 extra). 1 set leaves the late tag residue (397 → 396); output byte-identical.
