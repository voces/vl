## Type system (Track A)

- **D14782 closed:** a `let` list of lists of un-annotated functions re-pointed whole, returned and called through an un-annotated callee (`let u = [[inc, dbl]]; u = [[dbl, inc]]; return u`), or re-pointed in a generic's instances, runs, where it was refused at emit (`nested arrays are not supported`); the list-of-lists pins of a `let`, its re-points and a record field are one depth-generic walk (`monoPinListNest`), emit_mono.vl 908 → 905 functions.
