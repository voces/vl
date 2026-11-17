## Type system (Track A)

- **Storage shadow (STORE B0):** under `$VL_INST_KEYS`, the check reports one row per call, function-holding parameter and set, with the facts a storage decision per (KeyId, parameter) reads and why a row lacks them; nothing reads it, and an unarmed compile is unchanged.
