## Type system (Track A)

- **D16951 closed:** a field read across record arms whose shared field is a list in one arm and an atom in another (`({f: i32} | {f: i32[]}).f`) runs at every position, where it was refused at emit.
- **D16952 filed:** the same read where the list holds records is still refused at emit.
