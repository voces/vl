## Infrastructure (Track F)

- **The first fuzz-nightly run on GitHub, triaged:** the job works end to end. Of its 20 new oracle disagreements, 9 are the known D2617 radix-width class and three are new compiler rows: D16471 (`>>` over a negated radix literal computes at 64 bits), D16472 (the native host prints 2⁻²⁴ with 17 digits) and D16473 (`as f64` over a literal join reads a radix arm as its pattern). The other 8 go to lane O.
