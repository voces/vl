## Type system (Track A)

- **D16921 (bare list):** a `let` list of lists of un-annotated functions nothing calls, re-pointed at another (`let r = [[inc0]]; r = [[dbl]]`), runs, where it was refused at emit; the row stays open for a list of lists in a record field.
