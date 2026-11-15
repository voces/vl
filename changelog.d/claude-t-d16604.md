## Type system (Track A)

- **D16604 closed:** an integer constant `??` default that the left side's number type cannot hold now widens the join, as the `if` it spells does (ruling 4.3), whether it is a shift (`n ?? (1 << 40)`, a `const k = 1 << 40` read) or a radix pattern past 32 bits. Before, a folded shift or a wide pattern beside an `i32` operand was refused as overflowing `i32`, while the decimal of the same value already widened.
