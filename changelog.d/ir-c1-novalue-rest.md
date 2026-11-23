## Codegen, memory & runtime (Track B)

- **IR coverage: a never `??` default in the last three null-arm builders.** A `??` whose default is a call that never returns is now built as that call's statement in `coalNulStr` (a `string | null`), `coalBoxStash` and `coalBoxFieldScalar` (a shared `scalar | null` field), as #9623's helper does in the other six. That covers every D16023 shared-`let` cell read. tests/cases `rep novalue` goes from 16 functions to 9.
