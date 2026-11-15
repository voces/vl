## Infrastructure (Track F)

- **The first fuzz-nightly run on GitHub, triaged:** the job works end to end. Of its 20 new oracle disagreements, 9 are the known D2617 radix-width class and two are new compiler rows, D16471 (`>>` over a negated radix literal computes at 64 bits) and D16472 (the native host prints 2⁻²⁴ with 17 digits). The other 9 go to lane O and to the owner of the radix rulings.
