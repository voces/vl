## Type system (Track A)

- **D9073 re-graded:** a type parameter only a generic's result names is bound by an annotated
  destination, by the D16410 ruling. `const ys: string[] = cnst(3)`, `const xs: string[] = mk()`,
  `const v: string | null = z()` and `const t: IdTable<Tex> = IdTable()` run. A callback face
  (`[3].map(cnst)`) and a call with no destination stay refused.
