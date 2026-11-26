## Codegen, memory & runtime (Track B)

- **IR:** a record that stores a field as `T | null` and a record reading it as `null` stand as one value where one heap holds both, either one a variant (`convert record -> record`: D17386, rowless map reads, rowless literals at a variant arm).
