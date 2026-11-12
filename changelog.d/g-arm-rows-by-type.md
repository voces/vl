## Compiler internals (step 7)

- `isTestedRowIn` finds the variant row an `is` test holds by the found row's member type, and refuses a two-row match by heap, not by spelling. No program changes output.
