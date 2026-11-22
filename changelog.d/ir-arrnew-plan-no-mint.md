## Codegen, memory & runtime (Track B)

- **IR: the builder asks whether an `__array_new__` site is refused without minting its list pair.** `arrNewPlanOf` fills its backing and wrapper types through `fa64Ty()` and its siblings, which mint on first ask. The builder asked it only for its refusal, so a claimed function's build could mint a pair ahead of legacy's order. The refusal is now its own `arrNewWhyOf`, which the builder asks; the lowering still asks `arrNewPlanOf` where legacy does. Legacy bytes are unchanged.
