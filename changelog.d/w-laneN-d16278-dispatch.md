## Type system (Track A)

- **D16279 closed (clause 1), D16278 narrowed:** a list of records of un-annotated functions whose results differ, built by a call and bound (`const L = mk().a`), now dispatches per member when an un-annotated parameter calls each element's field, by index and by `for`; the `for` spelling trapped (indirect call type mismatch) and the index spelling was refused at emit. A literal list walked by `for` through a parameter runs too. The list handed straight to the parameter is still refused at check (D16278).
