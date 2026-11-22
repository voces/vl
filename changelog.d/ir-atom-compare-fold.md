## Codegen, memory & runtime (Track B)

- **IR coverage: a folded atom compare, and a direct `else if` at a destination's type.** `a == b` over two sides typed as single string literals is each side's id dropped, then the constant, through tails legacy's fold shares (`atomFoldSideTail`, `atomFoldTail`). An `if` chain built at a destination's type takes a direct `else if` as a link, as `emitIfExprAs` walks it.
