## Codegen, memory & runtime (Track B)

- **IR: a union `==` builds in the IR** where its operand holds `null` (a `boolean | null` or `string | null` place), where its box or operand is a global or field read, and over the `i64`, `f64`, `f32`, closure and list arms; legacy's null legs now run through shared tails. Distilled "union compare plan" 9 → 2 cells; IR-only "start: union compare box" 21 → 8.
