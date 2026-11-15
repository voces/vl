## Type system (Track A)

- **Maps and sets, discovery:** eight position matrices (`ms-*`) over maps of records, functions, lists, nullable values, nullable records, nullable functions and maps, and a set of strings: 360 of 368 graded cells run, none silent, wrong or trapping. Filed: D16565 (a `for` over `.values()`/`.keys()` of an un-annotated parameter reports its loop variable as undeclared) and D16566 (an accumulator over a null-guarded walk of an un-annotated map parameter does not settle). The read-only map-parameter cells join D15161.
