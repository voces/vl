## Type system (Track A)

- Six assignability walks in `check_assignable.vl` (value rows, generic function-value demands through literals, list arms of unions, function-shape clashes, open function slots, call-result copies) visit each type, pair or node once instead of stopping at a fixed depth.
