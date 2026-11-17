## Type system (Track A)

- **D16953 filed (clause 1):** a generic list of a pinned union stored into a pinned record's field (`const b: { v: (V | IM)[] } = { v: xs }`) builds invalid wasm.
