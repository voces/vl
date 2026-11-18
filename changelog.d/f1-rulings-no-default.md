## Type system (Track A)

- **Ruled, not yet built (DECISIONS.md "No default type"):** an unresolved type parameter or empty container element has no `i32` default; it is inferred from its uses, an `is K[]` arm's push among them, and contradictory uses are refused at check. A push through an `is K[]` arm is judged by the list's real element type, not its storage. This supersedes D4551's default.
- **Ruled, not yet built (DECISIONS.md, D2772 (a)):** a generic call whose argument is a union of list or map types, each member binding `T`, dispatches on the tag to each member's instance, with the union of their results; at most two such arguments per call, past which #9015's refusal stands.
