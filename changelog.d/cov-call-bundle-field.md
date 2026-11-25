## Codegen, memory & runtime (Track B)

- **IR claims a call through a record field holding a lambda's bundle:** `o.f(4)` and `o.f(1.5)` where `f: lap((a) => a + 1)` holds one closure per signature, picked at the call's own (`emitHolderCall`). `method f` falls from 8 rows to 1 (legacy's own set-split refusal, D16747). Legacy's bytes are identical across `tests/cases`, distilled, the probes, the witnesses and the self-compile.
