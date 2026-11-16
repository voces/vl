## Type system (Track A)

- **D16835 closed:** a list of lists of records whose nested record holds un-annotated functions
  of different result types, built and pushed by literals, now runs a call through
  `xs[i][j].a.f`; it was refused at check. An index-assigned literal (D16849) is filed.
