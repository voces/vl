## Type system (Track A)

- **D17080 closed:** a structural bound `{ mn(T): T }` is satisfied by whichever candidate of a receiver-overload set takes the instance type, as the member call resolves it; before, only the first-imported candidate counted, so `lo(b1, b2)` was refused and swapping the imports flipped which call was. A type two candidates both take is refused with the member call's ambiguity message.
