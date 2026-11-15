## Type system (Track A)

- **D16493 closed (now a loud emit reject):** composing a generic with a hole function whose only instance is at another type no longer traps the compiler. `compose(gid, hid)(5)` after `hid("a")` is refused with D16412's sentence, as its neighbouring spellings are. The elaborator's readers no longer ask the write-scan index about a node minted after it was built, and a function argument that binds a type parameter an earlier argument bound to a different closed type refuses; before, that second binding was dropped and the module failed to validate.
