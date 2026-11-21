## Codegen, memory & runtime (Track B)

- **IR coverage: a literal-union atom boxed as its member string (box plan arm `atomAsStr`).** A `K` value delivered into a union that takes it as a string boxes under the string tag as its member string (`emitAtomToStr`). The plan had only the `K | null` arm (`atomStr`), so a plain atom fell to the ladder and the IR missed at `box ladder`. The plan now names the arm. Legacy's ladder rung and the plan share `emitHoleBox`, and the IR writes the same tag, the atom, `atomStrTail` and the box.
