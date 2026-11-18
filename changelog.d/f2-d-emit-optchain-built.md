## Codegen, memory & runtime (Track B)

- **D16957 filed (open, clause 2):** an optional-chain read of a field of a record a map stores builds no shape when that field is a `??` over a read of a container adopted at a wider record (`ref valtype with no interned shape`). The same read without the optional chain runs.
