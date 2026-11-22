## Codegen, memory & runtime (Track B)

- **IR coverage: a bundle parameter whose checked type is a closed function type.** Legacy stores every bundle parameter as its record of closures, whatever its checked type, so the IR now delivers and reads such a parameter at that record too (`bundleHeldTy` asks `vtKindOfParam`). This closes the `bundle argument closed parameter` miss.
