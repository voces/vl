## Codegen, memory & runtime (Track B)

- **IR prints a box an `is` chain narrowed to `null`:** `print(v)` where the narrowing pins `v` to `null` but its value lives in a box prints from the box's own tag. Legacy re-enters the print at the argument's storage, with the plan's null arm pinned (`boxNull`, D2801). The IR missed it (`print boxNull`). It now builds the argument at its storage and lowers the union print's plan, box and tail inside the same storage scope and pin.
