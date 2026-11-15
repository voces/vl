## Infrastructure (Track F)

- **A type's canonical id** (type hash-cons stage 3b): `emit_ty_seal.vl` interns each type
  bottom-up through `intern.vl`, as `tySameSet`'s equality (`tyCanonSet`) and as `tySameSpelled`'s
  (`tyCanonSpelled`), with no render. A recursive declaration is cut at its name. Under
  `$VL_ID_SHADOW` it shadows the three emit comparers and reports `canon` agreement rows. With the
  shadow off, output is byte-identical.
