## Type system (Track A)

- **D16920: a record holding a set's functions in a list of lists, re-pointed at a smaller set, runs:** `recFnFieldsWiden` compares a field's list of functions at its leaf however deep, and the tag decision builds a record literal holding a list of lists, written whole over a held binding, at that binding's rep with its lists at the rep's fields (`ftRecListsAtRep`), as D16821 builds the initialiser. The nested-record spelling is filed as D17008.
