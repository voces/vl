## Codegen, memory & runtime (Track B)

- **IR covers a literal union's `.length` (lane COV-UNION):** an atom receiver is decoded to its member string (`deliverStr`) and its length read off the string header, as legacy's `atomStr` arm writes it (`member atom` 7 → 0).
