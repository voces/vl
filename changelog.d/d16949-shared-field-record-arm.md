## Type system (Track A)

- **D16949 closed:** a field read across record arms whose shared field is a record in one arm and an atom in another (`({f: i32} | {f: {a: boolean}}).f`) runs at every position, where it was refused at emit.
- **D16951 filed:** the same read where one arm stores a list is still refused at emit.
