## Type system (Track A)

- Four checker walks over types (empty holes, unions, the error type, representation holes) visit each type once instead of stopping at a fixed depth, so a recursive type no longer relies on the depth to end them.
