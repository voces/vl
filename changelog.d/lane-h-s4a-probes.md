## Infrastructure (Track F)

- **A layout id, shadowed against the rep tree** (type hash-cons stage 4a): `tyCanonLayout` keeps a
  union alias, a nullable, a one-member union, a tagged function and a brand apart where
  `tyCanonSpelled` folds them. Under `$VL_ID_SHADOW` it is graded one-way against `repTreeOfTy`,
  which may split an id but never merge two. Six new `@run` cases cover `tySameSpelled`'s equal
  side and the literal-union alias. D16435 is filed.
