## Infrastructure (Track F)

- **The oracle fuzz matches a filed wrong value by its row, not its cell id.** A known.txt line
  `D<id>  (emulated)` names an open row whose compiled reading the oracle can reproduce
  (`emulating`, interp.ts). A DISAGREE that exactly one such emulation explains is FILED-WRONG,
  counted per row, on any seed. D16497 and D16498 are the first two, at 13 lines of interp.ts.
  A smoke test fails once an emulated row closes, so the closing PR deletes its emulation.
- **The nightly's arith oracle leg reports and does not gate** (`fuzz.sh --report-only arith`)
  until `gen.ts` seeds 31-100 show 0 unexplained cells. The other generators, and every refusal
  ceiling, still gate. The arith ceiling is 8%; a 400-case sample reached 6.25%.
