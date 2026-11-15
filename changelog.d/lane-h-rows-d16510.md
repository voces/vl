## Type system (Track A)

- **D16510 filed:** an empty list handed to an un-annotated callback parameter, called with callbacks
  of two list element types, builds an invalid module (check-clean, clause 1).
- **D16511 filed:** the late-demand ratchet does not count an argument-keyed instance that mono
  demands during emit (an instrument blind spot).
