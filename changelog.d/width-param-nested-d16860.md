## Type system (Track A)

- **D16860 now a loud check reject:** a list of records whose nested record holds un-annotated
  functions of different result types, called through that field from an un-annotated
  parameter, is refused at check; it trapped calling one function at another's signature.
