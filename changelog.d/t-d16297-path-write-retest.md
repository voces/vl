## Type system (Track A)

- **D16297 closed:** writing a narrowed field or list cell's other member runs while a nested function only re-tests it, or does not read it; a nested function that reads the narrowed value still holds the write to the narrowing.
