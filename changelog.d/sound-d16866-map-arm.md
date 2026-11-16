## Type system (Track A)

- **D16866 closed (ruled: run it):** an un-annotated map's record literal, read back and delivered to a union of records such as `Node | null`, runs. The map's value is built at the arm it lands on, as a `const` of the literal is. Annotated maps keep refusing, by field invariance, and reads delivered to two disagreeing unions are refused at check. D16869 files the mix of an arm read with a read at the map's own record.
