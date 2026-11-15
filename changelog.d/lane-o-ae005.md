## Type system (Track A)

- **A constant refusal quotes a folded float as `print` would** (AE-005): every refusal that prints a float constant goes through one shortest-round-trip printer (`cexShortest`), so `0.1 * 3` reads `0.30000000000000004`, not its 54-digit exact expansion or a cut prefix; a float a fold made names the expression it came from (`from constant folding of \`0.1 * 3\``), and a fraction at an integer type names the fixes `floor(…) as! i32`, `round(…) as! i32` or `trunc(…) as! i32`.
