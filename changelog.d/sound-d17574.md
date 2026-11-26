## Codegen, memory & runtime (Track B)

- **D17660, D17576 closed:** a parameter delivered at its argument's build row (`#r.<i>`) has its reads, in nested closures too, stamped at that row in the elaboration, so a hole call keys its callee there and a record literal over the read is built there; a list callback keyed at its build answers for its frame. D17577 (a closure returning that read) stays open.
