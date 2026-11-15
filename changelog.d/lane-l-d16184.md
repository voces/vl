## Type system (Track A)

- **D16184 closed:** an assignment to a `K | null` local used as a value (`return k = "ww"`, a tail write, `print(k = …)`) yields the member's string instead of building an invalid module or printing the atom's number. **D16343** files the record-field face.
