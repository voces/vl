## Codegen, memory & runtime (Track B)

- **IR coverage: a `boolean | null` field narrowed to its boolean.** After `if o.f is boolean` or `!= null`, the field's read now builds in the IR as legacy writes it: the `i32` its niche holds, with no recover. Family H of `member record`, and a field read before a call that writes it: 2 functions leave the class, 1 matches. Legacy's bytes don't change.
