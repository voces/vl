## Type system (Track A)

- **D2681 closed:** a record annotation in a generic body whose field is a union the pin mints (`{ v: V | IM }` at `V := string`) runs, nested or beside other fields, where it was refused at emit.
- **D16947 filed:** such a record whose field is a list of that union (`{ v: (V | IM)[] }`) is still refused at emit when the field is read.
