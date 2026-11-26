## Infrastructure (Track F)

- A value `if` arm with no prelude (a lone nested `if`) no longer reads as an unwalked prelude to
  the shape check, so the IR claims it (`expression if arm prelude unwalked` 11 → 0, 0 lost;
  lane COV-CLOS).
