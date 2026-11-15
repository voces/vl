## Codegen, memory & runtime (Track B)

- **The emitter's `body: u8[]` parameter is gone** (L5 step 2b, engineering review Small 8): 551
  `wasmEmit.vl` functions passed the writer's own buffer from call to call; the parameter and its
  2,066 call-site arguments are removed and the three length reads use `curBuf`. Byte-identical over
  20,223 corpus programs and the L2 build; net −1,110 lines.
