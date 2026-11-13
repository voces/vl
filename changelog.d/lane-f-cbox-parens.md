## Type system (Track A)

- **A captured cell's minted element annotation is parenthesized by its type, not by parsing its spelling (step 7, D6).** `cboxElemNeedsParens` asks whether the element type is a union or a `| null`, instead of searching the emitter-minted spelling for a top-level `|`. A minted annotation with no element type is now a loud floor, and withholding the type makes it fire in each of the 3 programs that reach it. No behaviour change: all 24,223 sweep programs are byte-identical.
