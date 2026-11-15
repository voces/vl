## Infrastructure (Track F)

- **The oracle gains a higher-order generator:** `scripts/oracle/gen_hof.ts` (`fuzz.sh --gen hof`, and in `--gen all`) generates generic and un-annotated functions handed through higher-order generics, re-pointed lets, collections of closures, and random declaration order. 0 disagreements; its COMPILED-BAD cells reduce to four filed families, D16410 (a generic delivered through `sel<A>(f: (x: A) => A)` traps), D16411, D16412 and D16413.
