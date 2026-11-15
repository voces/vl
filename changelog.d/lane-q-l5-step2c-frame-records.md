## Codegen, memory & runtime (Track B)

- **Two emitter frames are records** (L5 step 2c): the element-by-element record copy's nine
  globals are one `RcElem`, and the shadow respelling's six per-frame tables are one `ShrFrame`,
  each opened fresh and restored as one value. Byte-identical over 20,316 corpus programs and the L2 build;
  net −5 compiler lines, 15 hidden globals become 2 records.
