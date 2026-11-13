## Self-hosting & modules (Track H)

- **Step 7:** a union's struct variants and their fields are chosen by each arm's type, not its spelling, so an intersection arm (`Node & {v: i32}`) is a real variant (D16030). The union key's licence compares variant slices by type.
