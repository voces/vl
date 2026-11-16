## Type system (Track A)

- **D16750 closed:** a literal binding whose nested record lands in nullable, narrower storage is built at the destination when nothing reads the field it drops, and refused at check with D2996's sentence when something does — it is no longer built at the narrower shape and refused at emit.
