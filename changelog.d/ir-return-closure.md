## Codegen, memory & runtime (Track B)

- **IR coverage: a function value returned at its result's closure type.** An un-annotated function returning a function name, generic or not, returns that closure at the closure type its result takes per destination. Legacy writes the same closure ref with no conversion where none is recorded. The IR built it at the value's own closure rep and missed at `return coercion closure to closure`, the largest residue of the family (152 sole-blocker functions over the corpus files). It is now built at the result's rep (`retCloAt`).
