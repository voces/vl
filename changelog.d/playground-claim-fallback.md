## Infrastructure (Track F)

- **The playground's Run path is tested for the IR claims-off fallback:** `tests/playground_claim_fallback_test.ts` drives `runProgram` through both fallback events. When a claim writes an invalid module, or meets a shared legacy helper's refusal, and legacy refuses, nothing runs and legacy's refusal shows with a note. When legacy builds, legacy's module runs with a warning. A valid claim takes no fallback. The playground already compiled through the LSP's fallback; these tests hold it there. The suite runs in CI's editor step.
