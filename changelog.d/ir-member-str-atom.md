## Codegen, memory & runtime (Track B)

- **IR coverage: a literal-set field its layout family stores as its string, read as its atom.** A field such as `kind: "circle" | "round"`, sitting beside a `kind: string` field of the same tag in the same union, is stored as the string by the whole family. Its read now builds in the IR as legacy writes it: the field read at the string it holds, which its consumer takes as it is. Family E of `member record`: its function matches. Legacy's bytes don't change.
