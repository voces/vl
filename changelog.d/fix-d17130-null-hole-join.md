## Language & checker (Track A)

- **Fixed D17130** (clause 1): a value `if` joining an inferred-null binding (`const n = null`) with a record was typed `_ | null`, so `== null`, `?.`, `??`, `print`, an un-annotated binding and a union argument read the record arm as null. The join is now `T | null`, and the binding's own inference is untouched. `print` of it is the usual nullable-record refusal; `??` over it (D17200) and passing it at a union-of-records parameter (D17201) are loud emit refusals for now.
