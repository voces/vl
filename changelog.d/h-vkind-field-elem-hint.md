## Type system (Track A)

- **Step 7: the shape interner's field recorders hand the field's element type.** The ref-list, nullable ref-list and other-code recorders now pass the type their row already holds. Before, they passed `-1` and had the element's name resolved again. The name fallback now reaches 122 programs, down from 408. Byte-identical over the sweep.
