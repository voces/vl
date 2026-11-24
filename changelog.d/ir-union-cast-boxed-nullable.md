## Codegen, memory & runtime (Track B)

- **IR coverage: a union cast (`as?`, `as!`) over a boxed `T | null` operand.** Its null is the null-tagged box legacy's tag test reads, so the cast takes the same tag test and tail as over a box. `union cast operand rep`. No legacy bytes moved.
