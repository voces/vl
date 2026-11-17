## Codegen, memory & runtime (Track B)

- The rep layer's walks (`repNeverCanon`, value-box arms, softened members, function-alias peeling) visit each type once instead of stopping at a fixed depth; `emit_rep.vl` holds no walk limit.
