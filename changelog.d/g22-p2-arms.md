## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** the compare-frame scans for a union operand (`leqNoteUnionArms`, `unionArmsNeedCloEq`) read each arm's box kind from the arm's type rather than parsing its name. No output moves.
