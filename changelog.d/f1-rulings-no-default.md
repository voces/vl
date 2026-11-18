## Type system (Track A)

- **Ruled, not yet built (DECISIONS.md "No default type"):** an unresolved type parameter or empty container element has no `i32` default; it is inferred from its uses, an `is K[]` arm's push among them, and contradictory uses are refused at check. A push through an `is K[]` arm is judged by the list's real element type, not its storage. This supersedes D4551's default.
