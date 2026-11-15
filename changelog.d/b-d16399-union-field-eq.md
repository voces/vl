## Type system (Track A)

- **D16399 closed:** `==` over a record whose field is a union and a record whose field is one of its members runs in either order, testing the arm as a bare union-vs-member compare does. Before, it was refused at check when the union side was on the left.
