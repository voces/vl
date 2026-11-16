## Type system (Track A)

- **D3956 closed** (clause 2): a generic function handed from a closure to another closure's
  parameter typed by the enclosing generic's type parameter is instanced at that parameter's type
  in each instance, through a binding or a list element; it was a loud emit reject.
