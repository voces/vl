## Infrastructure (Track F)

- **The oracle never counts a checker refusal as agreement.** A program `vl check` refuses is
  AGREE only when the oracle refuses it too. One the oracle runs is REFUSED, a column of its own.
- **`fuzz.sh` fails a generator whose share of refused cases passes a ceiling.** The default
  ceiling is 2%.
  - The pre-#8430 data generator (100% refused) now fails the run.
  - arith (59%) and hof (5%) carry named ceilings until they are triaged.
- Four more hof cells of D16493 are listed.
