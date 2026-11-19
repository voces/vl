## Type system (Track A)

- **D16937 closed:** a record literal holding an un-annotated lambda, written into a list of records whose functions return different types (`xs.push({ f: (x) => x * 3 })`), runs, the lambda stored as an id of the list's set, where it was refused at emit; D16998 (the record bound first) and D16999 (an annotated lambda pushed) filed.
