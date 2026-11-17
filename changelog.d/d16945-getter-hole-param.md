## Type system (Track A)

- **D16945** (unfiled: D16945, filed by #8956)**:** a getter read through an un-annotated parameter bound to `F32x4 | null`, behind a null test (an if-guard, an early return, an else arm, or a `const` copy of the parameter), is refused at check with the sentence the non-null argument already gets: the read infers a record field, and a getter is not one, so annotate the parameter. On master it passed check and was refused at emit (`field access receiver is not a struct`). The annotated spelling runs.
