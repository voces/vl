## Type system (Track A)

- **D16877 closed: a member call on an un-annotated parameter from inside a closure is picked per
  instance** (`refactor-notes/2026-11-16-l2-closure-receiver.md`). Each instance's lambda clone
  re-dispatches its body, in either order of instances, and a both-orders matrix guards it.
  D16882 filed (a string or list built-in on a hole parameter refused as a row demand).
