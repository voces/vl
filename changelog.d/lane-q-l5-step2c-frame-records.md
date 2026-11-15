## Codegen, memory & runtime (Track B)

- **Two emitter frames are records** (L5 step 2c): the element-by-element record copy's nine
  globals are one `RcElem`, and the shadow respelling's six per-frame tables are one `ShrFrame`,
  each opened fresh and restored as one value. GATE_SHORT
