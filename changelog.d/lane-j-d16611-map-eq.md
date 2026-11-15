## Type system (Track A)

- **D16611 closed:** `==` between a union and a value that can both hold a map (`A | i32` against `A` where `A` holds a map field) is refused at check with the map-equality contract, as a bare map compare is. Before, it passed the check and was refused by the emitter. Filed D16612 (a union of two numeric map-list arms fails the type-section count).
