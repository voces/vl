## Codegen, memory & runtime (Track B)

- IR heap identity 4a (lane IR-M1): a cell or capture heap note that rested on its record type having no heap of its own now fails the emit if that type gains one later (a guard; no stale note is constructible today).
