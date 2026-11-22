## Codegen, memory & runtime (Track B)

- **IR coverage: a binding holding a returned bundle record.** `const r = lap(...)`, where `lap` returns a parameter it calls at two signatures, is held by the IR as that record, as legacy's cell holds it. So are its reads, an open-typed direct call's result, and a function's recorded result that legacy returns as the record. Legacy's decisions are split out as `holderRecordTy` and `fnRetHeldAsBundle`, which legacy and the IR both ask.
