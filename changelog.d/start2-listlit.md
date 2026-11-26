## Codegen, memory & runtime (Track B)

- **IR claims a list literal built at a wider number list in a pinned instance:** a hole forwarder's `[v]` reaching an `f64[] | null` parameter is built at that list, with each element widened, as legacy writes it. `functions/hole-leaf-literal-through-forwarder.vl` is now fully claimed; its `outerE` read `convert list -> nullable`. Claimed and claims-off builds are byte-identical.
