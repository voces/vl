## Type system (Track A)

- **One storage decider, the set-binding shadow:** the check now derives which function sets reach each un-annotated parameter, per call (`check_set_bind.vl`). This is the fact `fnTagRedecide` takes from the elaboration today, built in the shape L2 S3's solver will produce. Nothing reads it yet. `$VL_IFACES` prints a `setbind` line comparing it with the elaboration's notes: over 6,477 `@run` programs, 907 calls through a set agree, 1,091 are seen only by the elaboration (340 programs), and 28 only by the check (17 programs).
