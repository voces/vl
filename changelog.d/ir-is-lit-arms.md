## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` test at the `litArms` rung, first slice.** `m[k] is <scalar>` and `m[k] is null` over a scalar map read are its has probe, as `emitMapHas` writes them; a ref niche's `is` is its own null test (`RNulTest`); and `nicheNever`, `atomTrue` and `memberTrue` are their constants, built only over a re-readable receiver, since legacy writes no read before them. `atomEq`, `memberEq`, `boxLits` and `numBox` are named misses.
