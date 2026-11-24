## Codegen, memory & runtime (Track B)

- **IR coverage: a field read off a narrowed `V | null` member.** A plain field read on legacy's `nulVariant` arm (a recursive record's `next` field narrowed by a null test) now builds in the IR as legacy writes it: the receiver, `ref.as_non_null`, the variant's field and its `string | null` recover. Family C of `member record`: its 3 functions match, the corpus cell among them; legacy's bytes don't change.
