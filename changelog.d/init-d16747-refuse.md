## Type system (Track A)

- **D16747 (stopgap):** a set of functions returning different types, handed to an un-annotated
  parameter and left closures, is refused at emit where a call through it would run a member at
  another member's signature; it trapped. The row stays open for a dispatch per member.
