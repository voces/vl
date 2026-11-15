## Type system (Track A)

- **D16274 closed:** a closure in a deep `is` arm that writes the tested place runs: the converted copy is read up to the call the checker ends the narrowing at (the writer's own call, an alias's, or a call handed the writer), and the writer's body reads the place itself. An assignment nested in an expression still refuses (D16474).
