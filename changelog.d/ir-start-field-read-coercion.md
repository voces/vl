## Codegen, memory & runtime (Track B)

- **IR coverage: a plain record field whose stored rep differs from the read's own.** Examples are `r.f.length` on `{ f: [[inc0]] }` with a hole function, a list field read off a call's list result, a record narrowed from a map read and stored in another record, and a map field of a record read from a map. The IR now reads the field at the operand's stored-row kid, as legacy does, and hands its consumer that temp. Legacy's bytes don't change. Closes D17165, D17166, D17168 and D17169; D17167 narrows to its list's element coercions.
