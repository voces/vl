## Codegen, memory & runtime (Track B)

- **D17087 closed** (lane IR-M1, heap identity batch 2a): a record global whose checked type has no struct heap is held at its storage row, and a field that row keeps as a union box is read through legacy's unbox; the starts are built in IR.
