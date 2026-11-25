## Codegen, memory & runtime (Track B)

- **D17241, D17242 closed:** an IR claim that falls back to legacy rolls back the literal atoms it interned and the read reps it remembered, so the fallback's bytes equal the claimless build's; claim scopes never nest (a nested one fails hard). The `sweep` label job runs `scripts/claim-refusal-survey.sh`.
