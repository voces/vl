## Infrastructure (Track F)

- **The oracle grades D16410 and D16293 (a):** a call refuses a type parameter that no argument's parameter names unless its destination type binds it (D16410), and `scripts/oracle/ruling-grid.ts` holds 20 cases across both rulings, with `write` and `check` modes to grade a compiler recording. On master, the compiler agrees with all 9 D16293 (a) cases and with D16410's 2 no-destination refusals. D16410's 9 destination-bound faces wait on its fix.
