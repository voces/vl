## Codegen, memory & runtime (Track B)

- IR coverage, rowless map read (lane IR-C1): a `??` over an un-annotated map of `{ r: null }`, beside a plain record and a union arm of that shape, is read at the storage row's record, as legacy holds it. The distilled cells `b021775`, `b011298` and `b011299` are now fully claimed and byte-identical.
