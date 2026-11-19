## Type system (Track A)

- **D16937, D17000 closed:** a record literal holding an un-annotated lambda, written into a list of records whose functions return different types (`xs.push({ f: (x) => x * 3 })`), runs, the lambda stored as an id of the list's set, where it was refused at emit; a call through such a list made before a lambda is written into it is typed with the lambda's result, where it built invalid wasm (a later lambda of a wider result than the call's is refused at check, naming the order); D16998 and D16999 filed.
