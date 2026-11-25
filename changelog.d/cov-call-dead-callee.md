## Codegen, memory & runtime (Track B)

- **IR claims a call through a field that no function reaches:** `z.f()` where a guard leaves the field, or its receiver, typed `null` or `never` in the instance, including `a?.f(x)` off a receiver that is only ever `null`. It is `unreachable` (`RDeadNever`), padded with a second where the call is typed `never`, and as a statement followed by the `drop` legacy writes. `method f` falls from 21 rows to 8 (the bundle-record family). Legacy's bytes are identical across `tests/cases`, distilled, the probes, the witnesses and the self-compile.
