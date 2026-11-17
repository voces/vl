## Type system (Track A)

- **Written-binding join at check (STORE B1):** `setBindWrittenJoin` gives the functions a written binding holds in an instance (the declared functions written to it and what the instance hands the parameters written to it); under `$VL_INST_KEYS` it is shadowed per key against the elaboration's join. Nothing reads it yet; an unarmed compile is unchanged.
