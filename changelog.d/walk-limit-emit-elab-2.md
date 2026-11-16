## Codegen, memory & runtime (Track B)

- Seven more elaboration walks in `emit_elab.vl` (held-value closing, set reach, canonical type keys, function ids, union-arm bindings) visit each type, value or declaration once instead of stopping at a fixed depth.
