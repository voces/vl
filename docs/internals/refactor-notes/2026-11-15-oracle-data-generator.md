# The oracle's second generator: data, not arithmetic (2026-11-15)

`scripts/oracle/gen_data.ts` generates well-typed programs on the axis that `gen.ts` leaves out.
`scripts/oracle/fuzz.sh --gen data` runs it; `--gen all` runs every generator, and the `oracle` leg
of `scripts/fuzz-sweep.sh` now uses `all`. Its programs exercise:

- evaluation order, through printing calls in call arguments, list elements, record fields, index
  targets and `&&`/`||` (E10.1, E4.2);
- records, lists and maps under mutation and aliasing (T4.2, T6.2);
- closures that capture by reference (E14.2), including loop variables (S5.8) and closures stored
  in a list;
- linked records read with `?.` and `??`, a tagged union narrowed by `is`, `pop`, spreads and
  list `+`;
- string building, interpolation, `.length` over multibyte text, `for c in s`;
- `match` over an integer, shadowing in a block, early `return` from a loop, and record equality.

**Measured.** 40 seeds × 250 programs = 10,000 programs on master `5683d3b2`'s seed:

- every program passes `vl check` and runs;
- the oracle runs all of them (100% in its subset);
- **0 disagree**.

That is a negative result for this axis at this depth, and it is reported as one.

The first 5,000 programs gave 21 disagreements, all of two kinds and both the oracle's, now fixed:

- **Evaluation order of a plain assignment.** The oracle evaluated a plain `=`'s right side before
  its place, so `xs[t("i", 0)] = t("v", 1)` printed `v` before `i`. E10.1's source order puts the
  place's own operands first, as E7.2 states for the compound forms. The compiler was right.
- **A trailing empty line.** The `diff` reader stripped every trailing empty line of compiled stdout,
  so a final `print("")` looked missing. It now drops only the last line terminator.

The first draft of the generator also emitted 6 programs that read a closure name back after the
counter had moved. `vl check` rightly refused them as undeclared, so they were generator bugs.
