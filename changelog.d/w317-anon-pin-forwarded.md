## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono: no `#anonN` pin is read by its label.** An object literal's parameter pin is typed at the literal's record, and keeps that type when the monomorphizer re-synthesizes it. `retStructRowIndex` finds the pin's row by type identity or the typed ladder, and the label read is deleted. That label-free answer matched the old label read in all 246 programs that reached it. Closes D16021. 10 programs drop an unused empty struct type from their module; their output is unchanged.
