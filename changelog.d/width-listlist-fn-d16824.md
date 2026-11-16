## Type system (Track A)

- **D16824 closed:** a list of lists of records whose field holds un-annotated functions of
  different result types, built by literals at every level, now runs a call through
  `xs[i][j].f`; it was refused at check. Records nested in the element (D16835), a returned list
  of lists (D16836) and an annotated delivery (D16837) are filed.
- **D16838 closed:** a record literal holding an element of a list of lists, one of whose lists a
  kept maker builds at a wider record, now runs; it built a module that failed to validate.
