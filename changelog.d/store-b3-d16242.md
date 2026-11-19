## Type system (Track A)

- **D16242: a record whose field reads a list binding read elsewhere too, re-pointed at a literal of another function, runs:** `letFieldListsWidenAt` widens the field through such a read and keeps the binding's own set, as a parameter's read keeps its (D15455); `ftRecFieldReadsNote` decides the read's set with the record's; and `ftHoldCtxOk`'s field arm takes a holder whose record holds a set decided with it.
