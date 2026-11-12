## Codegen, memory & runtime (Track B)

- Step 7 L6: `nliInferLet` is deleted. It gave an un-annotated `let x = null` hole the checker had not filled a `T | null` union under a spelling, with no type. The checker types every hole: filled, or closed as `null`. A hole it did neither for is now a loud emit refusal, which no program reaches. A hole whose only writes go to a shadowing inner `let` stays the `null` type rather than taking a `i32 | null` box.
