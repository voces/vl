## Infrastructure (Track F)

- **The emitter's `tySame` and `tyEq` are graded against canonical ids** (type hash-cons stage 4h,
  a shadow that is off by default). Emit-side callers go through `tySameSealed` and `tyEqSealed`.
  Under `$VL_ID_SHADOW` they compare each answer with `==` on a `tySame`-equality id (`CF_SAME`)
  or the `tyEq` id. Over 15,472 programs, the ids never call equal two types the comparer calls
  unequal. The comparer's "equal" splits into two ids 127 times, all at recursive types. Output is
  byte-identical.
