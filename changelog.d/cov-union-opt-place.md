## Codegen, memory & runtime (Track B)

- **IR covers `v.j?.a ?? d` over a field a record union shares, read on the box tag (lane COV-UNION):** the shared-field dispatch (`RSharedRead`) over a box variable or a global is a read the lowering writes again whole, as legacy re-emits it at each use, so the `??`'s receiver re-reads it.
