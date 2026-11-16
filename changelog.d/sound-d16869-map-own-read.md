## Type system (Track A)

- **D16869 closed (ruled: refuse the mix):** an un-annotated map's record value that is read into a union of records and also at its own record type is refused at check, the same way an annotated map's read is. Before, it built a module that failed to validate. This applies equally to a map handed back by a function with no declared result.
